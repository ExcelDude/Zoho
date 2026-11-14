# Owner monthly statement generator — INTERNAL PREVIEW ONLY
Built from the existing synthetic **Owner Trust Ledger POC** and **Owner Statement POC** in Iris's master Google Sheet. No owner PII or financial secrets stored in GitHub.
- Inputs: owner ID, YYYY-MM period, property-level approved opening balances, immutable signed-cents ledger events, separately evidenced expected closing balances.
- Events: rent receipt, fee+GST (only **settled trust transfers**, not merely a draft Books fee invoice), owner expense, owner payout, owner top-up, non-resident withholding, and documented adjustments.
- No deposit trust mixing: deposit balances require their own subledger/statement.
- Aggregates every property to a single legal owner while preserving property drill-down and receipt/source evidence IDs.
- Blocks duplicate events, wrong sign, missing reference, negative balances, mismatched closing, missing signed agreement/owner identity/ownership snapshot, incomplete cash evidence, unreconciled Books GL/bank, and missing reviewer signoff.
- Draft/pending events are excluded; a COMPLETE events watermark/review is separately required.
- Output is a structured data object and an internal Markdown preview. It always sets `sendAllowed:false`, `postingAllowed:false` and `availableForOwner:false`.
Run `node iris-finance/statements/statement_generator.test.mjs` (15 assertions checked locally). No owner portal publication/email/statement PDF generation, Zoho Books posting or bank EFT executed.
Next: provide actual settled events, verified owner IDs, opening balances and real Books/RBC trust reconciliation. No Iris PMS redesign needed.