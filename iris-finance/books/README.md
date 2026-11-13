# Zoho Books fee invoice mapping — pre-production contract

Read-only audit (Nov 12 2026): Books org `110003520057`, Management Fee item `242438000000032035`, Placement/Onboarding item `242438000000031090`, GST (5%) tax `242438000000031068`. The service item rates are placeholder zero, and their `tax_id` fields are blank, even though `is_taxable=true`.

This tool produces *unsent* line-item previews only. It never submits an invoice and always returns `postingAllowed:false`. Explicit fee rate, GST mapping, signed individual agreement, Books owner contact, source transaction ID, property and review approval are required. Items do not determine amount.

Critical: the `line_items` shape is a candidate mapping, **not verified against a Zoho Books invoice creation or tax response**. In staging, use accountant-approved source IDs, compare amounts including GST, ensure customer owner vs tenant semantics and correct trust appropriation. Do not assume a fee invoice alone transfers trust funds.

No production invoice automation, GST/tax config write or trust transaction has been performed. Tests: `node iris-finance/books/books_fee_draft.test.mjs`.

To minimize Iris work: Facu only supplies stable source IDs and fixes missing ownership links. Tesiphon maintains fee configuration separately until an Iris-native agreement reference is practical.
