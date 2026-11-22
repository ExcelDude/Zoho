-- Additive, disposable-test-first multi-owner receipt PREVIEW storage.
-- No trust postings. Review under approved DBA migration/permissions process before any deployment.
CREATE TABLE IF NOT EXISTS iris_trust_receipt_manifests(
 event_key TEXT PRIMARY KEY REFERENCES iris_trust_event_previews(event_key),
 allocation_fingerprint CHAR(64) NOT NULL,
 books_evidence_id TEXT NOT NULL UNIQUE,
 bank_evidence_id TEXT NOT NULL UNIQUE,
 lease_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 ownership_snapshot_id TEXT NOT NULL,
 allocation_count INTEGER NOT NULL CHECK(allocation_count>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS iris_trust_receipt_allocations(
 event_key TEXT NOT NULL REFERENCES iris_trust_receipt_manifests(event_key),
 owner_id TEXT NOT NULL,
 property_id TEXT NOT NULL,
 ownership_snapshot_id TEXT NOT NULL,
 basis_points INTEGER NOT NULL CHECK(basis_points>0 AND basis_points<=10000),
 allocated_cents BIGINT NOT NULL CHECK(allocated_cents>0),
 PRIMARY KEY(event_key,owner_id,property_id,ownership_snapshot_id));
CREATE INDEX IF NOT EXISTS idx_iris_trust_alloc_owner ON iris_trust_receipt_allocations(owner_id,property_id,event_key);
DROP TRIGGER IF EXISTS iris_trust_manifest_no_mutation ON iris_trust_receipt_manifests;
CREATE TRIGGER iris_trust_manifest_no_mutation BEFORE UPDATE OR DELETE ON iris_trust_receipt_manifests FOR EACH ROW EXECUTE FUNCTION iris_trust_preview_immutable();
DROP TRIGGER IF EXISTS iris_trust_alloc_no_mutation ON iris_trust_receipt_allocations;
CREATE TRIGGER iris_trust_alloc_no_mutation BEFORE UPDATE OR DELETE ON iris_trust_receipt_allocations FOR EACH ROW EXECUTE FUNCTION iris_trust_preview_immutable();
REVOKE ALL ON iris_trust_receipt_manifests, iris_trust_receipt_allocations FROM PUBLIC;
ALTER TABLE iris_trust_receipt_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE iris_trust_receipt_allocations ENABLE ROW LEVEL SECURITY;
-- No default policies or anonymous grants. Only a separately approved server role may be granted access.
