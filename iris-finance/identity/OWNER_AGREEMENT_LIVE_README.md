# Iris Owner Identity & Agreement Reference Registry (read-only)
The registry consumes the new Iris resources owner_contacts, management_agreements and workdrive_agreements, plus properties/property_ownership, and Zoho Books contacts.
- Exact normalized name and email is a **high-confidence suggestion for review**, never a financial authorization.
- Email-only, name-only, conflicting candidates, duplicate Books links and unmatched records require manual approval.
- Actual mapping approval requires independently documented confirmation; source names/emails must not be pushed to a public GitHub repository or logs.
- WorkDrive references currently have no document bytes or links; matching by owner_name/property_folder is provisional. Duplicates must be reviewed. Signed agreement versions, effective rates, special terms, non-resident status and amendments cannot be extracted from references alone.
- Propra's per-property management fee settings require a separate verified export or authorized connection. Do not infer these from property type, agreement filenames, or the default 10%/20% rules.
- Do not alter Zoho Books contact records or populate the production identity crosswalk automatically.

### Live source inspection (2026-11-18)
Read-only counts: 119 Iris owner contacts, 424 Zoho Books contacts, 77 Iris agreement references, 212 WorkDrive reference entries, 132 property-ownership links, 146 properties. Initial normalization/lookup: 76 exact name+email suggestions, 23 email-only, 1 name-only, 19 unmatched. A cross-signal mismatch was identified; all suggestions require review. Eight Iris agreement records have no explicit owner ID. Data is NOT checked into this repository.
