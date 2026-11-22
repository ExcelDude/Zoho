# Multi-owner Rent Trust receipt allocation — read-only

Deterministic split of **cleared receipt cents**, not scheduled monthly rent, using approved, exact basis-point ownership snapshots. Splits use largest-remainder rounding with stable owner/snapshot ties. This supports partial rent payments as separate cleared bank transaction IDs. A 60/40 split of CAD $100.01 becomes $60.01 and $40.00.

Only verified RENT trust receipts can be candidates; missing tenant, ownership, books, RBC settlement, bank mapping or approvals hold. Ownership must total 10,000 basis points and share one approved snapshot. A 1-cent receipt allocates to one owner, while all ownership metadata remains in the immutable fingerprint.

The add-on `allocation_schema.sql` introduces immutable owner allocation preview records and a parent receipt manifest. `MultiOwnerReceiptStore` inserts the receipt header, manifest and allocations **atomically**, quarantining a changed amount or ownership snapshot under the same bank transaction reference. Replays reuse the existing receipt.

**Not deployed or production-ready.** Tests use synthetic fixture receipts in disposable GitHub PostgreSQL. There is no source connection to real Iris owners, bank feeds or Books GL. Controls do not approve trust transfers, invoicing, disbursement, or accounting entries. Before deployment: approve source owner snapshot effective dates, multi-owner contract handling, real bank identifiers, opening balances, three-way reconciliation, database grants and financial UAT.
