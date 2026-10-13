# Memento Signal acceptance status

Updated: 2026-10-12. Product acceptance remains blocked. See
[the full-scale findings](memento-signal-full-scale-findings.md) for the diagnosis,
matured evaluation, technical checks, and required source correction.

## Approved carrying-cost assumption

- Annual carrying-cost rate: `0.25` (25% of inventory cost per year).
- Configuration version: `synthetic-toy-retail-benchmark-v1`.
- Intended use: synthetic toy-retail demonstration. This is an assumed benchmark,
  not a measured customer rate.
- The rate remains an explicit Memento CLI input and part of the signal manifest's
  configuration and content identity.

## Full-scale execution evidence

The validated Synthetic Data handback reports commit
`67fa902d339daf0a07f8e5d0ab1e748fc7974244` and simulation
`4ead8d45af58002bfc8a30c0d6241e92019f6ab4e917d7df7e379621788bfd5a`.
Its initial, evaluation, and archive release cutoffs are respectively
`2027-01-30T12:00:00Z`, `2027-02-27T12:00:00Z`, and
`2028-01-29T12:00:00Z`.

Initial-release ingestion completed in 211.46 seconds and published canonical
dataset `mds_0779df6554b9230828803ece846ebbfa454a8e1317b77ba31af03395b3dd929a`
with ten tables. Maximum resident set was 3,277,914,112 bytes.

Prediction completed in 228.20 seconds and published prediction set
`mps_c1d921fd006f0d11f219ae3e424c73d33d40790d50ff04a8d07710941885ed7d`.
Maximum resident set was 9,330,753,536 bytes; reported peak memory footprint was
23,610,941,680 bytes.

Signal generation published 130,524 candidates: 121,392 availability, 9,065 demand
momentum, and 67 inventory imbalance. All ten displayed signals are availability.
Published hashes, all ranks, evidence references/counts, immutable publication
reuse, full-scale API responses, and browser queue/detail/filter behavior passed.
The expired terminal session prevents recovering final runtime; the last recorded
lower bound was 7 hours 49 minutes.

The evaluation release ingested successfully. All initial predictions are evaluable,
but precision at ten is 0.0. Only 2,341 of 121,392 predicted pairs have an observed
stockout. The 0.5028-day mean absolute date error applies only to those positive
outcomes, not the displayed ten or all predictions.

Archive ingestion also passed, covering all 728 days through 2028-01-28 in ten
canonical tables. Its measured runtime was 394.48 seconds. See the full findings
for archive identity, validation evidence, and replay results.

Source calibration fails: annual observable sales are $247.7 billion against a
configured $125 million target. Normalized store allocation is multiplied by the
store count a second time. That requires a separate Synthetic Data correction and
new immutable releases; this repository did not modify source code or artifacts.

## Remaining acceptance work

- Correct source calibration in Synthetic Data and repeat acceptance on a new world.
- Resolve the product meaning of conditional commitment depletion versus observed
  stockout prediction under continued automatic replenishment.
- Independently recompute all signal producers for the corrected world; current
  replay evidence verifies immutable publication reuse only.
- Verify the controlled mixed-type fixture gate separately. The approved plan does
  not require a mixed top ten for every full-scale dataset.
- Address signal-generation scalability: `run_signals` queries history, calendar,
  and inbound data inside its observation loop. Bulk preparation should be tested
  for equivalent calculations and materially improved runtime.

Generated datasets remain under the ignored local `data/` directory and are not
part of this delivery. The Synthetic Data repository is read-only from Memento.
