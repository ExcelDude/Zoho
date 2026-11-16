# Iris Finance event integration engine v1 — DRY RUN ONLY

The goal is a **central integration layer**, not a change to Iris PMS. The current engine is no-write: it validates incoming source events, derives an immutable source/event/version identity, records a payload hash, claims work through a pluggable durable store, evaluates safety gates, and stores a projection for the bookkeeping team. No live Zoho Books write calls exist in this component.

## Event workflow
1. Receive a versioned event from Iris or Books. `sourceSystem + sourceId + sourceVersion + event type` defines the idempotency key. Changes must supply a new sourceVersion; a different payload under the same key is QUARANTINED.
2. Atomically insert-or-get and claim through a durable transactional adapter. Repeated polling cannot run same event concurrently.
3. Evaluate source identities, agreement rules, bank evidence, and approved snapshots. Missing data goes to HOLD and the exception dashboard.
4. Save an immutable review projection with event origin, version, hash, and action. No invoice/payment/statement is created as part of this version.
5. Future Zoho Books adapter must do reference lookup, CREATE only when authorized with a verified reference, then GET and verify. Timeouts after a write cannot be blindly retried. The first live draft invoice experiment remains separate.

## Durable infrastructure required
`schema.sql` is a **database design, not deployed**. The store adapter must implement transactional `insertOrGet(event)`, `claim(eventKey, timestamp)`, `complete(eventKey, token, status, projection, timestamp)`, `quarantine(eventKey, reason)` and audit events. The temporary memory store in tests proves semantics but must never be used in production. The SQL sketch does NOT implement claim/lease/recovery or a production worker yet.

## References
- `iris-finance/books/reconcile_fee_draft.mjs`: verifies invoices by readback, status, tax and amounts.
- `iris-finance/identity/crosswalk.mjs`: requires verified owner-to-Books customer mapping.
- `iris-finance/payout/payout_preview.mjs`: payout previews only.
- `iris-finance/statements/statement_generator.mjs` and `statement_approval.mjs`: statement preview, separated review approvals.
All stay on this branch, unmerged.

## Remaining
Implement persistent DB storage and source adapters, deterministic reconciliation, auth for approvers, operational run loop, observability, and staging end-to-end exercises before deployment. No real owner transactions can be enabled until agreements, identities, opening balances, trust/bank GL and settlement approval are verified.
