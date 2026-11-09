"""Protocol, website parity, and OAuth isolation using generated synthetic data."""
import json
import sys
import time
from decimal import Decimal

import anyio
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from mcp.client import Client
from mcp.client.stdio import StdioServerParameters

from memento.api import create_app
from memento.manifest import sha256_file
from memento.mcp_security import MCPTokenVerifier
from memento.mcp_server import SENSITIVE_METRICS, create_http_app, create_server
from memento.orchestrator import ingest
from memento.signals import run_signals
from tools.demo import prepare_fixture
from tools.synthetic_demo import build_attention_release_set

ISSUER = "https://identity.example.test"
RESOURCE = "https://signal.example.test/mcp"


@pytest.fixture(scope="module")
def demo(tmp_path_factory):
    root = tmp_path_factory.mktemp("mcp-demo")
    return root, prepare_fixture(root)["signal_set_id"]


@pytest.fixture(scope="module")
def owned(tmp_path_factory):
    base = tmp_path_factory.mktemp("mcp-tenants")
    source = build_attention_release_set(base / "source", demo=True)
    result = {}
    for tenant in ("tenant-a", "tenant-b"):
        root = base / tenant
        canonical = ingest(source, data_root=root, classification="synthetic", tenant_id=tenant)
        release = run_signals(canonical, data_root=root, annual_carrying_cost_rate=Decimal("0.20"),
                              carrying_rate_version="synthetic-mcp-v1")
        result[tenant] = root, release.name
    return result


@pytest.fixture
def oauth(owned, tmp_path, monkeypatch):
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = jwt.algorithms.RSAAlgorithm.to_jwk(private.public_key(), as_dict=True)
    jwk.update(kid="synthetic", alg="RS256", use="sig")
    monkeypatch.setattr(jwt.PyJWKClient, "fetch_data", lambda self: {"keys": [jwk]})
    root, publication = owned["tenant-a"]
    manifests = {p.relative_to(root).as_posix(): sha256_file(p)
                 for category in ("canonical", "signals") for p in (root / category).glob("*/manifest.json")}
    policy = {"version": 1, "tenant_id": "tenant-a", "issuer": ISSUER, "audience": RESOURCE,
              "jwks_url": ISSUER + "/keys", "members": {"member-a": "viewer"},
              "clients": ["synthetic-client"], "classification": "synthetic", "manifests": manifests}
    path = tmp_path / "policy.json"
    path.write_text(json.dumps(policy))
    verifier = MCPTokenVerifier(path)

    def token(**changes):
        now = int(time.time())
        return jwt.encode({"iss": ISSUER, "aud": RESOURCE, "sub": "member-a", "iat": now,
                           "exp": now + 300, "client_id": "synthetic-client", "scope": "signal:read",
                           **changes}, private, algorithm="RS256", headers={"kid": "synthetic"})
    return root, publication, verifier, token, path, policy


def rpc(client, token, method, params=None):
    headers = {"Accept": "application/json, text/event-stream"}
    if token:
        headers["Authorization"] = "Bearer " + token
    return client.post("/mcp", headers=headers,
                       json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}})


def call(client, token, tool, arguments=None):
    return rpc(client, token, "tools/call", {"name": tool, "arguments": arguments or {}})


def test_protocol_and_website_parity(demo):
    root, publication = demo
    web = TestClient(create_app(root))

    async def exercise():
        async with Client(create_server(root)) as client:
            tools = (await client.list_tools()).tools
            assert {t.name for t in tools} == {"get_business_context", "list_metrics", "get_metric_definition",
                                               "get_attention_queue", "get_signal_evidence"}
            assert all(t.annotations.read_only_hint and t.output_schema for t in tools)
            context = await client.call_tool("get_business_context")
            report = context.structured_content["data"]["report"]
            assert report == web.get("/v1/signals/report").json()
            metrics = await client.call_tool("list_metrics")
            for metric in metrics.structured_content["data"]["metrics"]:
                definition = await client.call_tool("get_metric_definition", {"metric_id": metric["metric_id"]})
                assert definition.structured_content["data"]["metric"] == metric
            for category in report["categories"]:
                args = {"publication_id": publication, "signal_type": category["signal_type"]}
                params = {"signal_set_id": publication, "signal_type": category["signal_type"]}
                if category["signal_direction"]:
                    args["signal_direction"] = params["signal_direction"] = category["signal_direction"]
                queue = (await client.call_tool("get_attention_queue", args)).structured_content["data"]
                assert queue["signals"] == web.get("/v1/signals", params=params).json()["signals"]
                assert queue["selection_count"] == category["candidate_count"]
                signal = queue["signals"][0]
                evidence = await client.call_tool("get_signal_evidence", {
                    "publication_id": publication, "signal_id": signal["signal_id"]})
                assert evidence.structured_content["data"] == web.get(
                    "/v1/signals/" + signal["signal_id"], params={"signal_set_id": publication}).json()
            for args in ({"publication_id": "../../private"}, {"publication_id": "mss_" + "f" * 64}):
                assert (await client.call_tool("get_attention_queue", args)).is_error
            assert (await client.call_tool("get_metric_definition", {"metric_id": "missing"})).is_error
    anyio.run(exercise)


def test_real_stdio_client(demo):
    root, publication = demo

    async def exercise():
        parameters = StdioServerParameters(command=sys.executable, args=["-m", "memento.mcp_cli", "--data-root", str(root)])
        async with Client(parameters) as client:
            result = await client.call_tool("get_business_context")
            assert result.structured_content["publication_id"] == publication
            assert result.structured_content["classification"] == "synthetic"
    anyio.run(exercise)


def test_oauth_metadata_and_economics_redaction(oauth):
    root, _, verifier, token, *_ = oauth
    with TestClient(create_http_app(create_server(root, verifier=verifier), verifier),
                    base_url=RESOURCE.removesuffix("/mcp")) as client:
        denied = rpc(client, None, "tools/list")
        assert denied.status_code == 401
        assert "resource_metadata=" in denied.headers["www-authenticate"]
        metadata = client.get("/.well-known/oauth-protected-resource/mcp")
        assert metadata.status_code == 200
        assert metadata.json()["resource"] == RESOURCE
        assert metadata.json()["authorization_servers"] == [ISSUER]
        assert rpc(client, token(), "tools/list").status_code == 200
        report = call(client, token(), "get_business_context").json()["result"]["structuredContent"]
        assert report["redacted_fields"] == sorted(SENSITIVE_METRICS)
        assert all(c["leading_signal"]["estimated_contribution_impact_amount"] is None
                   for c in report["data"]["report"]["categories"])
        metrics = call(client, token(), "list_metrics").json()["result"]["structuredContent"]["data"]["metrics"]
        assert all(m["metric_id"] not in SENSITIVE_METRICS for m in metrics)
        assert call(client, token(), "get_metric_definition", {"metric_id": "carrying_cost_28d_amount"}).json()["result"]["isError"]
        full = call(client, token(scope="signal:read economics:read"), "get_business_context").json()["result"]["structuredContent"]
        assert full["redacted_fields"] == []
        assert any(c["leading_signal"]["estimated_contribution_impact_amount"] is not None
                   for c in full["data"]["report"]["categories"])


@pytest.mark.parametrize("changes", [
    {"aud": "https://wrong.example.test/mcp"}, {"iss": "https://wrong.example.test"},
    {"exp": 1}, {"sub": "member-b"}, {"client_id": "other-client"}, {"scope": "economics:read"},
])
def test_invalid_identity(oauth, changes):
    root, _, verifier, token, *_ = oauth
    with TestClient(create_http_app(create_server(root, verifier=verifier), verifier),
                    base_url=RESOURCE.removesuffix("/mcp")) as client:
        assert rpc(client, token(**changes), "tools/list").status_code == 401


def test_revocation_cross_tenant_and_safe_logs(oauth, owned, caplog):
    root, _, verifier, token, path, policy = oauth
    other_root, other_publication = owned["tenant-b"]
    caplog.set_level("INFO", logger="memento.mcp")
    bearer = token()
    with TestClient(create_http_app(create_server(root, verifier=verifier), verifier),
                    base_url=RESOURCE.removesuffix("/mcp")) as client:
        response = call(client, bearer, "get_attention_queue", {"publication_id": other_publication})
        assert response.json()["result"]["isError"]
        assert str(other_root) not in response.text
        policy["members"] = {}
        path.write_text(json.dumps(policy))
        assert rpc(client, bearer, "tools/list").status_code == 401
    assert bearer not in caplog.text and str(root) not in caplog.text and "member-a" not in caplog.text
    with pytest.raises(ValueError):
        create_server(other_root, verifier=verifier)


def test_http_boundary(oauth, demo):
    root, _, verifier, token, *_ = oauth
    with pytest.raises(ValueError, match="authenticated"):
        create_http_app(create_server(demo[0]), verifier)
    with TestClient(create_http_app(create_server(root, verifier=verifier), verifier),
                    base_url=RESOURCE.removesuffix("/mcp")) as client:
        assert client.post("/mcp", content="x" * 17000,
                           headers={"Authorization": "Bearer " + token(),
                                    "Accept": "application/json, text/event-stream"}).status_code == 413
        assert client.post("/mcp", headers={"Host": "attacker.example.test"}).status_code != 200


def test_sensitive_arguments_are_not_echoed_and_unknown_fields_fail(oauth, caplog):
    root, _, verifier, token, *_ = oauth
    payload = "private-payload-that-must-not-be-echoed"
    with TestClient(create_http_app(create_server(root, verifier=verifier), verifier),
                    base_url=RESOURCE.removesuffix("/mcp")) as client:
        for name, arguments in [
            ("get_attention_queue", {"publication_id": payload}),
            ("list_metrics", {"sql": payload}),
            (payload, {}),
        ]:
            response = call(client, token(), name, arguments)
            assert response.json()["result"]["isError"]
            assert payload not in response.text
        assert client.get("/.well-known/oauth-protected-resource/mcp").headers["cache-control"] == "private, no-store"
    assert payload not in caplog.text


def test_publication_stays_pinned_when_current_changes(tmp_path):
    from memento.serving import SignalStore
    from memento.signal_publication import publish_signal_set

    root = tmp_path / "synthetic"
    pinned = prepare_fixture(root)["signal_set_id"]
    server = create_server(root)
    store = SignalStore(root / "signals", root / "canonical", pinned)
    manifest = store.run()
    canonical = json.loads((root / "canonical" / manifest["canonical_dataset_id"] / "manifest.json").read_text())
    rows = store.top_signals()
    evidence = [entry for row in rows for entry in store.evidence(row["signal_id"])]
    newer = publish_signal_set(rows, evidence, canonical_manifest=canonical, data_root=root,
                               configuration={**manifest["configuration"], "synthetic_mcp_test": "newer"})
    assert newer.name != pinned

    async def exercise():
        async with Client(server) as client:
            result = await client.call_tool("get_business_context")
            assert result.structured_content["publication_id"] == pinned
    anyio.run(exercise)


@pytest.mark.parametrize("version", ["2025-06-18", "2025-11-25"])
def test_http_handshake_versions(oauth, version):
    root, _, verifier, token, *_ = oauth
    with TestClient(create_http_app(create_server(root, verifier=verifier), verifier),
                    base_url=RESOURCE.removesuffix("/mcp")) as client:
        response = rpc(client, token(), "initialize", {
            "protocolVersion": version, "capabilities": {},
            "clientInfo": {"name": "synthetic-protocol-test", "version": "1"}})
        assert response.status_code == 200
        assert response.json()["result"]["protocolVersion"] == version
        assert response.headers["cache-control"] == "private, no-store"


def test_corrupt_publication_fails_safely(tmp_path):
    root = tmp_path / "synthetic"
    publication = prepare_fixture(root)["signal_set_id"]
    server = create_server(root)
    (root / "signals" / publication / "signal_evidence.parquet").write_bytes(b"synthetic-corrupt-file")

    async def exercise():
        async with Client(server) as client:
            result = await client.call_tool("get_business_context")
            assert result.is_error
            assert str(root) not in str(result.content)
    anyio.run(exercise)


def test_policy_rejects_non_synthetic_or_insecure_identity(oauth):
    _, _, verifier, _, path, policy = oauth
    for changes in ({"classification": "confidential_customer"}, {"jwks_url": "http://identity.example.test/keys"},
                    {"issuer": ISSUER + "/changed"}):
        path.write_text(json.dumps({**policy, **changes}))
        with pytest.raises(ValueError, match="policy is missing or invalid"):
            verifier.policy()
