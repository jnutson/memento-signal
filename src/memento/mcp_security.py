"""OAuth resource-server checks for one isolated, synthetic MCP deployment."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

import jwt
from mcp.server.auth.provider import AccessToken
from pydantic import Field, field_validator
from starlette.concurrency import run_in_threadpool

from .security import SecurityPolicy

READ_SCOPE = "signal:read"
ECONOMICS_SCOPE = "economics:read"


class MCPPolicy(SecurityPolicy):
    # Reuse approved_manifest's hash, ownership, classification, and path checks.
    issuer: str = Field(min_length=8, max_length=2048)
    audience: str = Field(min_length=8, max_length=2048)
    jwks_url: str = Field(min_length=8, max_length=2048)
    clients: list[str] = Field(min_length=1, max_length=100)
    classification: Literal["synthetic"]

    @field_validator("issuer", "audience", "jwks_url")
    @classmethod
    def https_url(cls, value: str) -> str:
        parts = urlsplit(value)
        if (parts.scheme != "https" or not parts.hostname or parts.username or parts.password
                or parts.query or parts.fragment or any(c.isspace() for c in value)):
            raise ValueError("operator configuration requires a canonical HTTPS URL")
        return value


class MCPTokenVerifier:
    """Pinned issuer/key endpoint; no credential forwarding or token-selected URLs."""

    def __init__(self, policy_path: Path):
        self.path = policy_path
        policy = self.policy()
        self.identity = (policy.issuer, policy.audience, policy.jwks_url, policy.tenant_id)
        self.keys = jwt.PyJWKClient(policy.jwks_url, timeout=3, lifespan=300)

    def policy(self) -> MCPPolicy:
        try:
            if self.path.is_symlink() or self.path.stat().st_size > 2_000_000:
                raise ValueError("invalid policy")
            policy = MCPPolicy.model_validate_json(self.path.read_bytes())
            if hasattr(self, "identity") and self.identity != (
                policy.issuer, policy.audience, policy.jwks_url, policy.tenant_id
            ):
                raise ValueError("identity change requires restart")
            return policy
        except Exception:
            raise ValueError("MCP policy is missing or invalid") from None

    def _verify(self, token: str) -> AccessToken | None:
        try:
            policy = self.policy()
            if not token or len(token) > 16384:
                return None
            header = jwt.get_unverified_header(token)
            if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str):
                return None
            key = self.keys.get_signing_key_from_jwt(token).key
            claims = jwt.decode(token, key, algorithms=["RS256"], issuer=policy.issuer,
                                audience=policy.audience,
                                options={"require": ["exp", "iat", "iss", "aud", "sub", "client_id", "scope"]})
            subject, client_id, scope = claims["sub"], claims["client_id"], claims["scope"]
            if (not isinstance(subject, str) or not subject or len(subject) > 256
                    or policy.members.get(subject) != "viewer"
                    or not isinstance(client_id, str) or client_id not in policy.clients
                    or not isinstance(scope, str) or len(scope) > 4096):
                return None
            scopes = scope.split()
            if READ_SCOPE not in scopes:
                return None
            return AccessToken(token=token, subject=subject, client_id=client_id,
                               scopes=scopes, expires_at=int(claims["exp"]), resource=policy.audience)
        except Exception:
            return None

    async def verify_token(self, token: str) -> AccessToken | None:
        return await run_in_threadpool(self._verify, token)

    def authorized_policy(self, token: AccessToken | None) -> MCPPolicy:
        policy = self.policy()
        if (token is None or token.resource != policy.audience
                or token.expires_at is None or token.expires_at <= time.time()
                or token.subject not in policy.members or token.client_id not in policy.clients
                or READ_SCOPE not in token.scopes):
            raise PermissionError("MCP authorization required")
        return policy
