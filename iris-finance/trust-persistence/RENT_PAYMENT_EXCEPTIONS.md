# Rent payment exception gates — preview only

This branch extends multi-owner rent receipt previews with an independent **verified rent obligation gate**. It never posts invoices, applies payments, modifies bank records, pays owners, or writes to Iris production data.

* **Underpayment:** if the cleared receipt is less than the independently verified remaining obligation, the bank receipt can be previewed as a partial allocation. An outstanding balance is reported, but no arrears statement is created.
* **Exact payment:** the receipt is eligible for a preview when all evidence and identity gates pass.
* **Overpayment / unapplied:** excess funds, already-paid rent, or an existing credit balance are **HOLD** conditions; none of the excess is silently allocated to owners.
* **NSF / reversal:** only constructs a *review candidate* with original event reference, independently verified bank/Books reversal evidence, full amount match, and accountant approval. It does not mutate old events or create a Books reversal.

The multi-owner database store now requires an approved lease/tenant/property-specific rent balance snapshot and verified prior receipt history before it creates even a preview record. Real PostgreSQL tests demonstrate a held overpayment produces no event row.

## Critical remaining limitations
1. There is no deployed Iris source adapter that verifies approved rent balance snapshots or RBC/Books payment evidence.
2. A snapshot can become stale between independent bank transactions. **Production requires an atomic per-lease receipt reservation/serialization mechanism**, with finance-approved treatment of refunds, multi-period allocation, rent credits, holdbacks and partial NSF.
3. The current NSF workflow is a pure review classifier only. No append-only reversal persistence, outstanding-balance recovery, bank/Books reconciliation, or RTB/accountant approval is implemented.
4. Overpayment exception cases are returned to the caller but are not yet stored in a dedicated unlinked-receipt exception queue.
5. The code and PostgreSQL tests remain on an **unmerged draft branch**. No deployment is authorized.

Test: `node iris-finance/trust-persistence/rent_payment_exceptions.test.mjs` or the GitHub Actions multi-owner PostgreSQL workflow. No credentials are embedded.
