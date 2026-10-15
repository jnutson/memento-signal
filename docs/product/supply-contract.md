# Synthetic supply contract

Status: current engineering assumption
Projection version: `expected-replenishment-v4`

The optional supply model is a separately hashed JSON input. It declares effective
dates, synthetic classification, product categories, route stages, elapsed-calendar-day
ranges, action prerequisites, and reorder policy. Nodes are roles rather than observed
facilities; no vendor stock, capacity, or authority is invented.

Outstanding firm supply is ordered minus received from the latest PO-line version known
at the cutoff, excluding cancelled lines. A partially invoiced line can contain disjoint
open and in-transit portions. Explicit future receipt dates anchor typical timing;
overdue dates remain overdue rather than being shifted silently.

Planned replenishment uses only frozen demand, current stock, outstanding firm supply,
and declared reorder and target-cover days. It is rebuilt from each snapshot and does
not append prior plans as extra supply.

Committed and early/typical/conservative supply paths are reported separately while
holding demand fixed. They are distinct from low/base/high demand sensitivity paths.
Unknown prerequisites remain non-executable. Supply evidence never authorizes an order,
production commitment, or inventory movement.
