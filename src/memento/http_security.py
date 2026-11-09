"""Fail-closed customer HTTP boundary, independent of metric calculations."""
from __future__ import annotations

from contextvars import ContextVar
import os
from pathlib import Path
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from .security import SecurityPolicy, ServingSecurity, audit

current_policy: ContextVar[SecurityPolicy | None] = ContextVar('customer_policy', default=None)

# Only the surfaces exercised by Weekly, Detail and original finding exploration.
CUSTOMER_ROUTES = {
    'workspace-summary': {'release_id'},
    'product-view': {'release_id', 'product_id', 'region', 'finding_id'},
    'workspace-stores': {'release_id', 'product_id', 'region', 'search', 'limit', 'offset'},
    'metadata': {'release_id'},
    'review-context': {'release_id', 'finding_id'},
    'attention-values': {'release_id', 'finding_id'},
    'exposure-summary': {'release_id'},
    'display-series': {'release_id', 'product_id', 'finding_id'},
    'findings': {'release_id', 'product_id', 'finding_id', 'promise', 'limit', 'offset'},
    'finding-evidence': {'release_id', 'product_id', 'finding_id', 'scope_id', 'limit', 'offset'},
    'periods': {'release_id', 'grain', 'period_kind', 'period_start', 'product_id', 'scope_id', 'limit', 'offset'},
    'distribution': {'release_id', 'grain', 'product_id', 'scope_id', 'limit', 'offset'},
    'daily': {'release_id', 'product_id', 'scope_id', 'limit', 'offset'},
    'projection': {'release_id', 'product_id', 'scope_id', 'limit', 'offset'},
    'expected-projection': {'release_id', 'product_id', 'scope_id', 'limit', 'offset'},
}


def environment_security() -> ServingSecurity:
    mode = os.environ.get('MEMENTO_SERVING_MODE', 'disabled')
    if mode not in {'disabled', 'cloudflare'}:
        raise ValueError('Use the explicit loopback CLI for local serving')
    path = os.environ.get('MEMENTO_SECURITY_POLICY')
    return ServingSecurity('cloudflare' if mode == 'cloudflare' else 'disabled', Path(path) if path else None)


def install_security(app: FastAPI, security: ServingSecurity) -> None:
    app.state.serving_security = security

    @app.middleware('http')
    async def secure(request: Request, call_next):
        request_id = uuid.uuid4().hex
        subject = None
        slot = False
        admitted = False
        context = None

        def deny(status, code):
            return JSONResponse({'code': code, 'detail': 'The request cannot be completed.'}, status_code=status)

        try:
            if request.url.path == '/livez' and request.method == 'GET':
                response = JSONResponse({'status': 'ok'})
            elif security.mode == 'disabled':
                response = deny(503, 'serving_disabled')
            elif security.mode == 'local' and (not request.client or request.client.host not in {'127.0.0.1', '::1', 'testclient'}):
                response = deny(403, 'loopback_required')
            elif request.method != 'GET':
                response = deny(405, 'read_only')
            elif (len(request.scope.get('query_string', b'')) > 4096 or len(request.url.path) > 2048
                  or request.headers.get('content-length', '0') != '0' or 'transfer-encoding' in request.headers):
                response = deny(413, 'request_too_large')
            elif not security.permit_request():
                response = deny(429, 'rate_limited')
            else:
                admitted = security.admission.acquire(blocking=False)
                slot = await run_in_threadpool(security.slots.acquire, timeout=2) if admitted else False
                if not slot:
                    response = deny(429, 'capacity_limited')
                else:
                    allowed = True
                    if security.mode == 'cloudflare':
                        try:
                            policy, subject = await run_in_threadpool(security.authorize, request.headers.get('cf-access-jwt-assertion', ''))
                            context = current_policy.set(policy)
                        except PermissionError:
                            allowed = False
                            response = deny(403, 'access_denied')
                        except Exception:
                            allowed = False
                            response = deny(401, 'authentication_required')
                    if allowed:
                        if security.mode == 'cloudflare':
                            kind = request.url.path.removeprefix('/v1/metrics/')
                            keys = CUSTOMER_ROUTES.get(kind)
                            if keys is None:
                                allowed = False
                                response = deny(404, 'unavailable_surface')
                            elif (set(request.query_params) - keys
                                  or len(request.query_params.multi_items()) != len(request.query_params)):
                                allowed = False
                                response = deny(422, 'invalid_request')
                            elif kind not in {'workspace-summary', 'metadata'} and not request.query_params.get('release_id'):
                                allowed = False
                                response = deny(422, 'publication_required')
                        if allowed:
                            response = await call_next(request)
        except Exception:
            response = deny(500, 'internal_error')
        finally:
            if context is not None:
                current_policy.reset(context)
            if slot:
                security.slots.release()
            if admitted:
                security.admission.release()
        response.headers.update({'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store',
                                 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
                                 'Referrer-Policy': 'no-referrer', 'X-Request-ID': request_id})
        audit(response.status_code, getattr(request.scope.get('route'), 'path', 'unmatched'),
              subject, request_id, request.url.path + '?' + str(request.query_params))
        return response
