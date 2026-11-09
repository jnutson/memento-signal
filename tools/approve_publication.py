"""Create a deployment policy from explicitly reviewed tenant-owned manifests.

Running this on customer artifacts requires the operator's data-handling approval.
This command never prints records, identities, paths, tokens, or policy contents.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from memento.manifest import sha256_file
from memento.ownership import require_owner
from memento.security import SecurityPolicy
from memento.serving import SignalStore


def approve(root: Path, signal_set_id: str, *, tenant_id: str, issuer: str, audience: str,
            members: dict, classification: str) -> SecurityPolicy:
    store = SignalStore(root / "signals", root / "canonical", signal_set_id)
    signal_root, signal_manifest = store.current_release()
    canonical_root, canonical_manifest = store.canonical_release()
    for manifest in (signal_manifest, canonical_manifest):
        require_owner(root, manifest)
        if manifest.get("tenant_id") != tenant_id:
            raise ValueError("publication ownership is not approved")
    if canonical_manifest.get("source_classification") != classification:
        raise ValueError("publication classification is not approved")
    return SecurityPolicy.model_validate({
        "version": 1, "tenant_id": tenant_id, "issuer": issuer, "audience": audience,
        "members": members, "classification": classification,
        "manifests": {path.relative_to(root).as_posix(): sha256_file(path)
                      for path in (signal_root / "manifest.json", canonical_root / "manifest.json")},
    })


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", required=True, type=Path)
    parser.add_argument("--signal-set-id", required=True)
    parser.add_argument("--tenant-id", required=True)
    parser.add_argument("--issuer", required=True)
    parser.add_argument("--audience", required=True)
    parser.add_argument("--members-file", required=True, type=Path)
    parser.add_argument("--classification", required=True, choices=("synthetic", "internal", "confidential_customer"))
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        root = args.data_root.resolve(strict=True)
        policy = approve(root, args.signal_set_id, tenant_id=args.tenant_id, issuer=args.issuer,
                         audience=args.audience, members=json.loads(args.members_file.read_bytes()),
                         classification=args.classification)
        if not args.output.is_absolute() or args.output.is_symlink() or args.output.is_relative_to(root):
            raise ValueError("policy output must be an explicit separate control location")
        args.output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        # Never replace an existing policy or change live permissions implicitly.
        with args.output.open("x", encoding="utf-8") as handle:
            args.output.chmod(0o600)
            handle.write(policy.model_dump_json(indent=2))
    except Exception:
        parser.exit(1, "Publication approval failed; review ownership, classification, membership, and output location.\n")
    print("Deployment policy created. Live activation requires review.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
