# Iris Finance — Consolidated QA acceptance (development only)

## Included work
The branch inherits the cumulative code line from `iris-fee-owner-statement-bridge-v1`, which already contains the rent trust owner-ledger preview, durable trust event/exception store, finance source bridge, multiowner allocation, rent payment exception gates, arrears reservations, and owner management fee/statement readiness prototypes. This branch additionally incorporates the eight files from the previously divergent `iris-trust-reconciliation-engine-v2` line. There is one unified CI configuration: `.github/workflows/iris-finance-consolidated-qa.yml`.

**Do not treat branch co-location as verified end-to-end live integration.** The reconciliation engine is Python, while the receipt and owner controls are JavaScript; their live evidence adapter contract, durable event-to-reconciliation extraction, accounting sign conventions, and source-data provenance still require review.

## Acceptance matrix — no financial writes
| Boundary | Test evidence | Live status |
| --- | --- | --- |
| Immutable trust events, duplicate quarantine | Disposable PostgreSQL CI tests | NOT DEPLOYED |
| Corrected receipt and concurrent obligation reservation | Disposable PostgreSQL CI tests | NOT DEPLOYED |
| Multi-owner 60/40 and partial receipt splits | Synthetic + PostgreSQL CI | NOT DEPLOYED |
| Rent overpayment, NSF and arrears exceptions | Synthetic + PostgreSQL CI | NO AUTO REVERSALS |
| Signed agreement fee quote, GST, residency withholding | Synthetic CI | NO APPROVED OWNER AGREEMENT IMPORT |
| Verified owner crosswalk and Books invoice readback | Synthetic CI | NO PRODUCTION INVOICE |
| Owner statement preparer/reviewer/broker gates | Synthetic CI | NO OWNER DELIVERY |
| Rent and deposit trust 3-way reconciliation | Python synthetic CI | NO REAL CUTOFF EVIDENCE OR SIGN-OFF |
| Books account inventory | GET-only client unit tests | NO APPROVED RBC/BANK MAPPING |

## Go-live release gates (all mandatory)
1. Iris/Facu provide authoritative owner and property ownership links, stable lease/tenant identifiers and signed agreement document references; Finance verifies effective-dated rates per owner/property and legacy exceptions.
2. Accountant confirms exact RBC Rent Trust, Deposit Trust and Operating bank identities against Zoho Books account IDs; independently signed cutoff bank statements, GL/trial balance, suspense and principal subledger reconciliations are mandatory.
3. Owner-to-Books ID crosswalk independently approved; no owner inferred by display name, email or document filename.
4. Service security review: migration privileges, RLS role grants, audit immutability, secret handling, idempotent retries, source authenticity and operations monitoring.
5. Accountant and Managing Broker sign off realistic staging UAT including 2+ owners, a partial receipt, overpayment, NSF/reversal, corrected/late receipts, GST, nonresident withholding, payout and statement discrepancy cases.
6. Separately approve production deployment; financial writes and statement publishing remain completely disabled throughout this project branch.

## CI
GitHub Actions `Iris Consolidated Finance QA (NO POSTING)` runs isolated Python reconciliation tests and Node/PostgreSQL tests. Evidence is valid only for the exact commit and completed passing job outcomes.

This code is not a replacement for signed legal/accounting validation and does not modify real Books balances, send statements, create invoices or permit trust transfers.

## Verified consolidated CI execution
- Branch commit tested: `8322194e856c0f23d7a273daf263a9e5a2722297`
- GitHub Actions run: https://github.com/ExcelDude/Zoho/actions/runs/44993133624
- **reconciliation** job: SUCCESS. Synthetic Python reconciliation and GET-only Books evidence adapter test discovery executed.
- **finance-integration** job: SUCCESS. Node safety, fee/statement review, mock persistence and disposable PostgreSQL integration/concurrency commands executed.
- The combined pass proves both code stacks execute in one branch and workflow. It does not constitute a real cross-language data-adapter integration, a true RBC/Books/owner-ledger reconciliation or approval to deploy.

Draft pull request: https://github.com/ExcelDude/Zoho/pull/9 (targets the cumulative development branch, never production/main).
