from decimal import Decimal
from pathlib import Path
import shutil

from memento.signals import run_signals
from test_prediction_pipeline import _canonical_fixture
from tools.verify_signal_release import verify


def test_release_verifier_checks_real_api_and_distinguishes_publication_replay(tmp_path: Path):
    source = tmp_path / "source"
    source.mkdir()
    fixture = _canonical_fixture(source)
    root = tmp_path / "data"
    canonical = root / "canonical" / "mds_fixture"
    canonical.parent.mkdir(parents=True)
    shutil.copytree(fixture, canonical)
    release = run_signals(canonical, data_root=root, annual_carrying_cost_rate=Decimal("0.25"), carrying_rate_version="synthetic-test-v1")
    before = (release / "manifest.json").read_bytes()
    result = verify(root)
    assert result["ranking_recalculation"] == "passed"
    assert result["immutable_publication_replay"] == "passed"
    assert result["full_source_producer_recomputation"] == "not run"
    assert result["top_ten_counts_by_type"] == {"availability": 1, "demand_momentum": 0, "inventory_imbalance": 0}
    assert (release / "manifest.json").read_bytes() == before
