# Signal serving boundary

Status: implemented MVP contract

The calculation job publishes immutable Parquet artifacts; it does not serve requests.
`SignalStore` reads the current release only after validating its pointer, manifest,
declared file inventory, sizes, and SHA-256 hashes.

## Discovery

`data/signals/current.json` contains only the current signal-set identity and relative
manifest path. The pointer moves atomically after complete publication. Absolute paths,
traversal, symlinks, missing members, identity mismatches, and checksum mismatches fail
closed.

## API operations

- `GET /healthz` validates and identifies the current Signal release.
- `GET /v1/signals` returns the immutable overall top ten. A type filter narrows that
  set without reranking or renumbering it.
- `GET /v1/signals/{signal_id}` returns one displayed signal and its published evidence.
- `GET /v1/signals/{signal_id}/investigation` returns a release-bound synthetic
  investigation artifact when one has been published.

The API validates response models and JSON encoding. It does not calculate metrics,
change ranks, infer probabilities, or scan raw source extracts.

## Storage boundary

Signal releases contain `signal.parquet`, `signal_evidence.parquet`, and, when the
supply model is active, `supply_context.parquet`. Investigation JSON is published as a
separate immutable release bound to both the Signal and canonical manifest hashes.
