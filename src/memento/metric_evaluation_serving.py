"""Read-only access to immutable metric evaluation receipts."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re

from .manifest import canonical_json
from .metric_source import member,verified_file


def read_evaluation(data_root: Path, evaluation_id: str) -> dict:
    if not re.fullmatch(r"eval_[a-f0-9]{64}",evaluation_id):
        raise ValueError("invalid metric evaluation ID")
    root=data_root/"metric_evaluations"/evaluation_id
    report=json.loads(member(root,"manifest.json").read_text())
    identity={k:v for k,v in report.items() if k!="evaluation_id"}
    if (report.get("evaluation_id")!=evaluation_id or report.get("version") not in {"observable-metric-replay-v1","observable-metric-replay-v2"}
        or evaluation_id!="eval_"+hashlib.sha256(canonical_json(identity)).hexdigest()):
        raise ValueError("metric evaluation identity mismatch")
    files=report.get("files",[])
    if len(files)!=2 or {f.get("path") for f in files}!={"pair_horizon.parquet","episode_evaluation.parquet"}:
        raise ValueError("invalid metric evaluation files")
    for entry in files:
        verified_file(root,entry)
    return report
