"""Demo affordances never claim priority, feasibility, approval or savings."""
from fastapi.testclient import TestClient
import pytest

from memento.api import create_app
from memento.demo_review import review_context
from memento.metric_findings import RULES
from tests.test_descriptive_metrics import read
from tests.test_metric_backend_v2 import supply_fixture
from tests.test_planned_supply import planned_source, publish


@pytest.mark.parametrize("code", list(RULES))
def test_review_options_are_human_questions_not_a_ranker(code):
    value = review_context("met_" + "a" * 64, {"finding_id": "find_" + "b" * 64, "finding_code": code})
    assert value.priority_score is None and value.recommendation is None
    assert value.estimated_action_benefit is None and value.action_deadline is None
    assert "Not measured" in value.result
    assert "Session-only" in value.workflow
    assert value.options[-1].key == "monitor"
    assert all(option.verification for option in value.options)


def test_review_api_is_pinned_read_only_and_rejects_bad_or_missing_id(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    release = publish(tmp_path, canonical, planned_source(tmp_path, source), config)
    client = TestClient(create_app(tmp_path))
    finding = read(release, "finding")[0]
    params = {"release_id": release.name, "finding_id": finding["finding_id"]}
    response = client.get("/v1/metrics/review-context", params=params)
    assert response.status_code == 200
    assert response.json()["metric_release_id"] == release.name
    assert response.json()["finding_id"] == finding["finding_id"]
    assert response.json()["estimated_action_benefit"] is None
    assert client.post("/v1/metrics/review-context", json=params).status_code == 405
    assert client.get("/v1/metrics/review-context", params={**params, "finding_id": "../bad"}).status_code == 422
    assert client.get("/v1/metrics/review-context", params={**params, "finding_id": "find_" + "0" * 64}).status_code == 404
    assert "finding" in client.get("/v1/metrics/metadata", params={"release_id": release.name}).json()["capabilities"]
    assert not (tmp_path / "metrics/current.json").exists()
    with (release / "finding.parquet").open("ab") as stream:
        stream.write(b"corrupt")
    assert client.get("/v1/metrics/review-context", params=params).status_code == 503
