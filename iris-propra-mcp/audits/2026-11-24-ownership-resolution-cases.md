# Iris Properties — Ownership Resolution Case Audit
Date: 2026-11-24. Read-only assessment; no source-system changes.

## Tracker and case queue
Master: https://docs.google.com/spreadsheets/d/1qG5Phy-FLVxps7PsEqEvuwj6HsfWzbpuuLyI-ae1y_M/edit
Resolution queue: https://docs.google.com/spreadsheets/d/1qG5Phy-FLVxps7PsEqEvuwj6HsfWzbpuuLyI-ae1y_M/edit#gid=20261127

12 review cases generated: nine active-managed Iris properties missing property_ownership relationships (OWN-01–09), and three previously described owner candidate conflicts (AMB-01–03).

## Nine missing ownership links
All nine verified live against 148 Iris properties / 134 ownership links. Seven have conservative street+city+postal Propra building matches, two do not. Of these nine, seven have status-active leases; **six** have `is_active=false` despite `management_status=active` and a status-active lease. Status semantics require review; do not call these an automatic billing defect without date-sensitive checks.

| Case | Address | Propra units at matching building | Iris active leases | Notes |
|---|---|---:|---:|---|
| OWN-01 | 1029 View St | 1 (310) | 1 | Owner contact candidate; unit not established in Iris |
| OWN-02 | 1100 Yates St | 2 (1007, 611) | 1 | Distinct unit owners |
| OWN-03 | 899 Esquimalt Rd | 5 (208, 303, 507, 601, 904) | 1 | Two Propra unit owners |
| OWN-04 | 328 Santo Dominguez | 0 address matched | 0 | Identity and active management status review |
| OWN-05 | 515 Chatham St | 2 (213, 414) | 1 | Same Propra owner across both, still no verified Iris unit |
| OWN-06 | 3700 Carey Rd | 0 address matched | 1 | Active lease / `is_active=false`, owner unknown |
| OWN-07 | 409 Swift St | 5 (111, 215, 312, 315, 423) | 0 | Five distinct unit owners |
| OWN-08 | 1975 Lee Ave | 2 (108, 201) | 1 | Distinct unit owners |
| OWN-09 | 1024 Fairfield Rd | 1 (203) | 1 | Propra owner not matched in prior contact join |

## Three possible owner differences are *not proven errors*
- AMB-01, 2629 Millstream Road: Propra **unit 315** owner candidate differs from the owner associated with the **Iris property with blank unit_number**. Exact rented unit not proven.
- AMB-02 / AMB-03, 777 Herald Street: Propra units **2003 and 704** have different unit owner IDs; Iris has a single property with a blank unit_number and a single 100%-linked owner. A building-level address match cannot establish which unit Iris manages.

Treat these as **UNIT_GRANULARITY_OWNER_CANDIDATE_DIFFERENCE** not confirmed ownership errors.

## Acceptance gate
Facu / Nico / Iris Operations: confirm each Iris property's specific managed unit number or building-level scope; obtain signed legal owner evidence, effective dates, all-owner percentages and correct management/lease status. Update `property_ownership` only after authority and review. Crosswalk candidates and owner email/name matches do not authorize writes or payments. Keep January rent and owner allocations blocked where required by existing controls.

Master WBS notes updated under `SYNC-003` and `SYNC-005`; prior evidence and completion percentages retained.
