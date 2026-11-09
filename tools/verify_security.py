"""Verify browser -> customer path -> HTTPS API -> isolated synthetic Parquet."""
from __future__ import annotations

import json
import os
import socket
import ssl
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import urllib.request
import urllib.error
import jwt
from jwt.algorithms import RSAAlgorithm
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

from memento.manifest import sha256_file
from memento.orchestrator import ingest
from memento.signals import run_signals
from tests.core_fixture import core_fixture

ROOT = Path(__file__).resolve().parents[1]


def port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for(url: str, process: subprocess.Popen, *, verify: bool | ssl.SSLContext = True):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),
                                        urllib.request.HTTPSHandler(context=verify if isinstance(verify, ssl.SSLContext) else None))
    for _ in range(180):
        if process.poll() is not None:
            raise RuntimeError("synthetic verification service exited")
        try:
            with opener.open(url, timeout=2) as response:
                if response.status < 500:
                    return
        except urllib.error.HTTPError as exc:
            if exc.code < 500:
                return
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(0.25)
    raise RuntimeError("synthetic verification service did not become ready")


def verify() -> None:
    processes = []
    web = None
    with tempfile.TemporaryDirectory(prefix="memento-security-browser-") as temporary:
        directory = Path(temporary).resolve()
        data = directory / "customer-a"
        publication = core_fixture(data, products=2, tenant_id="customer-a")
        other = core_fixture(directory / "customer-b", products=3, tenant_id="customer-b")
        manifests = {p.relative_to(data).as_posix(): sha256_file(p)
                     for category in ("canonical", "metrics")
                     for p in (data / category).glob("*/manifest.json")}
        policy = directory / "policy.json"
        issuer, audience = "https://synthetic-test.cloudflareaccess.com", "synthetic-audience-0001"
        policy.write_text(json.dumps({"version": 1, "tenant_id": "customer-a", "issuer": issuer,
                                      "audience": audience, "members": {"user-a": "viewer"},
                                      "classification": "synthetic", "manifests": manifests}))
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        jwk = RSAAlgorithm.to_jwk(key.public_key(), as_dict=True)
        jwk.update(kid="browser-synthetic-key", use="sig", alg="RS256")
        def token(subject):
            return jwt.encode({"sub": subject, "iss": issuer, "aud": audience,
                               "iat": int(time.time()), "exp": int(time.time()) + 600},
                              key, algorithm="RS256", headers={"kid": "browser-synthetic-key"})
        tls_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
        now = datetime.now(timezone.utc)
        cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name)
                .public_key(tls_key.public_key()).serial_number(x509.random_serial_number())
                .not_valid_before(now - timedelta(minutes=1)).not_valid_after(now + timedelta(hours=1))
                .add_extension(x509.SubjectAlternativeName([x509.DNSName("localhost")]), critical=False)
                .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
                .sign(tls_key, hashes.SHA256()))
        cert_path, key_path = directory / "tls.pem", directory / "tls.key"
        cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        key_path.write_bytes(tls_key.private_bytes(serialization.Encoding.PEM,
                                                  serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
        key_path.chmod(0o600)
        api_port, web_port = port(), port()
        server_config = directory / "server.json"
        server_config.write_text(json.dumps({"root": str(data), "policy": str(policy), "port": api_port,
                                            "jwks": {"keys": [jwk]}, "tls_key": str(key_path), "tls_cert": str(cert_path)}))
        test_info = directory / "browser.json"
        test_info.write_text(json.dumps({"token": token("user-a"), "other_token": token("user-b"),
                                        "policy": str(policy), "publication": publication.name, "other_publication": other.name}))
        test_info.chmod(0o600)
        env = {**os.environ, "PYTHONPATH": str(ROOT), "MEMENTO_SERVING_MODE": "cloudflare",
               "MEMENTO_API_ORIGIN": f"https://localhost:{api_port}", "MEMENTO_CUSTOMER_PATH": "/craftmix",
               "MEMENTO_DEMO_BUNDLE": "0", "NODE_EXTRA_CA_CERTS": str(cert_path),
               "SECURITY_BASE_URL": f"http://127.0.0.1:{web_port}", "SECURITY_FIXTURE_INFO": str(test_info)}
        with (directory / "services.log").open("w") as log:
            originals = {path: path.read_bytes() for path in (ROOT / "web/next-env.d.ts", ROOT / "web/tsconfig.json")}
            try:
                api = subprocess.Popen([sys.executable, "tests/e2e/security_server.py", str(server_config)],
                                       cwd=ROOT, env={**env, "MEMENTO_SERVING_MODE": "disabled"}, stdout=log, stderr=log)
                processes.append(api)
                wait_for(f"https://localhost:{api_port}/livez", api, verify=ssl.create_default_context(cafile=str(cert_path)))
                web = subprocess.Popen(["npm", "run", "dev", "--", "--port", str(web_port)],
                                       cwd=ROOT / "web", env=env, stdout=log, stderr=log,
                                       start_new_session=True)
                processes.append(web)
                wait_for(f"http://127.0.0.1:{web_port}/craftmix/weekly", web)
                subprocess.run(["npx", "playwright", "test", "--config", "playwright.security.config.ts"],
                               cwd=ROOT / "web", env=env, check=True)
            finally:
                import signal
                for process in reversed(processes):
                    if process.poll() is None:
                        if process is web:
                            os.killpg(process.pid, signal.SIGTERM)
                        else:
                            process.terminate()
                        try:
                            process.wait(timeout=10)
                        except subprocess.TimeoutExpired:
                            process.kill()
                            process.wait()
                for path, content in originals.items():
                    path.write_bytes(content)


if __name__ == "__main__":
    verify()
