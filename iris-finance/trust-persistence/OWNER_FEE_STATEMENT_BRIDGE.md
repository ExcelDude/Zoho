# Owner management fee / internal statement bridge

**Status: development reference, read-only, no financial posting.**

Built against agreement rules documented in the Iris finance workbook (November 12 signed-agreement summary). Management fees: furnished v4 20%, unfurnished v4 10%, placement-only 0% monthly management, individually verified legacy agreements take precedence. Signed and effective-dated owner/property-specific agreements are mandatory; ownership must be approved and total 10000 basis points. Quotes are on independently verified **actual collected receipts**, never rental billing previews, unapplied funds, security/pet deposits or owner top-ups. The prior rent preview code does not establish that cash has been collected.

The function produces a **candidate**, per owner and property, and separates collected rent share, management fee, fee GST, nonresident withholding and indicative remainder. The indicative remainder is **not a payout**. Receipt dates after the 10th are assigned the next payout cycle. The calculation uses integer CAD cents and half-up rounding per owner.

The source accounting verification flags must be established by a separate real RBC/Zoho Books integration and Finance reviewer. The flags are NOT authentication or evidence of actual signed terms; callers can mock them for synthetic tests. This is not the live owner-statement generator and never feeds an owner portal, calculates placement/onboarding/termination invoices, books GST, withholds/remits CRA amounts, or transfers between Rent Trust and Operating.

## Still outstanding
* Obtain authoritative signed agreement registry, including legacy owners and effective dates.
* Link and verify individual owner identity, property ownership, actual settled Books/RBC receipts, fee taxes, tax residency and GL.
* Implement real source adapters, attestation, durable quote uniqueness, independent review, reconciliation and rendering with immutable receipts.
* Merge only after security, accountant and Managing Broker approval. No payments, invoices, bank transactions or financial accounts modified.

Run: `node iris-finance/trust-persistence/owner_fee_statement_bridge.test.mjs`. CI also runs previous PostgreSQL regression tests.
