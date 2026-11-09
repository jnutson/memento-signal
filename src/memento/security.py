"""One-customer serving policy. No customer payloads or credentials belong here."""
from __future__ import annotations

import hashlib
import json
import logging
import re
import threading
import time
from pathlib import Path
from typing import Literal

import jwt
from pydantic import BaseModel, ConfigDict, Field


class SecurityPolicy(BaseModel):
    """Operator-owned, read-only file; reloaded per request for immediate revocation."""

    model_config = ConfigDict(extra="forbid", strict=True)
    version: Literal[1]
    tenant_id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{0,63}$")
    issuer: str = Field(pattern=r"^https://[a-z0-9-]+\.cloudflareaccess\.com$")
    audience: str = Field(min_length=16, max_length=256)
    # Immutable identity-provider subject IDs, never email/domain auto-enrollment.
    members: dict[str, Literal["viewer"]] = Field(max_length=1000)
    # Paths relative to the deployment's data root -> reviewed manifest SHA-256.
    manifests: dict[str, str] = Field(min_length=1, max_length=10000)
    classification: Literal["synthetic", "internal", "confidential_customer"]

    def approved_manifest(self, root: Path, path: Path) -> dict:
        relative = path.resolve(strict=True).relative_to(root.resolve(strict=True)).as_posix()
        expected = self.manifests.get(relative)
        if expected is None or not re.fullmatch(r"[a-f0-9]{64}", expected):
            raise ValueError("publication is not approved")
        payload = path.read_bytes()
        if hashlib.sha256(payload).hexdigest() != expected:
            raise ValueError("publication approval mismatch")
        manifest = json.loads(payload)
        if not isinstance(manifest, dict):
            raise ValueError("invalid approved manifest")
        if manifest.get("tenant_id") != self.tenant_id:
            raise ValueError("publication owner mismatch")
        if relative.startswith("canonical/") and manifest.get("source_classification") != self.classification:
            raise ValueError("publication classification mismatch")
        return manifest


class AccessVerifier:
    """RS256 only, issuer-pinned JWKS; never follow token-provided key URLs."""

    def __init__(self, issuer: str, audience: str):
        self.issuer = issuer
        self.audience = audience
        self.keys = jwt.PyJWKClient(
            issuer + "/cdn-cgi/access/certs", timeout=3, lifespan=300,
        )

    def subject(self, token: str) -> str:
        if not token or len(token) > 16384:
            raise ValueError("invalid identity")
        header = jwt.get_unverified_header(token)
        if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str):
            raise ValueError("invalid identity")
        key = self.keys.get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token, key, algorithms=["RS256"], audience=self.audience, issuer=self.issuer,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )
        subject = claims.get("sub")
        if not isinstance(subject, str) or not subject or len(subject) > 256:
            raise ValueError("invalid identity")
        return subject


class ServingSecurity:
    def __init__(self, mode: Literal["disabled", "local", "cloudflare"] = "disabled",
                 policy_path: Path | None = None):
        if mode not in {"disabled", "local", "cloudflare"}:
            raise ValueError("invalid serving mode")
        self.mode = mode
        self.policy_path = policy_path
        self.verifier: AccessVerifier | None = None
        self.tenant_id: str | None = None
        self.slots = threading.BoundedSemaphore(4)
        self.lock = threading.Lock()
        self.window = 0
        self.requests = 0
        if mode == "cloudflare":
            policy = self.policy()
            self.tenant_id = policy.tenant_id
            self.verifier = AccessVerifier(policy.issuer, policy.audience)
            logger = logging.getLogger("memento.security")
            logger.setLevel(logging.INFO)
            if not logger.handlers:
                handler = logging.StreamHandler()
                handler.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
                logger.addHandler(handler)

    def policy(self) -> SecurityPolicy:
        try:
            if self.policy_path is None or self.policy_path.is_symlink():
                raise ValueError("security policy is required")
            if self.policy_path.stat().st_size > 2_000_000:
                raise ValueError("invalid security policy")
            return SecurityPolicy.model_validate_json(self.policy_path.read_bytes())
        except Exception:
            # Pydantic errors can echo input, including misfiled credentials.
            raise ValueError("security policy is missing or invalid") from None

    def authorize(self, token: str) -> tuple[SecurityPolicy, str]:
        policy = self.policy()
        verifier = self.verifier
        if (verifier is None or policy.tenant_id != self.tenant_id
                or (policy.issuer, policy.audience) != (verifier.issuer, verifier.audience)):
            raise ValueError("identity configuration changed; restart required")
        subject = verifier.subject(token)
        if policy.members.get(subject) != "viewer":
            raise PermissionError("membership required")
        return policy, subject

    def permit_request(self) -> bool:
        # Per-process backstop. Edge limits must cover the entire deployment.
        with self.lock:
            window = int(time.monotonic() // 60)
            if window != self.window:
                self.window, self.requests = window, 0
            self.requests += 1
            return self.requests <= 300


def audit(status: int, route: str, subject: str | None, request_id: str, resource: str) -> None:
    logging.getLogger("memento.security").info(
        "access status=%d route=%s principal=%s request_id=%s resource=%s", status, route,
        hashlib.sha256(subject.encode()).hexdigest()[:24] if subject else "anonymous",
        request_id, hashlib.sha256(resource.encode()).hexdigest()[:24],
    )
