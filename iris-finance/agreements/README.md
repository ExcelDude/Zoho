# Iris owner agreement registry validation — no financial writes

The new agreement registry allows Nico's signed agreement list to be supplied as a **metadata-only CSV** and reviewed independently of PMS schema changes. It does not ingest or copy private PandaDoc documents, banking details, residency evidence or sensitive PII.

Required columns: `agreement_id,owner_id,property_id,type,version,signed_at,effective_start,management_pct,document_ref,review_status`. Optional: `effective_end,nonresident,nonresident_verified,special_rate_approved,legacy_terms_verified`.

Recognized types: `FURNISHED_V4`, `UNFURNISHED_V4`, `PLACEMENT_V1`, `LEGACY`. No agreement is treated as approved unless signed date, effective date, source document reference and reviewer status are present. All rows with missing/contradictory fields or overlapping effective dates remain held. Legacy terms must be verified individually. Explicitly authorized special rates may be reviewed, but never posted automatically.

**Co-ownership caveat:** multiple overlapping individual-owner agreements for one property are intentionally flagged. Facu/Nico must identify a canonical contract and legal owner allocation; we do not automatically choose among them.

Use `parseCSV(csvText)` then `validateAgreements(rows)` in a controlled, private runtime. The validator returns codes, review summaries and `postingAllowed:false` for all records.

Run `node iris-finance/agreements/registry.test.mjs` (Node 20+). Code/test files contain only fabricated example records.

Books live items/tax checks are tracked separately. Before production: obtain actual agreement metadata from Nico; verify completeness, owner/property identity, effective versions and approvals; reconcile to Iris read-only lease/ownership data; then test fee calculation and Books invoice response in staging.
