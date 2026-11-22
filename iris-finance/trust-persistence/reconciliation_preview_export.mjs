/** GET-only export for the Python reconciliation evidence handoff.
 * This export contains unposted PREVIEW events and explicitly cannot certify a
 * trust liability, Books cash GL, RBC statement or source accounting posting.
 */
const safeId=x=>typeof x==='string'&&x.trim()&&x.length<=1024;
const safeInt=x=>Number.isSafeInteger(x)&&x>=0;
export async function exportRentPreviewEvidence({db,cutoff,organizationId='110003520057'}={}){
 if(!db?.query)throw Error('READ_ONLY_DB_REQUIRED');
 if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(cutoff||'')||!Number.isFinite(Date.parse(cutoff+'T00:00:00Z'))||
  new Date(cutoff+'T00:00:00Z').toISOString().slice(0,10)!==cutoff)throw Error('VALID_CUTOFF_REQUIRED');
 if(organizationId!=='110003520057')throw Error('UNAUTHORIZED_ORGANIZATION');
 // No INSERT, UPDATE, DELETE, SET ROLE, or any other side-effecting SQL here.
 const rows=await db.query(`SELECT e.event_key,e.source_id AS bank_transaction_id,
   e.event_date::text AS event_date,e.amount_cents::text AS amount_cents,
   m.allocation_fingerprint AS manifest_fingerprint,m.allocation_count,
   COUNT(a.owner_id)::int AS observed_allocation_count,
   COALESCE(SUM(a.allocated_cents),0)::text AS allocation_total_cents
   FROM iris_trust_event_previews e
   INNER JOIN iris_trust_receipt_manifests m ON m.event_key=e.event_key
   INNER JOIN iris_trust_receipt_allocations a ON a.event_key=e.event_key
   WHERE e.pool='RENT' AND e.organization_id=$1 AND e.event_date<=$2::date
   GROUP BY e.event_key,m.event_key ORDER BY e.event_date,e.event_key`,[organizationId,cutoff]);
 const cases=await db.query(`SELECT COUNT(*)::int AS n FROM iris_trust_exception_cases
   WHERE status='OPEN' AND event_key IN
   (SELECT event_key FROM iris_trust_event_previews WHERE pool='RENT' AND organization_id=$1 AND event_date<=$2::date)`,[organizationId,cutoff]);
 const rentCases=await db.query(`SELECT COUNT(*)::int AS n FROM iris_rent_payment_exception_cases WHERE status='OPEN'
   AND (obligation_key IS NULL OR obligation_key IN
     (SELECT obligation_key FROM iris_rent_obligation_previews WHERE accounting_period<=$1))`,[cutoff.slice(0,7)]);
 if(rows.rows.some(r=>!safeId(r.event_key)||!safeId(r.bank_transaction_id)||!safeId(r.manifest_fingerprint)
   ||!safeInt(Number(r.amount_cents))||!safeInt(Number(r.allocation_total_cents))
   ||r.allocation_count!==r.observed_allocation_count||r.allocation_count<1))
    throw Error('INCONSISTENT_PREVIEW_LEDGER_RECORD');
 const count=Number(cases.rows[0]?.n)+Number(rentCases.rows[0]?.n);
 if(!safeInt(count))throw Error('UNVERIFIED_EXCEPTION_COUNT');
 return {schema_version:'iris-trust-preview-v1',organization_id:organizationId,pool:'RENT',cutoff,
    source_kind:'UNPOSTED_PREVIEW',events:rows.rows.map(r=>({
      event_key:r.event_key,bank_transaction_id:r.bank_transaction_id,event_date:r.event_date,
      amount_cents:Number(r.amount_cents),allocation_total_cents:Number(r.allocation_total_cents),
      allocation_count:r.allocation_count,manifest_fingerprint:r.manifest_fingerprint
    })),unresolved_case_count:count,posting_allowed:false,reconciliation_certified:false};
}
