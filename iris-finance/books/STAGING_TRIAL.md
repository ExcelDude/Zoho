# Isolated Books draft-invoice staging trial (BLOCKED UNTIL TEST ORG EXISTS)

**No live invoices have been created.** Current connected Books plugin does not provide invoice create/get operations, and we have **no independently verified isolated test Zoho Books organization**. The runner accepts a caller-provided adapter and exercises preflight/draft/readback in mock tests only.

The runner explicitly refuses Iris Books production org `110003520057`, requires a distinct explicitly confirmed test org and customer, explicit write authorization, `IRIS-STAGE-` event ref, `TEST-AG-` agreement ID, a strict expected fee/tax/item amount, and an authoritative search by invoice reference **before** draft creation. It creates **draft only**, never sends an email, records a payment, charges a card, transfers trust funds or executes a payout.

After creating a draft, the adapter fetches the saved invoice for comparison: actual Books invoice ID, customer, reference, draft status, one item, tax, and total. If outcome of the write is uncertain, it holds for manual reconciliation rather than blindly retrying.

**Important:** this does not guarantee exactly-once creation under concurrent processes. Production use still requires durable idempotency with atomic unique constraint, logging and concurrency locks, and an approved accounting mapping.

A real staging test requires: (1) separate test Books org (not production Iris), (2) approved test contact, (3) OAuth with invoice create/find/get scopes, (4) validated response schema and tax calculation, (5) accountant signoff. This code does not supply those prerequisites.

Run with `node iris-finance/books/staging_trial.test.mjs` to execute mocked scenarios.
