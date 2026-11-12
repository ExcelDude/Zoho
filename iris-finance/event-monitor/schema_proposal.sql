-- Iris Finance event monitor — proposed Supabase/PostgreSQL schema
-- HANDOFF ONLY. Do not execute against production without Jhony's review.
-- Do not store bearer tokens, raw request payloads, PII or bank details.
CREATE SCHEMA IF NOT EXISTS iris_finance;

CREATE TABLE IF NOT EXISTS iris_finance.sync_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id text NOT NULL,
    source_system text NOT NULL,
    source_event_id text NOT NULL,
    event_kind text NOT NULL,
    accounting_period text NOT NULL CHECK (accounting_period ~ '^[0-9]{4}-[0-9]{2}$'),
    payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-fA-F0-9]{64}$'),
    amount_cents bigint CHECK (amount_cents IS NULL OR amount_cents > 0),
    status text NOT NULL DEFAULT 'PENDING'
       CHECK (status IN ('PENDING','IN_FLIGHT','RETRY_WAIT','SUCCEEDED','UNCERTAIN','BLOCKED','DEAD_LETTER')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_retry_at timestamptz,
    last_error_code text,
    last_error_category text,
    books_entity_type text,
    books_entity_id text,
    source_revision text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_attempt_at timestamptz,
    completed_at timestamptz,
    CONSTRAINT sync_events_unique_key
       UNIQUE (org_id,source_system,source_event_id,event_kind,accounting_period),
    CONSTRAINT succeeded_has_books_id
       CHECK (status <> 'SUCCEEDED' OR (books_entity_id IS NOT NULL AND books_entity_id <> ''))
);
CREATE INDEX IF NOT EXISTS idx_iris_sync_queue
ON iris_finance.sync_events (status,next_retry_at,created_at);
CREATE INDEX IF NOT EXISTS idx_iris_sync_books_id
ON iris_finance.sync_events (books_entity_type,books_entity_id)
WHERE books_entity_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS iris_finance.sync_audit (
    id bigserial PRIMARY KEY,
    sync_event_id uuid NOT NULL REFERENCES iris_finance.sync_events(id) ON DELETE RESTRICT,
    change_type text NOT NULL,
    previous_status text,
    next_status text,
    attempt_no integer,
    safe_detail_code text,
    actor_id text,
    occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iris_sync_audit_event
ON iris_finance.sync_audit(sync_event_id,occurred_at);

-- Strongly recommended: only a dedicated service role may mutate these tables.
-- Enable RLS and grant no public/anon/authenticated insert/update/delete privileges.
ALTER TABLE iris_finance.sync_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE iris_finance.sync_audit ENABLE ROW LEVEL SECURITY;

-- Atomic worker algorithm to implement in one DB transaction:
--   1. INSERT ... ON CONFLICT unique key; compare payload_sha256; 409 if mismatch.
--   2. Claim PENDING or due RETRY_WAIT via SELECT ... FOR UPDATE SKIP LOCKED.
--   3. Persist IN_FLIGHT + attempt and durable outbox BEFORE any Books HTTP call.
--   4. On successful Books response persist Books ID, SUCCEEDED, audit.
--   5. If timeout after submission: mark UNCERTAIN, never blindly re-send.
--   6. Reconcile UNCERTAIN against Books with stable reference and authority.
--   7. Only verified not-posted cases with explicit approval may be retried.
--   8. Update audit in same transaction for every status transition.
-- Financial posting is NOT part of this POC.
