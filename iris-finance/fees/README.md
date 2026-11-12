# Iris signed-agreement fee rules — non-production POC

**Agreement selection is explicit and signed/document-specific.** Existing/legacy agreements must be verified individually; the system must not set 10% or 20% solely from property furnishing status.

Fee calculation input uses exact integer CAD cents. Furnished v4 management fee 20%; one-off onboarding $900 + GST. Unfurnished v4 management 10%; placement event max(50% monthly rent,$1,000) + GST. Placement-only v1 no management fee; first month's rent + GST on lease signature. Every fee subject to signed actual agreement, special approved overrides and tax review.

Non-resident illustration withholds 25% of gross collected rent before payout; annual $1,000 NR fee, CRA remittance, actual custody cash, and owner allocations REQUIRE separate lifecycle processes and are not posted here.

Management payout cycle for full management uses calendar cutoff day 10 (inclusive), payment by 20th; collection after 10th moves to next cycle. The quote deliberately does not produce an approved payout amount or account transfer.

No invoice, payment, tax filing, interest calculation or owner payout can be triggered here. Staging verification required for effective-dated agreement snapshots, Bank/Books mapping, signed owner consent, owner balances and tax treatment.

Run `node iris-finance/fees/fee_rules.test.mjs` with Node 20+.
