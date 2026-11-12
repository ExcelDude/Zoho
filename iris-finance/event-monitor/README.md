# Iris Finance Event Monitor — prototype (NOT DEPLOYED)

Implements a **no-network, in-memory reference state machine** for Iris PMS → Zoho Books finance events. The files are isolated on branch `iris-finance-event-monitor-poc`; **no production credentials or transactions** are involved.

## Contents

- `finance_event_monitor.mjs`: event identity, SHA-256 payload digest comparison, state changes, retry scheduling, conflict detection, uncertain-Books-outcome hold, and redacted audit.
- `finance_event_monitor.test.mjs`: test scenarios. Run `node iris-finance/event-monitor/finance_event_monitor.test.mjs` using Node 20+.
- `schema_proposal.sql`: versioned handoff *proposal*, not a migration that has been applied.

## Event identity

Uniqueness is based on `(org_id, source_system, source_event_id, event_kind, accounting_period)`. An identical replay returns the existing state and Books ID; the same key with different SHA-256 digest is an idempotency conflict. Persist only canonical digest, not sensitive payloads.

## State machine

`PENDING → IN_FLIGHT → SUCCEEDED`

Pre-submit recoverable errors: `IN_FLIGHT → RETRY_WAIT → IN_FLIGHT` with bounded exponential backoff, ultimately `DEAD_LETTER`.

Permanent validation errors: `IN_FLIGHT → BLOCKED`.

**After-submission timeout:** `IN_FLIGHT → UNCERTAIN`; never retry without querying Books to locate an existing record or verifying the operation did **not** post with documented review and approval.

**No live connector calls** from these files. The in-memory Map must be replaced by transactional PostgreSQL, a durable inbox/outbox, service-level authorization, unique constraints and proper locks. Persist every audit transition with verified actor and timestamp. Payouts and account transfers are outside this POC and must remain disabled until accountant and Managing Broker sign-off.

## Integration and security gates

1. Jhony confirms production-write Books OAuth service and service role permissions.
2. Validate PMS owner/tenant UUID → CRM → Books entity crosswalk; reject missing ownership.
3. Verify real RBC Rent Trust / Deposit Trust bank identities.
4. Accountant approves trust posting matrix, management fee tax and invoice treatment.
5. Test actual `finance_sync_log` with end-to-end recon, duplicate delivery, crash-after-post, and atomic locks in staging.
6. Only after signoff enable carefully scoped production writes and monitoring.

## Spreadsheet monitoring

The master workbook's **Finance Integration Event Monitor** tab records synthetic example transitions, and **Finance Exception Dashboard** reports their isolated synthetic status counts. Neither is a live transaction log.
