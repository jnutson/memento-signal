"""Adversarial checks use only generated records and ephemeral signing keys."""
from __future__ import annotations

import json
import logging
import time
from decimal import Decimal
from pathlib import Path

import duckdb
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from memento.api import configured_app, create_app
from memento.manifest import sha256_file
from memento.orchestrator import ingest
from memento.query import serving_connection
from memento.security import ServingSecurity
from memento.serving import PredictionStore, SignalStore
from memento.signals import run_signals
from tools.synthetic_demo import build_attention_release_set

ISSUER = "https://synthetic-test.cloudflareaccess.com"
AUDIENCE = "synthetic-audience-0001"


@pytest.fixture
def signing(monkeypatch):
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = jwt.algorithms.RSAAlgorithm.to_jwk(private.public_key(), as_dict=True)
    jwk.update(kid="synthetic-key", alg="RS256", use="sig")
    monkeypatch.setattr(jwt.PyJWKClient, "fetch_data", lambda self: {"keys": [jwk]})

    def token(subject="user-a", **changes):
        now = int(time.time())
        return jwt.encode({"sub": subject, "iss": ISSUER, "aud": AUDIENCE,
                           "iat": now, "exp": now + 300, **changes}, private,
                          algorithm="RS256", headers={"kid": "synthetic-key"})
    return token


@pytest.fixture(scope="module")
def customers(tmp_path_factory):
    base = tmp_path_factory.mktemp("synthetic-security")
    source = build_attention_release_set(base / "source", demo=True)
    result = {}
    for tenant in ("customer-a", "customer-b"):
        root = base / tenant
        canonical = ingest(source, data_root=root, classification="synthetic", tenant_id=tenant)
        release = run_signals(canonical, data_root=root, annual_carrying_cost_rate=Decimal("0.20"),
                              carrying_rate_version="synthetic-security-v1")
        result[tenant] = root, release.name
    return result


def policy_file(path, root, tenant="customer-a", members=None):
    manifests = {}
    for category in ("canonical", "predictions", "signals"):
        for manifest in (root / category).glob("*/manifest.json"):
            manifests[manifest.relative_to(root).as_posix()] = sha256_file(manifest)
    path.write_text(json.dumps({"version": 1, "tenant_id": tenant, "issuer": ISSUER,
                                "audience": AUDIENCE, "members": members or {"user-a": "viewer"},
                                "classification": "synthetic", "manifests": manifests}))
    return path


def client_for(root, path):
    return TestClient(create_app(root, security=ServingSecurity("cloudflare", path)))


def test_protected_report_queue_and_evidence_and_customer_separation(customers, signing, tmp_path):
    a, pinned_a = customers["customer-a"]
    b, pinned_b = customers["customer-b"]
    ca = client_for(a, policy_file(tmp_path / "a.json", a))
    cb = client_for(b, policy_file(tmp_path / "b.json", b, "customer-b", {"user-b": "viewer"}))
    ha = {"cf-access-jwt-assertion": signing()}
    hb = {"cf-access-jwt-assertion": signing("user-b")}
    for client, headers, pinned in ((ca, ha, pinned_a), (cb, hb, pinned_b)):
        report = client.get("/v1/signals/report", headers=headers)
        assert report.status_code == 200
        assert report.json()["run"]["signal_set_id"] == pinned
        queue = client.get("/v1/signals", headers=headers)
        assert queue.status_code == 200
        for row in queue.json()["signals"]:
            detail = client.get("/v1/signals/" + row["signal_id"], headers=headers)
            assert detail.status_code == 200
            assert detail.json()["signal"]["signal_id"] == row["signal_id"]
    assert ca.get("/v1/signals", headers=hb).status_code == 403
    assert cb.get("/v1/signals", headers=ha).status_code == 403
    assert ca.get("/v1/signals", headers=ha, params={"signal_set_id": pinned_b}).status_code == 503
    assert cb.get("/v1/signals", headers=hb, params={"signal_set_id": pinned_a}).status_code == 503
    # Even an operator accidentally approving another customer's manifest hash
    # cannot serve it under this deployment's ownership policy.
    wrong = policy_file(tmp_path / "wrong.json", b)
    assert client_for(b, wrong).get("/v1/signals", headers=ha).status_code == 503


def test_authentication_revocation_and_safe_audit(customers, signing, tmp_path, caplog):
    root, _ = customers["customer-a"]
    path = policy_file(tmp_path / "policy.json", root)
    client = client_for(root, path)
    with caplog.at_level(logging.INFO, logger="memento.security"):
        for token in ("", "bad-token", signing(exp=int(time.time()) - 1),
                      signing(aud="wrong"), signing(iss="https://attacker.invalid"),
                      signing(iat=int(time.time()) + 300),
                      jwt.encode({"sub": "user-a"}, "synthetic-only-key-with-at-least-32-bytes", algorithm="HS256")):
            response = client.get("/v1/signals", headers={"cf-access-jwt-assertion": token})
            assert response.status_code == 401
            assert response.headers["cache-control"] == "private, no-store"
        headers = {"cf-access-jwt-assertion": signing()}
        assert client.get("/v1/signals", headers=headers).status_code == 200
        value = json.loads(path.read_text())
        value["members"] = {}
        path.write_text(json.dumps(value))
        assert client.get("/v1/signals", headers=headers).status_code == 403
    assert headers["cf-access-jwt-assertion"] not in caplog.text
    assert "user-a" not in caplog.text
    assert str(root) not in caplog.text


@pytest.mark.parametrize("payload", ["' OR 1=1 --", "'; DROP TABLE signal; --", "../../customer-b", "https://attacker.invalid/data.parquet"])
def test_injection_and_arbitrary_paths_do_not_reach_queries(customers, signing, tmp_path, payload):
    root, _ = customers["customer-a"]
    client = client_for(root, policy_file(tmp_path / "policy.json", root))
    headers = {"cf-access-jwt-assertion": signing()}
    for parameter in ("signal_type", "signal_direction", "signal_set_id", "tenant_id", "sql", "path"):
        response = client.get("/v1/signals", headers=headers, params={parameter: payload})
        assert response.status_code in {422, 503}
        assert payload not in response.text
    assert client.get("/v1/signals/sig_bad", headers=headers).status_code == 422
    assert client.get("/v1/signals", headers=headers).status_code == 200


def test_disabled_default_loopback_limits_and_no_documentation(tmp_path, monkeypatch):
    monkeypatch.delenv("MEMENTO_SERVING_MODE", raising=False)
    client = TestClient(configured_app())
    assert client.get("/v1/signals").status_code == 503
    assert client.get("/livez").json() == {"status": "ok"}
    local = TestClient(create_app(tmp_path))
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert local.get(path).status_code == 404
    assert local.post("/v1/signals", json={}).status_code == 405
    assert local.get("/v1/signals", params={"signal_type": "x" * 5000}).status_code == 413
    assert TestClient(create_app(tmp_path), client=("192.0.2.10", 1234)).get("/v1/signals").status_code == 403
    security = ServingSecurity("local")
    limited = TestClient(create_app(tmp_path, security=security))
    security.requests, security.window = 300, int(time.monotonic() // 60)
    assert limited.get("/v1/signals").status_code == 429
    security.requests = 0
    for _ in range(4):
        security.slots.acquire()
    try:
        assert limited.get("/v1/signals").status_code == 429
    finally:
        for _ in range(4):
            security.slots.release()


def test_duckdb_file_network_configuration_and_deadline(tmp_path):
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    outside = tmp_path / "outside.parquet"
    with duckdb.connect() as writer:
        writer.execute("COPY (SELECT 'synthetic' AS value) TO ? (FORMAT PARQUET)", [str(outside)])
    with serving_connection(allowed) as con:
        for sql, params in (("SELECT * FROM read_parquet(?)", [str(outside)]),
                            ("SELECT * FROM read_parquet(?)", ["https://attacker.invalid/data.parquet"]),
                            ("COPY (SELECT 1) TO ?", [str(tmp_path / "written.csv")]),
                            ("SET enable_external_access=true", []),
                            ("INSTALL httpfs", [])):
            with pytest.raises(duckdb.Error):
                con.execute(sql, params)
        value = "'; SELECT * FROM read_parquet('/outside'); --"
        assert con.execute("SELECT ?", [value]).fetchone() == (value,)
    assert not (tmp_path / "written.csv").exists()
    with pytest.raises(duckdb.InterruptException):
        with serving_connection(allowed, timeout=0.02) as con:
            con.execute("SELECT sum(i) FROM range(10000000000) t(i)").fetchone()


def test_manifest_path_and_symlink_boundaries(tmp_path):
    inside = tmp_path / "inside"
    inside.mkdir()
    outside = tmp_path / "outside.json"
    outside.write_text("{}")
    (inside / "escape.json").symlink_to(outside)
    for path in ("../outside.json", "/outside.json", "escape.json", "./outside.json", "a//b", "..\\outside.json"):
        with pytest.raises((ValueError, FileNotFoundError)):
            PredictionStore._safe_member(inside, path)


def test_ownership_prevents_cross_customer_batch_outputs(customers):
    a, pinned = customers["customer-a"]
    b, _ = customers["customer-b"]
    from memento.ownership import bind_owner, require_owner, verify_source_owner
    with pytest.raises(ValueError):
        bind_owner(a, "customer-b")
    manifest = SignalStore(a / "signals", a / "canonical", pinned).run()
    assert manifest["tenant_id"] == "customer-a"
    with pytest.raises(ValueError):
        require_owner(b, manifest)
    with pytest.raises(ValueError):
        verify_source_owner({"tenant_id": "customer-b"}, "customer-a")


def test_manifest_approval_tampering_and_local_customer_data_denial(customers, signing, tmp_path):
    import shutil
    root = tmp_path / "copy"
    shutil.copytree(customers["customer-a"][0], root)
    path = policy_file(tmp_path / "policy.json", root)
    client = client_for(root, path)
    headers = {"cf-access-jwt-assertion": signing()}
    assert client.get("/v1/signals", headers=headers).status_code == 200
    canonical = next((root / "canonical").glob("*/manifest.json"))
    canonical.write_bytes(canonical.read_bytes() + b" ")
    assert client.get("/v1/signals", headers=headers).status_code == 503
    manifest = json.loads(canonical.read_bytes())
    manifest["source_classification"] = "confidential_customer"
    canonical.write_text(json.dumps(manifest))
    local = TestClient(create_app(root))
    for endpoint in ("/v1/signals", "/v1/signals/report", "/v1/attention", "/healthz"):
        assert local.get(endpoint).status_code == 503


def test_approval_tool_scopes_to_selected_tenant_publication(customers):
    from tools.approve_publication import approve
    root, publication = customers["customer-a"]
    policy = approve(root, publication, tenant_id="customer-a", issuer=ISSUER,
                     audience=AUDIENCE, members={"user-a": "viewer"}, classification="synthetic")
    assert len(policy.manifests) == 2
    with pytest.raises(ValueError):
        approve(root, publication, tenant_id="customer-b", issuer=ISSUER,
                audience=AUDIENCE, members={"user-b": "viewer"}, classification="synthetic")


def test_quoted_paths_remain_data_in_the_synthetic_pipeline(tmp_path):
    from tools.demo import prepare_fixture
    root = tmp_path / "literal' ; SELECT 1 --"
    result = prepare_fixture(root)
    assert result["preflight"] == "passed"


def test_source_guard_never_opens_forbidden_customer_assets(tmp_path):
    from tools.check_security import violations
    (tmp_path / "data").mkdir()
    asset = tmp_path / "data/customer.parquet"
    asset.write_bytes(b"\xff\xfe synthetic bytes that are not text")
    assert violations(tmp_path, ["data/customer.parquet"]) == ["forbidden tracked asset: data/customer.parquet"]
