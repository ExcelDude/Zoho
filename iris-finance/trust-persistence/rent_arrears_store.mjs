/** Review-only, PostgreSQL-backed rent obligation and exception previews.
 * Reservations are NOT payments. All money is integer CAD cents.
 * Database row locks prevent two different preview receipts from consuming
 * the same remaining obligation based on a stale external snapshot.
 */
import {createHash} from 'node:crypto';
import {prepareMultiOwnerReceipt} from './multiowner_allocation.mjs';
import {assessRentReceipt} from './rent_payment_exceptions.mjs';
const SAFE=Object.freeze({postingAllowed:false,booksWriteAllowed:false,bankTransferAllowed:false,payoutAllowed:false,paymentAllowed:false});
const fingerprint=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const ident=x=>typeof x==='string'&&x.trim().length>0&&x.length<=1024;
const cents=x=>Number.isSafeInteger(x)&&x>=0;
const hold=(reason,extra={})=>({status:'HOLD',reason,...extra,...SAFE});
export class RentArrearsPreviewStore {
 constructor({pool,actorId}){if(!pool?.connect||!ident(actorId))throw Error('RESTRICTED_POOL_AND_ACTOR_REQUIRED');this.pool=pool;this.actorId=actorId}
 async tx(fn){const db=await this.pool.connect();try{await db.query('BEGIN');let result=await fn(db);await db.query('COMMIT');return result}catch(e){try{await db.query('ROLLBACK')}catch{}throw e}finally{db.release()}}
 async registerObligation(o){
  const flags=['verified','balanceApproved','snapshotFinalized','previousReceiptIdsVerified'];
  if(!o||flags.some(k=>o[k]!==true)||!ident(o.obligationKey)||!ident(o.snapshotRef)||
    !ident(o.invoiceOrRentPlanRef)||!ident(o.leaseId)||!ident(o.tenantId)||!ident(o.propertyId)||
    !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(o.period||'')||
    !cents(o.rentDueCents)||!cents(o.priorClearedCents)||o.priorClearedCents>o.rentDueCents||
    !cents(o.priorCreditsCents)||o.priorCreditsCents!==0||!Array.isArray(o.previousReceiptIds)||o.previousReceiptIds.length)
    return hold('APPROVED_SNAPSHOT_OR_HISTORY_REQUIRED');
  return this.tx(async db=>{
   await db.query(`INSERT INTO iris_rent_obligation_previews
      (obligation_key,organization_id,lease_id,tenant_id,property_id,accounting_period,snapshot_ref,invoice_or_plan_ref,rent_due_cents,prior_cleared_cents)
      VALUES($1,'110003520057',$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (obligation_key) DO NOTHING`,
      [o.obligationKey,o.leaseId,o.tenantId,o.propertyId,o.period,o.snapshotRef,o.invoiceOrRentPlanRef,o.rentDueCents,o.priorClearedCents]);
   const r=await db.query('SELECT * FROM iris_rent_obligation_previews WHERE obligation_key=$1 FOR UPDATE',[o.obligationKey]);
   if(r.rowCount!==1)throw Error('OBLIGATION_READBACK_FAILED');
   if(!equalSnapshot(r.rows[0],o))return hold('STALE_OR_DIFFERENT_OBLIGATION_SNAPSHOT');
   return {status:'OBLIGATION_PREVIEW_REGISTERED',obligationKey:o.obligationKey,posted:false,...SAFE};
  });
 }
 async reserveReceipt({receipt,ownership,approvedBankAccountId,obligation}={}){
  const prepared=prepareMultiOwnerReceipt({receipt,ownership,approvedBankAccountId});
  if(prepared.status!=='MULTI_OWNER_PREVIEW_READY')return prepared;
  if(!obligation?.obligationKey||!ident(obligation.obligationKey))return hold('REGISTERED_OBLIGATION_REQUIRED');
  const preliminary=assessRentReceipt({receipt,obligation});
  if(preliminary.status!=='ALLOCATABLE_PREVIEW')return preliminary;
  return this.tx(async db=>{
   const row=await db.query('SELECT * FROM iris_rent_obligation_previews WHERE obligation_key=$1 FOR UPDATE',[obligation.obligationKey]);
   if(row.rowCount!==1)return hold('OBLIGATION_NOT_REGISTERED');
   const snap=row.rows[0];
   if(!equalSnapshot(snap,obligation))return hold('STALE_OR_DIFFERENT_OBLIGATION_SNAPSHOT');
   const prior=await db.query('SELECT obligation_key,preview_event_key,amount_cents FROM iris_rent_receipt_reservations WHERE bank_transaction_id=$1',[receipt.bankTransactionId]);
   if(prior.rowCount){
     const old=await db.query('SELECT payload_hash FROM iris_trust_event_previews WHERE event_key=$1',[prepared.trust.eventKey]);
     const matching=prior.rows[0].obligation_key===obligation.obligationKey&&
        prior.rows[0].preview_event_key===prepared.trust.eventKey&&
        Number(prior.rows[0].amount_cents)===receipt.amountCents&&old.rows[0]?.payload_hash===prepared.allocationFingerprint;
     if(matching)return {status:'PREVIEW_STORED',eventKey:prepared.trust.eventKey,duplicate:true,...SAFE};
     return await openCaseTx(db,{bankTransactionId:receipt.bankTransactionId,obligationKey:obligation.obligationKey,
       reasonCode:'DUPLICATE_RECEIPT',evidenceReference:receipt.bankEvidenceId,sourceFingerprint:prepared.allocationFingerprint},this.actorId);
   }
   const remaining=Number(snap.rent_due_cents)-Number(snap.prior_cleared_cents)-Number(snap.reserved_preview_cents);
   if(!Number.isSafeInteger(remaining)||remaining<0)throw Error('OBLIGATION_PREVIEW_INVARIANT_BROKEN');
   if(receipt.amountCents>remaining)return await openCaseTx(db,{bankTransactionId:receipt.bankTransactionId,
     obligationKey:obligation.obligationKey,reasonCode:'OVERPAYMENT_UNAPPLIED',evidenceReference:receipt.bankEvidenceId,
     sourceFingerprint:prepared.allocationFingerprint},this.actorId,{remainingCents:remaining,unappliedCents:receipt.amountCents-remaining});
   const event=prepared.trust;
   const insert=await db.query(`INSERT INTO iris_trust_event_previews
     (event_key,organization_id,pool,event_type,source_system,source_id,source_version,event_date,amount_cents,principal_id,property_id,reversal_of,payload_hash)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT(event_key) DO NOTHING RETURNING event_key`,
     [event.eventKey,event.organizationId,event.pool,event.eventType,event.sourceSystem,event.sourceId,event.sourceVersion,
       event.eventDate,event.amountCents,event.principalId,event.propertyId,event.reversalOf,prepared.allocationFingerprint]);
   if(insert.rowCount!==1)throw Error('UNEXPECTED_EXISTING_RECEIPT_NO_RESERVATION');
   const snapId=prepared.allocations[0].ownershipSnapshotId;
   await db.query(`INSERT INTO iris_trust_receipt_manifests
     (event_key,allocation_fingerprint,books_evidence_id,bank_evidence_id,lease_id,tenant_id,ownership_snapshot_id,allocation_count)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
     [event.eventKey,prepared.allocationFingerprint,receipt.booksEvidenceId,receipt.bankEvidenceId,
       receipt.leaseId,receipt.tenantId,snapId,prepared.allocations.length]);
   for(const a of prepared.allocations)await db.query(`INSERT INTO iris_trust_receipt_allocations
     (event_key,owner_id,property_id,ownership_snapshot_id,basis_points,allocated_cents)
     VALUES($1,$2,$3,$4,$5,$6)`,
     [event.eventKey,a.ownerId,a.propertyId,a.ownershipSnapshotId,a.basisPoints,a.amountCents]);
   await db.query(`INSERT INTO iris_rent_receipt_reservations(bank_transaction_id,obligation_key,preview_event_key,amount_cents)
     VALUES($1,$2,$3,$4)`,[receipt.bankTransactionId,obligation.obligationKey,event.eventKey,receipt.amountCents]);
   await db.query(`UPDATE iris_rent_obligation_previews SET reserved_preview_cents=reserved_preview_cents+$2
     WHERE obligation_key=$1`,[obligation.obligationKey,receipt.amountCents]);
   await db.query(`INSERT INTO iris_trust_review_audit(event_key,action,actor_id)
     VALUES($1,'ARREARS_PREVIEW_RESERVED',$2)`,[event.eventKey,this.actorId]);
   return {status:'PREVIEW_STORED',eventKey:event.eventKey,duplicate:false,amountCents:receipt.amountCents,
     remainingPreviewCapacityCents:remaining-receipt.amountCents,...SAFE};
  });
 }
 async recordException(args){
  return this.tx(db=>openCaseTx(db,args,this.actorId));
 }
 async reviewException({caseId,reviewerId,evidenceReference,decision}={}){
  const parsedCaseId=typeof caseId==='string'&&/^[0-9]+$/.test(caseId)?Number(caseId):caseId;
  if(!Number.isSafeInteger(parsedCaseId)||!ident(reviewerId)||!ident(evidenceReference)||reviewerId===this.actorId||
    !['REVIEWED','CLOSED_NO_ACTION'].includes(decision))throw Error('SEPARATE_REVIEW_AND_EVIDENCE_REQUIRED');
  return this.tx(async db=>{
   const r=await db.query(`UPDATE iris_rent_payment_exception_cases
     SET status=$2,reviewed_by=$3,review_evidence_reference=$4,reviewed_at=now()
     WHERE case_id=$1 AND status='OPEN' RETURNING case_id`,[parsedCaseId,decision,reviewerId,evidenceReference]);
   if(r.rowCount!==1)throw Error('CASE_NOT_OPEN');
   await db.query(`INSERT INTO iris_rent_payment_exception_audit(case_id,action,actor_id)
     VALUES($1,$2,$3)`,[caseId,decision,reviewerId]);
   return {status:decision,caseId,...SAFE};
  });
 }
 async readArrearsPreview({obligationKey}={}){
  if(!ident(obligationKey))throw Error('OBLIGATION_KEY_REQUIRED');
  const r=await this.pool.query(`SELECT obligation_key,lease_id,tenant_id,property_id,accounting_period,snapshot_ref,
    rent_due_cents,prior_cleared_cents,reserved_preview_cents
    FROM iris_rent_obligation_previews WHERE obligation_key=$1`,[obligationKey]);
  if(r.rowCount!==1)return hold('OBLIGATION_NOT_REGISTERED');
  const x=r.rows[0],due=Number(x.rent_due_cents),cleared=Number(x.prior_cleared_cents),reserved=Number(x.reserved_preview_cents);
  return {status:'READ_ONLY_ARREARS_FORECAST',obligationKey:x.obligation_key,period:x.accounting_period,
    snapshotRef:x.snapshot_ref,
    verifiedHistoricalOutstandingCents:due-cleared,
    reservedPreviewCents:reserved,
    forecastUnreservedCents:due-cleared-reserved,
    reservationsAreNotPayments:true,collectionsCertified:false,...SAFE};
 }
}
function equalSnapshot(x,o){return x.lease_id===o.leaseId&&x.tenant_id===o.tenantId&&x.property_id===o.propertyId&&
 x.accounting_period===o.period&&x.snapshot_ref===o.snapshotRef&&x.invoice_or_plan_ref===o.invoiceOrRentPlanRef&&
 Number(x.rent_due_cents)===o.rentDueCents&&Number(x.prior_cleared_cents)===o.priorClearedCents}
async function openCaseTx(db,x,actorId,extra={}){
 if(!ident(x?.bankTransactionId)||!ident(x?.evidenceReference)||!ident(x?.sourceFingerprint)||
  !['OVERPAYMENT_UNAPPLIED','RENT_OBLIGATION_STALE','UNVERIFIED_RECEIPT','NSF_REVIEW',
    'CREDIT_BALANCE_REVIEW','DUPLICATE_RECEIPT','BALANCE_EVIDENCE_MISSING'].includes(x.reasonCode))
  throw Error('INVALID_PAYMENT_EXCEPTION');
 const r=await db.query(`INSERT INTO iris_rent_payment_exception_cases
   (bank_transaction_id,obligation_key,reason_code,source_fingerprint,evidence_reference)
   VALUES($1,$2,$3,$4,$5)
   ON CONFLICT(bank_transaction_id,reason_code,source_fingerprint)
   DO UPDATE SET evidence_reference=iris_rent_payment_exception_cases.evidence_reference
   RETURNING case_id,status`,[x.bankTransactionId,x.obligationKey||null,x.reasonCode,x.sourceFingerprint,x.evidenceReference]);
 await db.query(`INSERT INTO iris_rent_payment_exception_audit(case_id,action,actor_id)
   VALUES($1,'FLAG',$2)`,[r.rows[0].case_id,actorId]);
 return {status:'HELD_EXCEPTION',caseId:r.rows[0].case_id,caseStatus:r.rows[0].status,
   reason:x.reasonCode,...extra,...SAFE};
}
