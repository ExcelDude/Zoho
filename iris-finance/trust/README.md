# Rent Trust owner/principal subledger preview — read-only
Integrates with existing Iris finance engineering patterns: immutable source IDs, owner/property/ownership-snapshot allocations, integer CAD cents, separate suspense, explicit bank/Books evidence, and fail-closed exception handling.

Pure deterministic **preview only**, not a production ledger or accounting service. An approved opening row is required per owner/property/ownership snapshot for allocations. Settled receipts, authorized expenses/payouts, suspense release and reversal scenarios are checked. Missing evidence, duplicate source IDs, inconsistent allocation totals, unmatched ownership slices and negative balances are HOLD conditions.

This reference module never posts to Books, allocates cash in the real bank, changes a deposit trust record, or authorizes owner payouts. A `READ_ONLY_PREVIEW` result does **not** mean that bank reconciliation or payout approval has been completed.

Tests: `node iris-finance/trust/rent_trust_ledger.test.mjs`.

**Production blockers:** signed owner mappings and legal identity, actual RBC→Books bank mapping, cleared bank/Books references, approved opening balances, persistent immutable events and unique indexes, settlement/reversal histories, owner holds/reservations, three-way reconciliation, multi-user concurrency tests, formal accountant/Managing Broker UAT, and deployment. No trust or finance production writes.
