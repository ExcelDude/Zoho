# First successful live Zoho Books draft-invoice acceptance — November 13, 2026

**Actual Iris Books organization:** 110003520057. **Test-only customer:** 242438000000051006, created without customer email. **Draft invoice:** 242438000000051013 / INV-000001, reference `IRIS-STAGE-20261113-FEE-TEST-001`.

Successfully created with Books MCP Create Invoice and independently fetched using Books MCP Get Invoice. Readback: status `draft`; customer 242438000000051006; management fee item 242438000000032035; rate CAD 600.00 x 1; GST 5% tax ID 242438000000031068; subtotal CAD 600.00, GST CAD 30.00, total CAD 630.00. No email sent, payments received or funds transferred.

Two real API learnings: (1) `tax_selection_mode` was rejected (code 8), so omitted. (2) Books required tax information for the customer (code 110818); the dedicated test customer's default tax was set to the existing 5% GST tax. Don't change real owner tax settings as a shortcut.

This test-only draft is **not a valid real-owner charge**. It must be excluded from production owner statements, reconciliation and billing runs. Draft invoice can still affect reports depending on Books reporting basis/configuration — accountant should confirm. No chart-of-accounts journal posting has been confirmed; account transactions endpoint returns linked entity types, not journal lines.

`reconcile_fee_draft.mjs` adds a no-write control for independently fetched invoice details + reference uniqueness. It never authorizes accounting posting, sending, trust transfer or payout. Full production uses a durable event journal, approved agreement, stable owner→Books contact IDs, data completeness, accountant signoff and bank mapping.

No automatic function has been deployed in Zoho Books or Iris backend. Source files are development/version control artifacts.
