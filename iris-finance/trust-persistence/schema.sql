-- Additive PREVIEW-ONLY schema; do not run in production without DBA approval.
CREATE TABLE IF NOT EXISTS iris_trust_event_previews(
 event_key TEXT PRIMARY KEY,organization_id TEXT NOT NULL,
 pool TEXT NOT NULL CHECK(pool IN('RENT','DEPOSIT')),event_type TEXT NOT NULL,
 source_system TEXT NOT NULL,source_id TEXT NOT NULL,source_version TEXT NOT NULL,
 event_date DATE NOT NULL,amount_cents BIGINT NOT NULL CHECK(amount_cents>0),
 principal_id TEXT,property_id TEXT,reversal_of TEXT REFERENCES iris_trust_event_previews(event_key),
 payload_hash CHAR(64) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(organization_id,pool,source_system,source_id,event_type,source_version));
CREATE TABLE IF NOT EXISTS iris_trust_exception_cases(
 case_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 event_key TEXT NOT NULL REFERENCES iris_trust_event_previews(event_key),
 reason_code TEXT NOT NULL,source_fingerprint TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','REVIEWED','CLOSED_NO_ACTION')),
 reviewed_by TEXT,evidence_reference TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 reviewed_at TIMESTAMPTZ,UNIQUE(event_key,reason_code,source_fingerprint),
 CHECK((status='OPEN' AND reviewed_at IS NULL AND reviewed_by IS NULL AND evidence_reference IS NULL)
 OR(status<>'OPEN' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND evidence_reference IS NOT NULL)));
CREATE TABLE IF NOT EXISTS iris_trust_review_audit(
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 event_key TEXT NOT NULL REFERENCES iris_trust_event_previews(event_key),
 case_id BIGINT REFERENCES iris_trust_exception_cases(case_id),
 action TEXT NOT NULL,actor_id TEXT NOT NULL,reason_code TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_iris_trust_open_cases ON iris_trust_exception_cases(status,created_at,case_id);
CREATE OR REPLACE FUNCTION iris_trust_preview_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Immutable preview/audit rows'; END;$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS iris_trust_previews_no_mutation ON iris_trust_event_previews;
CREATE TRIGGER iris_trust_previews_no_mutation BEFORE UPDATE OR DELETE ON iris_trust_event_previews FOR EACH ROW EXECUTE FUNCTION iris_trust_preview_immutable();
DROP TRIGGER IF EXISTS iris_trust_audit_no_mutation ON iris_trust_review_audit;
CREATE TRIGGER iris_trust_audit_no_mutation BEFORE UPDATE OR DELETE ON iris_trust_review_audit FOR EACH ROW EXECUTE FUNCTION iris_trust_preview_immutable();
-- SECURITY: revoke all access from anon/authenticated/browser; service roles only.
-- Service can INSERT/SELECT previews, INSERT audit, limited review updates; no financial posting.
