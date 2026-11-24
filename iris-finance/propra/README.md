# Propra API V1 — documented read-only adapter

The user supplied the OpenAPI 3 file `api-1.json` (Propra Public API v1).

Documented **base URL**: `https://propra.app/api/v1`.
Documented **authentication**:
- `X-API-Key: pn_...`
- `Authorization: pz_...` (raw API secret; no Bearer prefix)

An Iris account integration with `account.read.all` can read account data through authenticated GET requests. The exact GET routes enumerated and allowlisted in `documented_client.mjs` include `/account`, `/ping/auth`, `/owners`, `/properties`, `/units`, `/tenants`, `/residencies`, `/gl-accounts`, `/journals`, `/clearables` and additional read-only resources. Pagination uses `first` and `after` cursor parameters. The client defaults to a conservative **one record per page** for initial inspection; do not run broad record dumps without data protection approval.

**Security:** The user's earlier screenshot displayed full key and secret. They must be rotated before production use. Never commit, print, paste, or pass secrets via query strings or CLI arguments. Obtain fresh keys through an approved backend secret manager. Existing `probe.mjs` is a pre-documentation scaffold; use `documented_client.mjs` for actual Propra v1.

**Status:** Auth scheme and documented endpoint definitions are verified from OpenAPI, and synthetic transport tests pass when CI says so. No live Propra request has yet succeeded from this environment. Do not interpret the existence of GET paths as evidence all financial fields are currently available/approved, nor as a reconciled source ledger.

Next verified live step: GET `/ping/auth` or `/account` with freshly rotated credentials from the backend environment, and log only HTTP status / response shape. Then limited `first=1` GETs for owners, properties, units, residencies, GL accounts, journals, clearables; verify ID relationships, pagination, and whether posted/cutoff evidence exists. No POST, PATCH, DELETE, webhooks or financial writes.
