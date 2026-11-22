# Iris Trust Durable Review Events V1 (not deployed)
This additive, parameterized PostgreSQL event and exception store complements the existing Iris finance IntegrationEngine and Rent Trust preview. It stores **metadata only**, not owner payouts, actual journal postings, or bank transactions.

* Immutable trust event previews with natural idempotency key, SHA-256 payload digest, and single-candidate event row.
* A conflicting payload on the same source identity is quarantined as a review exception; no source overwrites.
* Exception cases have reason-code/fingerprint uniqueness, independent reviewer requirement, immutable audit actions, and explicit evidence references.
* No auto-retry of unknown financial outcomes and **no** posting authorization in this code. `reviewException` acknowledges an exception; it does not authorize a payment.
* All SQL writes are parameterized and wrapped in database transactions. No credentials embedded.
* Schema is a **proposal**; not deployed. Permissions, migration tooling, concurrent requests, actual PostgreSQL integration tests, and approval by Iris DB owner are outstanding.

Run local synthetic tests: `node iris-finance/trust-persistence/trust_event_store.test.mjs`. CI is configured on the branch. Never install this schema into production without approved deployment review.