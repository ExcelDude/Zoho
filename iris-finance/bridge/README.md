# Iris Portal ↔ Zoho Books pilot bridge (NOT DEPLOYED)
**Current status:** safe code-only staging contract. No Iris portal repository access, production OAuth connection, callback URL, secrets, real invoices, or database migration. This branch has zero posting implementations.

## Architecture
1. **Iris server trigger:** On approved test lease workflow action, within the Iris DB transaction, enqueue an immutable outbox record containing UUIDs + period + monotonically incremented source_version. No trigger on general user edit or unsigned web browser requests. Worker POSTs compact JSON to server endpoint /iris/finance/events with `x-iris-timestamp` (Unix seconds) and `x-iris-signature` = hex HMAC-SHA256(secret, timestamp + '.' + exact UTF-8 raw JSON).
2. **Bridge server:** Authenticate event, check timestamp, require Iris server-side lease/current ownership and approved exact crosswalk; claim event by unique key and hash in durable DB. Fail closed, preview proposed draft invoice. Do not create invoice until explicitly approved pilot, accountant sign-off and a separate feature-flagged dispatcher with read-before-create is implemented.
3. **Zoho Books:** Organization `110003520057`. Existing invoice custom fields: `cf_iris_property_id`, `cf_iris_lease_id`, `cf_iris_tenant_id`, `cf_iris_finance_event_id`. All are currently non-unique. Test only on an explicitly designated synthetic customer/item, using a **fixed CAD $1.00 pilot amount** (never the real lease rent), and **never in rent/trust bank accounts**. The pilot does not validate legal rent billing, owner allocations or agreement fees; those remain separately gated. Exact reference pattern: `IRIS-TEST-<lease_uuid>-YYYY-MM`. `send=false`, no payment, no automatic email. Zoho Books outgoing webhook action can be configured only after the bridge has a deployed HTTPS address.
4. **Books → Iris:** Books workflow (invoice created/updated/voided) calls `POST /books/finance/callback` via HTTPS, with private `Authorization: Bearer <BOOKS_CALLBACK_BEARER_SECRET>` header, JSON fields `{organization_id,module:'invoice',event:'created'|'updated'|'voided',books_invoice_id,external_reference}`. Server checks bearer then GETs actual Books invoice through OAuth, compares Books ID, reference and preapproved customer before saving an immutable callback receipt. **This is application-defined bearer authorization, not a claim about Zoho-native signature format.** Never trust callback fields alone.
5. **Operator dashboard:** Read-only status panel for RECEIVED / HOLD / PREVIEW_READY / UNCERTAIN / EVIDENCE_RECORDED and exception ledger. Any timeout after Books POST is **UNCERTAIN**; query Books using reference and event custom field and escalate, never blind retry.

## Missing deployment prerequisites
- Facu/Jhony: Iris portal repository or server workflow write access; explicit finance-admin pilot trigger (portal_outbox.mjs); staging deployment; exact HTTPS base URL; callback service role; approved table migration/RLS. Ownership and tenant evidence are required **for real rent billing**, not for a separately approved synthetic $1 connectivity test.
- Ash/MJ/Nico: approve dedicated synthetic test customer and item; confirm Books OAuth server-side connection, GST treatment and account; separately approve one fixed $1 test invoice, its reversal/voiding cleanup and audit trail. The code does not post until the server-side feature flag, allowlist and one-off approval are supplied.
- Once HTTPS handler is deployed, configure Books webhook and attach an **inactive** Books invoice workflow until an authenticated callback round-trip is verified; do not set a placeholder or guess URL/secret.
- Run synthetic tests in GitHub Actions. Never store OAuth refresh tokens, webhook bearer, or API keys in GitHub source or logs.

## API contract
Portal event fields: `organization_id,type,source_event_id,lease_id,property_id,accounting_period,source_version,occurred_at`. The bridge deliberately rejects unknown fields, payer PII, unapproved events, payout and bank operations. `TEST_INVOICE_REQUEST` is the only invoice pilot type that could eventually be dispatched. Tests use fictitious UUIDs and customers.

## Known implementation boundaries
Current `stagePortalEvent` uses an injected `store` and runs previews only; adapt it to a transactional Postgres implementation of schema.sql. Deploying the schema alone does not provide durable reservations, authenticated HTTP routing, RLS-granted service access or Books OAuth. Validate bank/trust ledger and opening balances separately.

## Latest verification (2026-11-25)
- GitHub Actions synthetic bridge regression suite passed: https://github.com/ExcelDude/Zoho/actions/runs/45701693431
- Approved synthetic pilot passes through PREVIEW_READY only; use current branch head to enable code review. No actual Books invoice was created.
- Books live configuration inspected: invoice custom fields exist but are NOT unique; Books workflow and webhook lists were empty; no callback destination URL exists. Do not create a Books webhook with guessed URL.
- The feature-gated Books client in books_transport.mjs allows an **explicit** one-off POST only after an operator approves a dedicated test customer/item and full durable dedupe/readback are wired. It has not been executed.
