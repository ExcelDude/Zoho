# Read-only January rent simulation
This module ingests only the currently exposed Iris resources `leases`, `properties`, and `property_ownership`. It does not call an unexposed owner identity, agreement or tenant payment API. All relevant data are read-only; it **does not send names/emails or financial data to GitHub**.
- Eligible candidates: lease `status=active`, property `management_status=active`, and lease period intersects requested calendar month.
- Scheduled rent comes from current lease `rent_amount`, not a confirmed tenant charge or bank receipt. No proration for leases beginning part way through month; that requires validated contract billing rules. Neither invoice nor cash receipt is created.
- Owner relationship rows are checked for missing or non-100% ownership allocation; all candidate events remain HOLD until agreement, identity, tenant mapping, billing policy, approval and bank/trust controls are verified.
- Version digest covers relevant **read-only source data**; it is a snapshot fingerprint, not a database revision or guaranteed event sequence. Snapshot capture needs an atomic or watermark-based production strategy.
- The loader verifies page offsets/counts and refuses incomplete pages; the API must be called through an authorized server-only adapter.

**2026-11-16 read-only inspection:** Iris currently returned 127 leases, 144 properties, 130 ownership links. January 2027 date-overlap eligibility produced 70 candidates / CAD 223,887.65 scheduled rent; six candidates have no ownership links. These totals are a point-in-time analytical snapshot, not real invoices, deposits, receivables or fees, and may change.

Testing `node --test iris-finance/integration/iris_readonly_adapter.test.mjs` uses synthetic lease fixtures only. No live data captured in tests.
