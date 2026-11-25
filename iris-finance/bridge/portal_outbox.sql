-- Proposed Iris staging migration; Facu must review and apply in Iris DB.
-- This is an event OUTBOX for test pilot actions, not a direct Books writer.
create table if not exists iris_finance_pilot_outbox (
  id uuid primary key default gen_random_uuid(),
  source_event_id uuid not null unique,
  lease_id uuid not null,
  property_id uuid not null,
  accounting_period char(7) not null,
  source_version integer not null check(source_version>0),
  event_type text not null check(event_type='TEST_INVOICE_REQUEST'),
  status text not null default 'PENDING' check(status in ('PENDING','IN_FLIGHT','ACCEPTED','UNCERTAIN','MANUAL_REVIEW')),
  reason_code text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lease_id,accounting_period,source_version,event_type)
);
alter table iris_finance_pilot_outbox enable row level security;
-- No browser/anon policy. Only the approved staff server action may INSERT
-- test event rows in the same database transaction as the explicit finance test request.
-- Background worker claims PENDING with SELECT FOR UPDATE SKIP LOCKED,
-- signs request with server secret, and marks ACCEPTED or UNCERTAIN atomically.
-- UNCERTAIN requires reconciliation by event ID; no automatic retry.
