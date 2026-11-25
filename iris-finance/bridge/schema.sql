-- Proposed Iris-side migration; DO NOT APPLY until Facu approves staging schema.
-- RLS policies and service role privileges must be granted explicitly in Iris Supabase.
create table if not exists iris_finance_pilot_events (
  event_key text primary key,
  source_event_id uuid not null,
  payload_sha256 char(64) not null,
  event_type text not null,
  source_lease_id uuid not null,
  period char(7) not null,
  status text not null default 'RECEIVED',
  books_reference text unique,
  books_invoice_id text unique,
  hold_reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint allowed_status check (status in ('RECEIVED','HOLD','PREVIEW_READY','APPROVED_FOR_STAGING','DISPATCHING','UNCERTAIN','EVIDENCE_RECORDED','CONFLICT_HOLD','READBACK_MISMATCH_HOLD'))
);
create unique index if not exists iris_pilot_unique_source_event on iris_finance_pilot_events(source_event_id);
create table if not exists iris_finance_pilot_callback_receipts (
  id bigint generated always as identity primary key,
  books_invoice_id text not null,
  external_reference text not null,
  event_name text not null,
  payload_sha256 char(64) not null,
  received_at timestamptz not null default now(),
  unique(books_invoice_id,event_name,payload_sha256)
);
create table if not exists iris_finance_pilot_exceptions (
  id bigint generated always as identity primary key,
  event_key text references iris_finance_pilot_events(event_key),
  reason text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table iris_finance_pilot_events enable row level security;
alter table iris_finance_pilot_callback_receipts enable row level security;
alter table iris_finance_pilot_exceptions enable row level security;
-- No user-facing policies: service-to-service access only, with least privileges.
-- For production, enforce immutable callback audit, transactionally reserve events,
-- and make dispatch outbox atomic with source transaction commit.
