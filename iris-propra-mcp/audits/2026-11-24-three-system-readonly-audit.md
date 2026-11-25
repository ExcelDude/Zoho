# Iris Properties — Three-System Live Data Audit (2026-11-24)

**Scope:** Propra Public API ↔ Iris Internal read-only MCP ↔ Zoho Books org `110003520057`.

**Mode:** read-only. No approved cross-system financial identity, account mapping, bank mapping, deposit classification, posting, payment or ledger certification is implied by these findings.

## Source inventories

| Entity | Propra | Iris Internal | Interpretation |
| --- | ---: | ---: | --- |
| Properties | 114 | 148 (113 active-managed, 35 archived) | Propra separates buildings/properties and units; Iris tracks rental properties at a different granularity. |
| Units | 143 | Included in property-level model | Unit-level join required. |
| Owners | 151 | 120 | Compare identity, contact and status; not necessarily same entity population. |
| Tenants | 302 | 149 | Historical/inactive differences are unknown. |
| Residencies / leases | 101 | 132 | Different record types and effective dates, not necessarily missing records. |
| Property ownership links | Not independently certified | 134 | Verify ownership percentage and effective date before owner allocation. |
| General ledger accounts | 96 | N/A | Propra exposes separate GL catalog. |
| Journals | 37,285 | N/A | Not yet classified by posted status/cutoff. |
| Clearables | 8,336 | N/A | Count includes entries not necessarily outstanding. |

These are live API-reported entity inventories at the time of the audit, **not** certified active populations or cutoff balances.

## Owner identity crosswalk — read-only candidate classification

Exhaustive paginated Propra owner list (151) compared to Iris `owner_contacts` (120), by normalized exact name and case-insensitive trimmed email. No fuzzy auto-linking and no external propagation.

| Candidate category | Propra owner records |
| --- | ---: |
| Unique exact name + email, with distinct Iris targets | **86** |
| Email-only candidate | **22** |
| Name-only candidate | **5** |
| Ambiguous match | **0** under tested matching rules |
| Unmatched | **38** |
| **Total** | **151** |

Propra email populated in 136/151; Iris owner contacts email populated in 120/120.

**Critical:** 86 is a review-candidate count, not 86 signed/verified IDs and not proof of legal owner identity. Retain the existing independently verified **76 Iris→Zoho Books** owner UUID connections from prior audit. The required chain is **Propra owner ID → reviewer-confirmed Iris owner UUID → existing verified Books contact ID**, with multi-owner rules and disbursement holds. Do not generate a new financial join merely because email matches.

## Property matching

All 114 Propra property records compared with 148 Iris internal property records. An initial conservative normalized **street + city** match found **32 Propra properties** with a candidate overlap. No exact matches occurred from property names alone. These are **not 32 approved 1:1 IDs**. The final comparison must join 143 Propra units to rental units/addresses in Iris, include unit/apartment and postal codes where valid, handle multi-unit buildings, historical/archived statuses and duplicate addresses, then undergo reviewer sign-off.

## Propra ↔ Books GL discovery

All 96 Propra GL rows compared with all 70 **active** Zoho Books chart-of-accounts rows.

- Propra GL rows with a code: **95/96**; Books accounts with a code: **12/70**.
- Exact code matches: **0**.
- Exact normalized-name candidate rows: **14**. Duplicate Propra “Undeposited Funds” records are among name matches; thus names are **not unique keys**.
- Propra bank candidates: code `1200` RBC Rent Trust Bank; `1300` RBC Security Deposit Trust Bank.
- Propra deposit liability candidates: `2200` Pet Deposit Liability; `2400` Security Deposits Liability.

**Do not map** these automatically to Books codes `2110/2115/2120/2125/2130/2135` or bank accounts. The two ledgers have different conventions. Require bank identity/currency verification, accountant approval, effective cutoff GL balances, Propra posting classification, tenant/owner subledger evidence and RBC bank statements. Do not infer that all Propra journals or clearables belong in trust.

## Tracker alignment

Source of truth: [Iris Properties Zoho Finance Master Implementation Tracker](https://docs.google.com/spreadsheets/d/1qG5Phy-FLVxps7PsEqEvuwj6HsfWzbpuuLyI-ae1y_M/edit).

Live findings appended with prior evidence preserved to:
- `FIN-003` — chart of accounts and mapping candidates
- `DATA-001` — canonical financial identities
- `DATA-004` — source-of-truth roles
- `SYNC-001` — tenant identity
- `SYNC-002` — owner identity candidate set
- `SYNC-003` — property/unit identity crosswalk
- `SYNC-004` — residency-to-lease eligibility
- `SYNC-005` — ownership joins and allocation
- `REP-001/002` — rent/deposit reconciliation evidence gates

Progress percentages deliberately **unchanged**: discovery is not the same as certified integration.

## Next actionable gates

1. **Owner crosswalk review:** Confirm or reject 86 exact name/email candidate joins; individually review 22 email-only and 5 name-only candidates; seek authoritative IDs for 38 unmatched.
2. **Unit/property relationships:** Map Propra properties/units to internal property UUIDs and confirm active management, lease coverage and ownership allocation percentages.
3. **Books account mapping:** Obtain approved bank-account identities, normalized account classifications, bank statement evidence, and dated posted-GL balances.
4. **Finance QA:** Reconcile owner/tenant liability subledgers to posted GL and bank statements independently at a common October 31, 2026 cutoff; exclude previews. Record exceptions by source ID, avoid PII in GitHub.
5. **Only after approval:** Enable any sync/write workflow through separate finance signoff, idempotency, and UAT. This report makes no production data changes.
