# Deposit Trust evidence handoff — isolated, read-only development

## Scope and tested flow
- The existing Deposit Trust tenant-ledger *calculator* is a standalone preview; it is **not a persisted, verified tenant liability register**.
- A SELECT-only PostgreSQL export reads synthetic DEPOSIT receipt/refund/reversal preview event metadata at a common cutoff. It does **not** infer statutory Security Deposit, Pet Deposit, Other Deposit or Unidentified Deposit account categories from generic event records.
- The deposit JSON is explicitly `UNPOSTED_PREVIEW` with `tenant_subledger_verified=false`, `component_codes_verified=false`, no posted liabilities, and no reconciliation certification.
- Python validates these constraints and separately constructs an **illustrative only** combined Rent/Deposit reconciliation report from synthetic evidence bundles. Combined results require *different* RBC bank identifiers, *different* Books bank account identifiers and the *same cutoff*. Missing required Deposit codes 2120, 2125, 2130, 2135 or differing components fail.
- No production database reads or writes occurred during development. Automated CI uses disposable PostgreSQL 16 and synthetic sources.

## Critical gaps
1. Approved mapping of RBC Deposit Trust bank to a single, distinct Books bank account is not available.
2. Independent dated RBC statement, supported timing items, Books cutoff cash GL / liability GL, tenant-by-tenant posted security/pet/other/suspense subledgers and approved opening balances are not available.
3. These generic event previews do not persist deposit type or tenant/legal liability classification and cannot prove outstanding tenant balances or deposit interest; never treat the preview sum as a ledger.
4. Independent accountant and Managing Broker UAT and role-authenticated signature are needed. A matching synthetic arithmetic result is **not** a live financial signoff.
5. No Books posting, deposit refund, rental invoice, bank transfer or owner payout code has been enabled or deployed.

QA workflow: `Iris Consolidated Finance QA (NO POSTING)`. Draft PR #11. Results are meaningful only for the exact tested commit.