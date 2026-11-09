"""Construct an inactive policy after explicit operator review; no records printed."""
from pathlib import Path
from memento.metric_publication import validate_release
from memento.metric_source import member
from memento.manifest import sha256_file
from memento.security import SecurityPolicy


def approval(root: Path, release_id: str, *, tenant_id: str, issuer: str, audience: str,
             members: dict, classification: str) -> SecurityPolicy:
    from memento.metric_publication import RELEASE_ID
    if not RELEASE_ID.fullmatch(release_id):
        raise ValueError("invalid publication")
    path = member(root / "metrics", release_id + "/manifest.json")
    manifest = validate_release(path.parent)
    from re import fullmatch
    dataset = manifest.get("canonical_dataset_id")
    if not isinstance(dataset, str) or not fullmatch(r"mds_[A-Za-z0-9_]+", dataset):
        raise ValueError("invalid canonical identity")
    canonical = member(root / "canonical", dataset + "/manifest.json")
    if sha256_file(canonical) != manifest.get("canonical_manifest_sha256"):
        raise ValueError("canonical binding mismatch")
    policy = SecurityPolicy.model_validate({"version": 1, "tenant_id": tenant_id,
        "issuer": issuer, "audience": audience, "members": members, "classification": classification,
        "manifests": {p.relative_to(root).as_posix(): sha256_file(p) for p in (path, canonical)}})
    for p in (path, canonical):
        policy.approved_manifest(root, p)
    if manifest.get("source_classification") != classification:
        raise ValueError("classification mismatch")
    return policy


def main() -> int:
    import argparse
    import json
    import subprocess
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', required=True, type=Path)
    parser.add_argument('--release-id', required=True)
    parser.add_argument('--tenant-id', required=True)
    parser.add_argument('--issuer', required=True)
    parser.add_argument('--audience', required=True)
    parser.add_argument('--members-file', required=True, type=Path)
    parser.add_argument('--classification', required=True, choices=('synthetic','internal','confidential_customer'))
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    try:
        root = args.data_root.resolve(strict=True)
        policy = approval(root, args.release_id, tenant_id=args.tenant_id, issuer=args.issuer,
                          audience=args.audience, members=json.loads(args.members_file.read_bytes()),
                          classification=args.classification)
        output = args.output.resolve()
        if not args.output.is_absolute() or args.output.is_symlink() or output.is_relative_to(root):
            raise ValueError('separate explicit policy location required')
        repository = Path(__file__).resolve().parents[1]
        if output.is_relative_to(repository):
            result = subprocess.run(['git','check-ignore','--quiet',str(output)],cwd=repository,check=False)
            if result.returncode != 0:
                raise ValueError('policy must not enter source control')
        output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with output.open('x', encoding='utf-8') as handle:
            output.chmod(0o600)
            handle.write(policy.model_dump_json(indent=2))
    except Exception:
        parser.exit(1, 'Publication approval failed; review ownership, classification and the separate output location.\n')
    print('Inactive policy created; live activation requires review.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
