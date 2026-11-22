# Zoho Books evidence adapter — read-only, cutoff-safe

The adapter reads account inventory through an injected read-only Books client. It **never** guesses which of Iris's four identically named `Current Account` bank accounts is Rent Trust, Deposit Trust, or Operating. It **never** substitutes a current account balance or empty transactions response for a validated historical month-end GL balance.

## Interfaces
- `inspect_mapping(client, ApprovedMapping)`: verifies explicitly approved account IDs, types and codes against Books inventory. Requires a bank mapping approved by Iris.
- `collect_books_cutoff(..., DatedBooksExport, cutoff)`: validates dates, individual account IDs and a signed/datable Books GL export; returns integer-cent bank and liability balances only. It **does not** establish trust reconciliation or approve an export's authenticity by itself.
- `build_unapproved_preview`: returns a `CutoffEvidence` with missing evidence marked as missing; reconciliation remains **BLOCKED**.
- `BooksClient`: injectable adapter protocol. Supply a read-only account inventory implementation from a secured service; do not put tokens in this module.

Use `python -m unittest discover -v` in this directory. Both suites are synthetic, with no production postings.

## Remaining integration gates
1. Iris confirms RBC masked identity -> exact Zoho Books bank account ID for each trust pool.
2. Accountant supplies a dated and approved Books GL/trial-balance export and all relevant liability/suspense components.
3. Iris supplies RBC statements, bank timing adjustment evidence, opening balances and principal/tenant subledger.
4. Finance approves historical signs, permitted control-code mapping and event cutoffs.
5. A verified runtime Books read-only client and historical report-export intake are connected and integrated with `reconcile_both`. Real-month cutoff and UAT approval must precede any claim of successful financial reconciliation.

**No live posting, reconciliation approval or bank identity inference.**
