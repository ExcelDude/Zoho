# Trust reconciliation engine V2 (read-only)

This is a deterministic reference engine for separate Rent Trust and Deposit Trust three-way cutoff reconciliations. **No bank, Zoho Books or Iris connections and no posting.** All money inputs are **integer CAD cents**.

For each pool require signed / verified evidence from the **same cutoff date**: RBC closing statement, supported deposits in transit, supported outstanding payments, approved RBC-to-Books bank mapping, Books trust cash GL, liability/suspense GL components and per-principal/tenant subledger totals. The engine compares adjusted bank = Books cash GL = liability GL = subledger; it additionally compares control codes individually to block offsetting misclassifications.

Run: `cd iris-finance/trust_reconciliation_v2 && python -m unittest -v`.

Hard block for missing approvals, missing components, cross-trust GL codes, mismatched cutoffs, noninteger amounts and unverified timing adjustments. A variance result cannot approve. An all-zero result is only meaningful with separately verified evidence; an empty query is never proof of zero.

**Not production ready.** This reference module is not connected to a persistence layer, RBC statement exports or Books account transactions. Do not mark trust reconciliation complete until verified source mappings, approved GL accounting treatment, production adapter, real period-close tie-out, concurrency UAT and managing-broker signoff exist.
