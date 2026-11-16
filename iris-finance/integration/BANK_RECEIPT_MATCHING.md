# Bank receipt matching — read-only, no account categorization

This module is a conservative reconciliation candidate matcher. It does NOT automatically allocate rent, categorize or reconcile a Zoho Books bank transaction, enter a trust receipt, or contact owners/tenants.

## Requirements to promote a review candidate
- Exact Books bank account ID with accountant-approved pool mapping (RENT_TRUST, DEPOSIT_TRUST, OPERATING).
- Independent Books and bank statement settlement evidence; the transaction must be CLEARED.
- Independently verified tenant/Books customer mapping and lease/property association.
- For rent, expected monthly amount; for deposits, separately verified security/pet deposit type and expected amount.
- Duplicate transaction references, unmatched partial payments, ambiguous values and wrong account pools are held rather than guessed.

Never infer a tenant solely from payer name, email, property address, memo, or amount. Partial payments and multi-tenant allocations require deliberate separate reconciliation.

### Current API gap (2026-11-16)
The connected Iris Books tool exposes four chart-of-account entries with account_type=bank, each named "Current Account", IDs 242438000000036029, 242438000000036020, 242438000000036011, 242438000000036038. The chart-of-account transaction query for one bank account for November returned zero rows. This does **not** prove there were no bank transactions; a full bank feeds list and mapping are not exposed by this connector. No bank identity or trust-account role has been assumed.

The module takes normalized receipts as inputs from a future trusted Books bank-feed read adapter. In the absence of real cleared receipt evidence, all actual matching remains blocked. No raw tenant/bank PII is stored in GitHub.

Run `node --test iris-finance/integration/receipt_matcher.test.mjs` using fake records only.
