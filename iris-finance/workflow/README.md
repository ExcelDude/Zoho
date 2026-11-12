# Iris integrated finance dry run — NO PRODUCTION POSTS

This branch inherits rent-preflight and agreement fee modules and adds a safe workflow preview, in-memory event monitor staging, and custody-aware deposit deadline/interest previews.

Commands (Node 20+):
- `node iris-finance/rent-preflight/preflight.test.mjs`
- `node iris-finance/fees/fee_rules.test.mjs`
- `node iris-finance/workflow/finance_preview.test.mjs`
- `node iris-finance/workflow/staging_queue.test.mjs`
- `node iris-finance/deposits/deposit_preview.test.mjs`

**Finance preview:** for every lease requires active management, effective lease, owner/tenant references, one signed effective owner agreement, legacy terms if applicable, verified Books tenant identity, ownership entitlement and signed lease billing terms. Placement-only contracts exclude ongoing Iris rent charges. Even when screening passes, `postingAllowed=false`.

**Queue:** only caller-approved staging previews with a canonical SHA-256 digest can create a simulated `RENT_CHARGE_REVIEW_ONLY` entry in the in-memory event monitor. There is no Books posting adapter. No actual invoice or transfer occurs.

**Deposits:** managed deposits are kept distinct from placement-only owner handoffs. Deadline preview is 15 days after the later of tenancy end and written forwarding address (subject to actual legal review and case facts). No deductions without tenant's written consent or RTB order. Actual custody start/end must be verified. Interest returns zero only for fully supplied zero-rate periods; nonzero interest and missing annual rates are held for RTB calculator parity. Deposit/interest totals are not payment authorizations.

**Open implementation gates:** source agreement list from Nico, missing ownership links from Jhony, effective-dated owner relationship / historical capture, signed lease and tenant→Books identity crosswalk, account mapping, tax/CRA and BCFSA legal approval, bank and GL opening balances, production authentication, durable queue worker, end-to-end staging UAT. No live financial records changed.
