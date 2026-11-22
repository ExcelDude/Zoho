/** Atomic, preview-only multi-owner receipt persistence. Postgres tables are NOT deployed.
 * Entire manifest + individual owner allocations commit together or not at all.
 */
import {prepareMultiOwnerReceipt} from './multiowner_allocation.mjs';
import {assessRentReceipt} from './rent_payment_exceptions.mjs';
const SAFE=Object.freeze({postingAllowed:false,payoutAllowed:false,booksWriteAllowed:false,bankTransferAllowed:false});
export class MultiOwnerReceiptStore {
 constructor({pool,actorId}){if(!pool?.connect||!actorId)throw Error('POOL_AND_ACTOR_REQUIRED');this.pool=pool;this.actorId=actorId}
 async ingest(input){
  const settlement=assessRentReceipt({receipt:input?.receipt,obligation:input?.obligation});
  if(settlement.status!=='ALLOCATABLE_PREVIEW')return settlement;
  const p=prepareMultiOwnerReceipt(input);
  if(p.status!=='MULTI_OWNER_PREVIEW_READY')return p;
  const db=await this.pool.connect();
  try{
   await db.query('BEGIN');
   const event=p.trust,r=input.receipt;
   const created=await db.query(`INSERT INTO iris_trust_event_previews
    (event_key,organization_id,pool,event_type,source_system,source_id,source_version,event_date,amount_cents,principal_id,property_id,reversal_of,payload_hash)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT(event_key) DO NOTHING RETURNING event_key`,
    [event.eventKey,event.organizationId,event.pool,event.eventType,event.sourceSystem,event.sourceId,event.sourceVersion,
     event.eventDate,event.amountCents,event.principalId,event.propertyId,event.reversalOf,p.allocationFingerprint]);
   const existing=await db.query('SELECT event_key,payload_hash FROM iris_trust_event_previews WHERE event_key=$1 FOR UPDATE',[event.eventKey]);
   if(existing.rowCount!==1)throw Error('RECEIPT_READBACK_FAILED');
   if(existing.rows[0].payload_hash!==p.allocationFingerprint){
    await db.query(`INSERT INTO iris_trust_exception_cases(event_key,reason_code,source_fingerprint,status)
      VALUES($1,'DUPLICATE_SOURCE_CONFLICT',$2,'OPEN') ON CONFLICT(event_key,reason_code,source_fingerprint) DO NOTHING`,
      [event.eventKey,p.allocationFingerprint]);
    await db.query(`INSERT INTO iris_trust_review_audit(event_key,action,actor_id,reason_code)
      VALUES($1,'ALLOCATION_CONFLICT',$2,'DUPLICATE_SOURCE_CONFLICT')`,[event.eventKey,this.actorId]);
    await db.query('COMMIT');
    return {status:'QUARANTINED',eventKey:event.eventKey,reason:'DUPLICATE_SOURCE_CONFLICT',...SAFE};
   }
   if(created.rowCount===1){
    const snapshot=p.allocations[0]?.ownershipSnapshotId;
    await db.query(`INSERT INTO iris_trust_receipt_manifests
      (event_key,allocation_fingerprint,books_evidence_id,bank_evidence_id,lease_id,tenant_id,ownership_snapshot_id,allocation_count)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [event.eventKey,p.allocationFingerprint,r.booksEvidenceId,r.bankEvidenceId,p.sourceLeaseId,p.sourceTenantId,
       snapshot,p.allocations.length]);
    for(const a of p.allocations){
     await db.query(`INSERT INTO iris_trust_receipt_allocations
      (event_key,owner_id,property_id,ownership_snapshot_id,basis_points,allocated_cents)
      VALUES($1,$2,$3,$4,$5,$6)`,
      [event.eventKey,a.ownerId,a.propertyId,a.ownershipSnapshotId,a.basisPoints,a.amountCents]);
    }
    await db.query(`INSERT INTO iris_trust_review_audit(event_key,action,actor_id)
      VALUES($1,'ALLOCATIONS_PREVIEWED',$2)`,[event.eventKey,this.actorId]);
   }else{
    const manifest=await db.query('SELECT allocation_fingerprint,allocation_count FROM iris_trust_receipt_manifests WHERE event_key=$1',[event.eventKey]);
    if(manifest.rowCount!==1||manifest.rows[0].allocation_fingerprint!==p.allocationFingerprint||
      Number(manifest.rows[0].allocation_count)!==p.allocations.length)throw Error('MANIFEST_NOT_VERIFIED');
   }
   await db.query('COMMIT');
   return {status:'PREVIEW_STORED',eventKey:event.eventKey,duplicate:created.rowCount===0,
    allocationCount:p.allocations.length,...SAFE};
  }catch(e){try{await db.query('ROLLBACK')}catch{};throw e}finally{db.release()}
 }
}
