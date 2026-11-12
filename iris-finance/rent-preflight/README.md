# Iris rent billing preflight (READ-ONLY POC)

This prototype evaluates a JSON snapshot of Iris properties, leases, tenants, owners, and property_ownership records against January 1, 2027 readiness rules.

Run: `node iris-finance/rent-preflight/preflight.test.mjs` with Node 20+. No network, credentials or Books writes.

**Provisional does NOT mean billable.** There is no owner-specific fee agreement, rent due-day/frequency, effective-dated ownership, owner/tenant UUID↔CRM↔Books mapping or accountant-approved billing treatment available through the current Iris API. Every returned record explicitly has `financial_posting_allowed: false`.

Core checks: lease active; active effective date on first of target month; actively managed property; property/tenant/owner references exist; ownership shares total 100%; positive rent; duplicate lease identifiers blocked. `is_active` intentionally not used until Jhony defines its meaning.

Snapshot on Nov 12 2026: 126 leases, 91 status-active, 64 provisionally eligible ($208,442.65 contractual monthly rent), 27 blocked; five January-effective actively managed leases lack ownership ($12,950 monthly rent). Twenty-one active leases outside date range, and one active lease on archived property. Review source statuses; values may change.

Event identity: `period|lease_id|RENT_CHARGE`; future durable sync layer must enforce uniqueness and canonical payload hash with fail-closed ambiguous posting outcome. Reconciliation controls remain mandatory.

**Deployment gate:** Complete PMS↔CRM↔Books mapping, signed lease terms and due-day, fee/tax accounting approval, management status semantics, ownership/effective-date review, and end-to-end UAT in staging. Never run invoices/payments automatically from this prototype.
