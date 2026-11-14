# Owner payout preparation — no posting / no EFT

Read-only, isolated preview of owner payout calculations. This builds on the existing synthetic Owner Trust Ledger POC and Owner Statement POC in the master implementation tracker without duplicating them.

Inputs use integer cents and explicit event types. Cleared rent and owner top-ups through the **10th inclusive** are eligible for that month's payout cycle; later receipts are excluded to a following cycle. Only SETTLED entries with Books evidence are considered, and earlier entries presumed included in opening balance are excluded. Fees, GST, expense payments, non-resident withholding and prior owner payouts are distinct categories, never treated as one undifferentiated deduction.

The engine enforces signed/effective agreement, verified owner Books customer ID, approved ownership snapshot, approved opening trust balance, bank and trust-ledger reconciliation, and Managing Broker approval. Missing prerequisites lead to HOLD. It **always** outputs `releaseAllowed:false` and `postingAllowed:false`. No Owner EFT, Zoho Books posting, or statement distribution function is included.

The 20th is shown as a contractual target, **not** a scheduling instruction or proof of bank transfer. Actual cutoffs, holiday banking, reserve policies, GST ledger, multi-property principal pooling, annual nonresident fees, and correction handling need accountant/legal approval. Actual books GL balances and bank identity are not yet reconciled to trust subledger.

Node test: `node iris-finance/payout/payout_preview.test.mjs`. The 11 scenarios are entirely synthetic.

**No new Iris schema changes needed:** consume verified ownership links, owner ID crosswalk, settled receipts and Books evidence as inputs. Never populate a real payout until opening balances and bank/trust mapping are approved.
