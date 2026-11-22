# Iris Trust Reconciliation — Preview/Evidence Handoff QA

This development-only handoff connects the *disposable PostgreSQL* trust preview tables to the Python reconciliation engine by an explicit JSON contract.

## End-to-end test flow
1. Existing JavaScript rent controls insert a synthetic 60/40 cleared receipt into the immutable PostgreSQL **preview** event/manifest/allocation tables.
2. `reconciliation_preview_export.mjs` uses **SELECT-only** queries to extract per-source owner preview totals, receipts, manifest fingerprints and open exception counts at a cutoff.
3. The generated `iris-trust-preview-v1` JSON is read by `handoff.py` and validated. It is always labeled `INFORMATIONAL_PREVIEW_ONLY` and **never** qualifies as a posted owner liability subledger. Previous fixture events in the same disposable database are included, so a separate test checks the specific sample receipt and the aggregate.
4. A separate synthetic `iris-certified-evidence-v1` contract shows what **real** reconciliation input must eventually contain: exact independently approved RBC and Books bank mapping, dated signed bank statement and supported timing adjustments, dated Books liability/cash GL export, verified **posted** subledger including rent/suspense component codes, cutoff alignment, and independently identified reviewers.
5. Only that separately attested class of evidence is passed to the existing Python reconciliation algorithm. Synthetic claims in the tests are not authentication and not actual accounting certifications.

## Demonstrated protections
- Unposted receipt allocations or arrears reservations cannot be labeled an accounting liability balance.
- Wrong organization, wrong trust pool, missing/foreign liability codes, duplicate receipt IDs, timing discrepancies, mismatched cutoff and noninteger money are rejected or marked BLOCKED.
- An internally reconciled synthetic arithmetic example is **not production approval**.
- No bank transfer, Books invoice, GL journal, owner payout or owner statement publication interfaces are enabled.

## Real evidence still unavailable / production gates
- RBC Rent Trust vs Deposit Trust account IDs and exact Books bank-account ID mappings have not been approved.
- Actual cutoff RBC statements, deposits in transit and outstanding checks/evidence, Zoho Books dated cash/liability GL balances, and independently verified owner and tenant subledgers must be provided.
- Actual source adapters, signed source payload authentication, review identity/role enforcement, bank cutoff reconciliation and accountant/Managing Broker approval are not connected.
- Read-only export query currently includes only matched receipt preview manifests/allocations. That is **not a complete subledger** and must never be represented as one.
- Deposit Trust has an arithmetic reconciliation engine but **no** live tenant deposit ledger evidence handoff in this increment.

## CI
Run `Iris Consolidated Finance QA (NO POSTING)` on the draft branch. Both Python and disposable PostgreSQL tests are required. No production database is accessed.
