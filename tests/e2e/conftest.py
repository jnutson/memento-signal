from pathlib import Path

import pytest

from tools.synthetic_demo import build_attention_release_set


@pytest.fixture
def attention_release_set_manifest(tmp_path: Path) -> Path:
    return build_attention_release_set(tmp_path)
