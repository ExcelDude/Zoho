# Iris Properties — Live Propra Property/Unit and Ownership Crosswalk
Audit date: 2026-11-24. Source systems: Iris Propra MCP (GET only), Iris Internal MCP (GET only). Master tracker: https://docs.google.com/spreadsheets/d/1qG5Phy-FLVxps7PsEqEvuwj6HsfWzbpuuLyI-ae1y_M/edit

## Exhaustive source inventory
- 114 Propra properties, 143 Propra units, 148 Iris Internal property records.
- 134 Iris Internal `property_ownership` relationships.
- 143/143 Propra units reference an existing Propra property in the retrieved data.
- 9 Iris properties marked `management_status=active` have no `property_ownership` link. Existing critical onboarding/rent-allocation blocker; source owner must resolve before billing or payout.

## Propra units → Iris property candidates
Conservative matching: normalize street suffixes/case/spacing and compare **street + city**, disallow contradictory nonempty postal codes. If the Iris `unit_number` explicitly matches the Propra unit `name`, prioritize a unit-level match; otherwise do not assume the entire building corresponds to the same rental unit.

| Result | Propra units |
| --- | ---: |
| Explicit unit + address, single candidate | 1 |
| Unique address match but unit unverified | 31 |
| Multiple Iris records at matched address | 35 |
| No normalized street+city+postal match | 76 |
| **Total** | **143** |

These are proposed review classes, **not authenticated or approved one-to-one IDs**. `NO_ADDRESS_MATCH` is not proof of a missing record. Multiple matches may represent units in the same building, historical/inactive rows, or differing data granularity.

## Propra properties → Iris property candidates
- 29 unique street/city/postal address candidates, **unit-level mapping not established**.
- 11 addresses match multiple Iris property records.
- 74 addresses do not match this conservative rule.
- All 114 properties classified; all approval statuses `NOT APPROVED`.

## Proposed owner relationship evidence
Uses previous **unapproved** Propra Owner ID Crosswalk exact-name+email candidates, and Iris's existing `property_ownership` links. A unit's direct Propra `ownerId` takes priority; falling back to the containing Propra property's `ownerId` only if no unit owner ID is supplied. For the single Iris candidate IDs identified:
- 15 unit candidates have proposed Iris owner UUID present in the internal property ownership links.
- 3 candidate pairs have proposed owner UUID not present in linked ownership; **investigate conflicts; no auto-correction**.
- 125 unit rows were not evaluable for this test.

Even the 15 owner-supported candidates are **NOT financial approvals**: candidate owner matches require legal verification and effective-date/percentage validation, and asset identity must be checked independently. Do not infer ownership from Propra property `ownerName` or a matching contact email.

## Master spreadsheet deliverables
- `Propra Unit ID Crosswalk` (sheet ID `20261125`) has 143 unit IDs, source property IDs, candidate Iris IDs when unique, owner check, and explicit `NOT APPROVED` gate.
- `Propra Property ID Crosswalk` (sheet ID `20261126`) has 114 source property IDs, candidate Iris IDs when unique, unit-count context, and `NOT APPROVED` gate.
- Existing `Propra Owner ID Crosswalk` (sheet ID `20261124`) retained unchanged.
- Append-only evidence in master WBS: `SYNC-003` row 25 and `SYNC-005` row 27, preserving earlier notes and unchanged completion percentages.

## Acceptance gates / next steps
1. Finance/Iris Operations review the 1 explicit unit+address match, 31 unique-address matches, and 35 ambiguous address groups. Verify property, unit, postal code, legal ownership, current management status and any duplicate archive records.
2. Investigate 76 unmatched units using spelling/city aliases and independent Property/Unit IDs or Propra address changes; do not force-match.
3. Investigate the 3 proposed owner conflicts. Obtain signed owner agreement or other authoritative ownership evidence; separately resolve 9 active-managed Iris properties with missing owner links.
4. After **documented, independent review**: persist approved crosswalk with approved-at date and reviewer; integrate into existing Books owner UUID mapping. Never write to finance source systems during crosswalk analysis.
5. For trust/rent reconciliation, require posted GL cutoff, RBC bank mapping/statement and verified subledger. No posting or payment enablement.

No production data modifications, no financial posting, no PII export in this audit report.
