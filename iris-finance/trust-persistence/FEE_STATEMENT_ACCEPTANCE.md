# Owner invoice and statement acceptance gate (read-only)

This increment connects previous **Iris management-fee quote**, **owner Books customer ID crosswalk**, **Zoho Books draft invoice payload**, **invoice readback validator**, and **immutable Finance/Managing Broker statement approval** prototypes.

## What is checked
- Cash collection, ownership, tax and signed effective-dated agreement evidence must be marked independently verified. The flags themselves are *not authentication* and are synthetic inputs in CI.
- Owner Books customer must be an ACTIVE customer with unique Iris owner and Books ID mapping, a reviewer, date and non-name-only evidence.
- Books organization **110003520057**, management-fee item **242438000000032035**, and GST tax **242438000000031068** must match independently read Books configuration. The item rate of zero is never used as the fee amount.
- Owner-level fee quote is converted to an **unsent mapping preview** via the existing `makeDraft` prototype, retaining the signed agreement ID, version, type and effective-from date.
- Independently retrieved Books invoice details may be compared against exact organization, customer, reference, item, tax, base, GST and total using the existing readback validator. This cannot authorize collection or an actual invoice.
- A *separate* owner-statement workflow must come from actual settled owner ledger entries, verified opening balances, approved bank/GL reconciliation and the versioned statement generator; fee quotes are **not** statement ledger entries. A distinct bookkeeper, Finance Reviewer and Managing Broker approval record must pass existing immutable-hash checks. Owner portal delivery remains disabled.

## Critical limitations
No production adapter is connected. No actual Iris agreement PDF signature or fee rate has been verified by this program; historical workbook agreement reference rows alone do not prove signed terms. The Google Sheet 'Owner Books ID Crosswalk' has placeholders; live Books links reported elsewhere require independent reconciliation with the exact owner IDs and provenance before acceptance.

The approval and readiness objects are local in-memory proofs, not persistent authenticated approvals. A match against a synthetic Books invoice is not an actual Zoho Books readback. Existing invoice totals must be independently sourced. Statement publication, payments, Books invoice creation, trust liability updates, trust-to-operating transfer, CRA remittance and payouts all remain disabled. No schema was deployed.

Test command: `node iris-finance/trust-persistence/fee_statement_readiness.test.mjs`. The CI workflow also executes the prior finance and disposable PostgreSQL tests.

Draft PR only; do not merge/deploy until owner mappings, signed agreements, independent banking/Books evidence, restricted service identity, accountant sign-off and Managing Broker UAT have been accepted.
