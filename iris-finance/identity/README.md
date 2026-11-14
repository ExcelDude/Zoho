# Iris owner → Zoho Books customer ID crosswalk (no posting)

**Live source audit November 13, 2026:** Iris read-only API returns 118 owner UUIDs (all active) and 130 property_ownership links. There are 144 properties, 109 with management_status=active, and 9 actively managed properties with no ownership relationship. Zoho Books org 110003520057 returns 423 customers in three pages, but none of the Books contact custom fields exposed an Iris owner UUID. No reliable owner-to-Books ID matches were identified. Also, 5 owner UUIDs have no property_ownership link (may be valid history).

The Google Sheet `Owner Books ID Crosswalk` lists 118 source owner UUIDs, property-link counts, blank Books customer IDs, required evidence and reviewer approval. `Ownership Link Audit` lists the 9 property IDs for Facu. No owner names or personal identifiers were transferred to GitHub.

`crosswalk.mjs` fails closed on nonexistent owner/customer IDs, inactive or vendor Books contact, missing ownership, duplicate owner or Books ID, insufficient independent evidence/reviewer or name/email-only matching. Even an approved mapping is never authorization to create invoices.

**Minimum request to Facu/Nico:** Provide exact owner UUID ↔ Books contact ID mapping or an authoritative export enabling it, and complete nine missing managed ownership links. No database redesign, no bulk CRM contact creation.

Go-live gates: independent agreement approval/effective terms, matched owner identity, trust balances, verified GL treatment, accountant approval, durable idempotency. No production billing job deployed.

Run `node iris-finance/identity/crosswalk.test.mjs` (only synthetic IDs).
