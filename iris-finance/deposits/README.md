# Tenant deposit ledger — unmerged, non-posting POC

Security deposits and pet deposits are separate principal ledgers; they are not rent or Iris company income. This prototype accepts settled deposit receipts and authorized disbursements with both Books and bank evidence, rejects cross-tenancy events and negative balances, and requires verified tenant identity, opening balances, and deposit trust reconciliation.

`estimateDepositInterest` provides a **non-authoritative estimate** using an explicitly supplied, approved year/period rate schedule and daily simple accrual. It must be compared with the BC RTB interest calculator and signed off before any use with real funds. The prototype does not assert that its accrual approach matches law.

`prepareDepositRefund` previews the later-of-tenancy-end/forwarding-address date plus 15 calendar days. Actual statutory requirements, special cases, disputes, service and submission deadlines require accountant/legal review. Deductions need tenant written consent or verified RTB order plus documentary support. Interest remains separately owed to the tenant and is an owner expense, not a hidden reduction of principal.

Placement-only owner handoff is separately gated and never silently treated as ordinary management; no owner handoff or bank transaction is executed.

All functions return postingAllowed=false; refunds return refundAllowed=false. Tests use synthetic tenancy IDs only. Real Iris tenant deposit data and bank reconciliations are not imported, and no production migration has been executed.

Run `node --test iris-finance/deposits/deposit_ledger.test.mjs`.
