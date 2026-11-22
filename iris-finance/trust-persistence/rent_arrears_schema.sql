-- DEVELOPMENT ONLY: Disposable PostgreSQL rent obligation previews and receipt exception cases.
-- These are accounting review artifacts, NOT payments, cash balances, AR postings or rent receipts.
CREATE TABLE IF NOT EXISTS iris_rent_obligation_previews (
 obligation_key TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL CHECK (organization_id='110003520057'),
 lease_id TEXT NOT NULL,tenant_id TEXT NOT NULL,property_id TEXT NOT NULL,
 accounting_period TEXT NOT NULL CHECK (accounting_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 snapshot_ref TEXT NOT NULL, invoice_or_plan_ref TEXT NOT NULL,
 rent_due_cents BIGINT NOT NULL CHECK (rent_due_cents>=0),
 prior_cleared_cents BIGINT NOT NULL CHECK(prior_cleared_cents>=0 AND prior_cleared_cents<=rent_due_cents),
 reserved_preview_cents BIGINT NOT NULL DEFAULT 0 CHECK(reserved_preview_cents>=0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id,lease_id,accounting_period,invoice_or_plan_ref),
 CHECK(reserved_preview_cents<=rent_due_cents-prior_cleared_cents)
);
CREATE TABLE IF NOT EXISTS iris_rent_receipt_reservations (
 bank_transaction_id TEXT PRIMARY KEY,
 obligation_key TEXT NOT NULL REFERENCES iris_rent_obligation_previews(obligation_key),
 preview_event_key TEXT NOT NULL UNIQUE REFERENCES iris_trust_event_previews(event_key),
 amount_cents BIGINT NOT NULL CHECK(amount_cents>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS iris_rent_payment_exception_cases (
 case_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 bank_transaction_id TEXT NOT NULL,
 obligation_key TEXT,
 reason_code TEXT NOT NULL CHECK(reason_code IN
 ('OVERPAYMENT_UNAPPLIED','RENT_OBLIGATION_STALE','UNVERIFIED_RECEIPT','NSF_REVIEW',
 'CREDIT_BALANCE_REVIEW','DUPLICATE_RECEIPT','BALANCE_EVIDENCE_MISSING')),
 source_fingerprint CHAR(64) NOT NULL,
 evidence_reference TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','REVIEWED','CLOSED_NO_ACTION')),
 reviewed_by TEXT,reviewed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(bank_transaction_id,reason_code,source_fingerprint),
 CHECK ((status='OPEN' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR
        (status<>'OPEN' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS iris_rent_payment_exception_audit (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 case_id BIGINT NOT NULL REFERENCES iris_rent_payment_exception_cases(case_id),
 action TEXT NOT NULL,actor_id TEXT NOT NULL,
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iris_rent_exceptions_open ON iris_rent_payment_exception_cases(status,created_at,case_id);
CREATE INDEX IF NOT EXISTS idx_iris_rent_reservations_obligation ON iris_rent_receipt_reservations(obligation_key,created_at);
-- Previews and their audit trails cannot be silently revised.
DROP TRIGGER IF EXISTS iris_rent_reservation_no_mutation ON iris_rent_receipt_reservations;
CREATE TRIGGER iris_rent_reservation_no_mutation BEFORE UPDATE OR DELETE ON iris_rent_receipt_reservations
 FOR EACH ROW EXECUTE FUNCTION iris_trust_preview_immutable();
DROP TRIGGER IF EXISTS iris_rent_exception_audit_no_mutation ON iris_rent_payment_exception_audit;
CREATE TRIGGER iris_rent_exception_audit_no_mutation BEFORE UPDATE OR DELETE ON iris_rent_payment_exception_audit
 FOR EACH ROW EXECUTE FUNCTION iris_trust_preview_immutable();
DROP TRIGGER IF EXISTS iris_rent_obligation_no_delete ON iris_rent_obligation_previews;
CREATE TRIGGER iris_rent_obligation_no_delete BEFORE DELETE ON iris_rent_obligation_previews
 FOR EACH ROW EXECUTE FUNCTION iris_trust_preview_immutable();
REVOKE ALL ON iris_rent_obligation_previews,iris_rent_receipt_reservations,iris_rent_payment_exception_cases,iris_rent_payment_exception_audit FROM PUBLIC;
REVOKE ALL ON SEQUENCE iris_rent_payment_exception_cases_case_id_seq,iris_rent_payment_exception_audit_id_seq FROM PUBLIC;
ALTER TABLE iris_rent_obligation_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE iris_rent_receipt_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE iris_rent_payment_exception_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE iris_rent_payment_exception_audit ENABLE ROW LEVEL SECURITY;
-- No RLS policy, anon or authenticated grants. Only a separately approved service role may access.
