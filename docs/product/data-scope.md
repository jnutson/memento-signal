# MVP data scope

Status: current

The supported input is one explicit release-set manifest binding a Walmart observable
package to its exact Miro extension package. Source paths are resolved relative to the
declared release root and validated before DuckDB scans any Parquet content.

## Walmart observable inputs

- calendar
- location
- item
- daily store sales
- daily store inventory
- weekly retailer demand forecast vintages

## Miro internal inputs

- company-item mapping
- versioned replenishment commitments
- effective-dated reaction constraints
- effective-dated approved unit economics

Canonical publication produces ten physically separate datasets. Raw, canonical,
Signal, and investigation data remain distinct. Source extracts are never copied or
mutated. Customer data, private future truth, secrets, and raw payloads are prohibited
from source control, logs, fixtures, and model context.

The current engineering cohort and supply model are synthetic. Expanding the cohort or
using customer data requires explicit approval and the controls listed in the trust-
boundary documentation.
