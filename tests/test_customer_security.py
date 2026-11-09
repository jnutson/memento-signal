"""Two synthetic customers exercise the actual product metric-serving boundary."""
import json
import logging
import shutil
import time
from pathlib import Path

import duckdb
import jwt
from jwt.algorithms import RSAAlgorithm
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from memento.api import create_app
from memento.http_security import environment_security
from memento.manifest import sha256_file
from memento.query import serving_connection
from memento.security import ServingSecurity
from tests.core_fixture import core_fixture
from tools.approve_metric_publication import approval

ISSUER = 'https://synthetic-test.cloudflareaccess.com'
AUDIENCE = 'synthetic-customer-audience-0001'

@pytest.fixture(scope='module')
def customers(tmp_path_factory):
    base = tmp_path_factory.mktemp('two-synthetic-customers')
    result = {}
    for tenant in ('customer-a', 'customer-b'):
        root = base / tenant
        release = core_fixture(root, products=2 if tenant == "customer-a" else 3, tenant_id=tenant)
        result[tenant] = root, release.name
    return result

@pytest.fixture
def signing(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = RSAAlgorithm.to_jwk(key.public_key(), as_dict=True)
    jwk.update(kid='synthetic-key', alg='RS256', use='sig')
    monkeypatch.setattr(jwt.PyJWKClient, 'fetch_data', lambda self: {'keys': [jwk]})
    def token(subject='user-a', **changes):
        return jwt.encode({'sub': subject, 'iss': ISSUER, 'aud': AUDIENCE,
                           'iat': int(time.time()), 'exp': int(time.time()) + 600, **changes},
                          key, algorithm='RS256', headers={'kid': 'synthetic-key'})
    return token

def policy_file(root, release, path, tenant='customer-a', subject='user-a'):
    policy = approval(root, release, tenant_id=tenant, issuer=ISSUER, audience=AUDIENCE,
                      members={subject: 'viewer'}, classification='synthetic')
    path.write_text(policy.model_dump_json())
    return path

def client(root, policy):
    return TestClient(create_app(root, security=ServingSecurity('cloudflare', policy)))


def test_workspace_parity_and_two_customer_isolation(customers, signing, tmp_path):
    a, ra = customers['customer-a']
    b, rb = customers['customer-b']
    ca = client(a, policy_file(a, ra, tmp_path/'a.json'))
    cb = client(b, policy_file(b, rb, tmp_path/'b.json', 'customer-b', 'user-b'))
    ha = {'cf-access-jwt-assertion': signing()}
    hb = {'cf-access-jwt-assertion': signing('user-b')}
    local = TestClient(create_app(a))
    for endpoint, params in (
        ('workspace-summary', {'release_id': ra}),
        ('product-view', {'release_id': ra, 'product_id': 'prd_100'}),
        ('workspace-stores', {'release_id': ra, 'product_id': 'prd_100'}),
        ('findings', {'release_id': ra}),
        ('display-series', {'release_id': ra, 'product_id': 'prd_100'}),
        ('attention-values', {'release_id': ra}),
    ):
        route = '/v1/metrics/' + endpoint
        result = ca.get(route, params=params, headers=ha)
        assert result.status_code == 200, endpoint
        assert result.json() == local.get(route, params=params).json(), endpoint
        assert result.headers['cache-control'] == 'private, no-store'
        assert ca.get(route, params=params, headers=hb).status_code == 403
    assert cb.get('/v1/metrics/workspace-summary', headers=ha).status_code == 403
    own_a = ca.get('/v1/metrics/workspace-summary', headers=ha).json()
    own_b = cb.get('/v1/metrics/workspace-summary', headers=hb).json()
    assert len(own_a['products']) == 2
    assert len(own_b['products']) == 3
    assert ca.get('/v1/metrics/workspace-summary', headers=ha).json() == own_a
    for c, h, other in ((ca, ha, rb), (cb, hb, ra)):
        assert c.get('/v1/metrics/workspace-summary', headers=h, params={'release_id': other}).status_code == 503
    # Even an accidental approval of the foreign manifest digest cannot override ownership.
    with pytest.raises(ValueError):
        approval(b, rb, tenant_id='customer-a', issuer=ISSUER, audience=AUDIENCE,
                 members={'user-a':'viewer'}, classification='synthetic')


def test_identity_revocation_and_no_sensitive_audit(customers, signing, tmp_path, caplog):
    root, release = customers['customer-a']
    policy = policy_file(root, release, tmp_path/'policy.json')
    c = client(root, policy)
    valid = signing()
    pieces = valid.split('.')
    pieces[2] = ('A' if pieces[2][0] != 'A' else 'B') + pieces[2][1:]
    forged = '.'.join(pieces)
    with caplog.at_level(logging.INFO, logger='memento.security'):
        for token in ('', 'bad', forged, signing(exp=int(time.time())-5), signing(aud='wrong'),
                      signing(iss='https://attacker.invalid'), signing(iat=int(time.time())+600),
                      jwt.encode({'sub':'user-a'}, 'synthetic-hmac-key-with-at-least-32-bytes', algorithm='HS256')):
            assert c.get('/v1/metrics/workspace-summary', headers={'cf-access-jwt-assertion':token}).status_code == 401
        token = signing()
        assert c.get('/v1/metrics/workspace-summary', headers={'cf-access-jwt-assertion':token}).status_code == 200
        value = json.loads(policy.read_text()); value['members'] = {}
        replacement = tmp_path/'replacement.json'; replacement.write_text(json.dumps(value)); replacement.replace(policy)
        assert c.get('/v1/metrics/workspace-summary', headers={'cf-access-jwt-assertion':token}).status_code == 403
    assert token not in caplog.text
    assert str(root) not in caplog.text
    assert 'user-a' not in caplog.text


@pytest.mark.parametrize('payload', ["' OR 1=1 --", "'; DROP TABLE members; --", '../../customer-b', 'https://attacker.invalid/private.parquet'])
def test_injection_is_literal_or_rejected(customers, signing, tmp_path, payload):
    root, release = customers['customer-a']
    c = client(root, policy_file(root, release, tmp_path/'policy.json'))
    h = {'cf-access-jwt-assertion': signing()}
    for key in ('release_id','product_id','region','finding_id','search','offset','sql','tenant_id'):
        params = {'release_id':release, 'product_id':'prd_100', key:payload}
        result = c.get('/v1/metrics/workspace-stores', headers=h, params=params)
        assert result.status_code in {200, 404, 422, 503}
        if result.status_code == 200:
            assert result.json()['total'] == 0
        else:
            assert payload not in result.text
    assert c.get('/v1/metrics/product-view', params={'release_id':release,'product_id':'prd_100'}, headers=h).status_code == 200


def test_surface_allowlist_limits_and_default_disabled(customers, signing, tmp_path, monkeypatch):
    root, release = customers['customer-a']
    c = client(root, policy_file(root, release, tmp_path/'policy.json'))
    h = {'cf-access-jwt-assertion': signing()}
    for route in ('/docs','/openapi.json','/healthz','/v1/signals','/v1/metrics/orders','/v1/metrics/checks','/v1/metrics/evaluations/anything'):
        assert c.get(route, headers=h).status_code == 404
    assert c.get('/v1/metrics/product-view', params={'product_id':'prd_100'}, headers=h).status_code == 422
    assert c.get('/v1/metrics/workspace-summary?release_id='+release+'&release_id='+release, headers=h).status_code == 422
    assert c.post('/v1/metrics/workspace-summary', headers=h).status_code == 405
    assert c.get('/v1/metrics/workspace-summary', params={'release_id':'x'*5000}, headers=h).status_code == 413
    monkeypatch.delenv('MEMENTO_SERVING_MODE', raising=False)
    disabled = TestClient(create_app(root, security=environment_security()))
    assert disabled.get('/v1/metrics/workspace-summary').status_code == 503
    assert disabled.get('/livez').json() == {'status':'ok'}
    remote = TestClient(create_app(root), client=('192.0.2.2', 1234))
    assert remote.get('/v1/metrics/workspace-summary').status_code == 403


def test_tampering_and_minimal_serving_mount(customers, signing, tmp_path):
    source, release = customers['customer-a']
    root = tmp_path/'serving'
    shutil.copytree(source/'metrics', root/'metrics')
    canonical = source/'canonical/mds_metric_fixture/manifest.json'
    target = root/'canonical/mds_metric_fixture/manifest.json'; target.parent.mkdir(parents=True)
    shutil.copyfile(canonical, target)
    policy = policy_file(root, release, tmp_path/'policy.json')
    c = client(root, policy); h = {'cf-access-jwt-assertion': signing()}
    assert c.get('/v1/metrics/workspace-summary', headers=h).status_code == 200
    manifest = root/'metrics'/release/'manifest.json'
    manifest.write_bytes(manifest.read_bytes()+b' ')
    assert c.get('/v1/metrics/workspace-summary', headers=h).status_code == 503


def test_duckdb_restrictions_and_deadline(tmp_path):
    approved = tmp_path/'approved'; approved.mkdir()
    outside = tmp_path/'outside.parquet'
    with duckdb.connect() as con:
        con.execute('COPY (SELECT 1) TO ? (FORMAT PARQUET)', [str(outside)])
    with serving_connection(approved) as con:
        for sql, params in [('SELECT * FROM read_parquet(?)',[str(outside)]),
                            ('SELECT * FROM read_parquet(?)',['https://attacker.invalid/data.parquet']),
                            ('SET enable_external_access=true',[]), ('INSTALL httpfs',[])]:
            with pytest.raises(duckdb.Error):con.execute(sql, params)
        literal = "'; SELECT 1; --"
        assert con.execute('SELECT ?', [literal]).fetchone() == (literal,)
    with pytest.raises(duckdb.InterruptException):
        with serving_connection(approved, timeout=.02) as con:
            con.execute('SELECT sum(i) FROM range(10000000000) t(i)').fetchone()


def test_rate_and_queue_bounds(customers, signing, tmp_path):
    root, release = customers['customer-a']
    security = ServingSecurity('cloudflare', policy_file(root, release, tmp_path/'policy.json'))
    c = TestClient(create_app(root, security=security))
    headers = {'cf-access-jwt-assertion':signing()}
    security.window = int(time.monotonic() // 60); security.requests = 300
    assert c.get('/v1/metrics/workspace-summary', headers=headers).status_code == 429
    security.requests = 0
    for _ in range(16):security.admission.acquire()
    try:
        assert c.get('/v1/metrics/workspace-summary', headers=headers).status_code == 429
    finally:
        for _ in range(16):security.admission.release()
    assert c.get('/v1/metrics/workspace-summary', headers=headers).status_code == 200


def test_source_ownership_and_path_boundaries(tmp_path):
    from memento.ownership import bind_owner, verify_source_owner
    from memento.metric_source import member
    root = tmp_path/'owner'
    bind_owner(root, 'customer-a')
    with pytest.raises(ValueError):bind_owner(root, 'customer-b')
    with pytest.raises(ValueError):verify_source_owner({'tenant_id':'customer-b'}, 'customer-a')
    outside = tmp_path/'outside.json'; outside.write_text('{}')
    (root/'link.json').symlink_to(outside)
    for path in ('../outside.json', 'link.json', '/outside.json', 'a//b', '..\\outside.json'):
        with pytest.raises((ValueError, FileNotFoundError)):member(root,path)


def test_undeclared_columns_do_not_cross_the_customer_boundary(customers, signing, tmp_path):
    import hashlib
    import pyarrow as pa
    import pyarrow.parquet as pq
    from memento.manifest import canonical_json
    source, release = customers['customer-a']
    root = tmp_path/'copy'; shutil.copytree(source, root)
    old = root/'metrics'/release
    table = old/'finding.parquet'
    content = pq.read_table(table)
    pq.write_table(content.append_column('sensitive_canary', pa.array(['synthetic-secret']*len(content))), table)
    manifest = json.loads((old/'manifest.json').read_text())
    entry = next(f for f in manifest['files'] if f['path']=='finding.parquet')
    entry.update(bytes=table.stat().st_size, sha256=sha256_file(table))
    manifest.pop('metric_release_id')
    new_id = 'met_'+hashlib.sha256(canonical_json(manifest)).hexdigest()
    manifest['metric_release_id'] = new_id
    (old/'manifest.json').write_bytes(canonical_json(manifest))
    old.rename(root/'metrics'/new_id)
    c = client(root, policy_file(root,new_id,tmp_path/'policy.json'))
    result = c.get('/v1/metrics/findings',params={'release_id':new_id},headers={'cf-access-jwt-assertion':signing()})
    assert result.status_code == 200
    assert 'sensitive_canary' not in result.text and 'synthetic-secret' not in result.text
