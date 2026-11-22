/** Read-only bridge from Iris finance integration events to durable trust PREVIEW metadata.
 * Only independently matched, CLEARED receipts can enter trust-event previews.
 * Lease billing events remain lease plans, never disguised as money received.
 */
import {validateEvent,decideEvent} from '../integration/engine.mjs';
import {normalizeTrustEvent} from './trust_event_store.mjs';

const SAFE=Object.freeze({productionWriteAllowed:false,booksWriteAllowed:false,paymentAllowed:false,payoutAllowed:false,trustTransferAllowed:false});
const dateOk=s=>typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const hold=(reasons,sourceKey)=>({status:'HOLD',reasons:[...new Set(reasons)],sourceKey:sourceKey||null,...SAFE});
export function routeFinanceEvent({source,controls={},receipt=null,identity=null}){
 let e;
 try{e=validateEvent(source)}catch{return hold(['INVALID_SOURCE_EVENT']);}
 const decision=decideEvent({event:e,controls});
 if(e.type!=='RENT_PAYMENT_SETTLED'){
  return {status:'SOURCE_PREVIEW_ONLY',sourceKey:e.eventKey,plannedAction:e.plannedAction,reason:'NOT_A_CLEARED_RENT_RECEIPT',...SAFE};
 }
 const reasons=[...decision.blocking];
 if(!receipt||typeof receipt!=='object')reasons.push('RECEIPT_EVIDENCE_MISSING');
 if(!identity||typeof identity!=='object')reasons.push('OWNER_PROPERTY_IDENTITY_MISSING');
 if(receipt){
  if(!receipt.bankEvidenceId||!receipt.booksEvidenceId||!receipt.sourceTransactionId)reasons.push('RECEIPT_EVIDENCE_MISSING');
  if(receipt.pool!=='RENT'||receipt.bankMappingApproved!==true||!receipt.booksBankAccountId)reasons.push('BANK_MAPPING_MISSING');
  if(receipt.status!=='CLEARED'||!dateOk(receipt.clearedAt))reasons.push('MISSING_SETTLEMENT');
  if(!Number.isSafeInteger(receipt.amountCents)||receipt.amountCents<=0)reasons.push('INVALID_RECEIPT_AMOUNT');
  if(receipt.transactionVerified!==true||receipt.independentReadbackVerified!==true)reasons.push('SOURCE_EVIDENCE_MISSING');
  if(receipt.tenantId!==e.payload?.tenantId||receipt.leaseId!==e.sourceId)reasons.push('TENANT_LEASE_REFERENCE_MISMATCH');
  if(receipt.propertyId!==e.payload?.propertyId)reasons.push('PROPERTY_REFERENCE_MISMATCH');
 }
 if(identity){
  if(identity.independentlyVerified!==true||!identity.ownerId||!identity.propertyId||!identity.ownershipSnapshotId)reasons.push('OWNER_IDENTITY_UNVERIFIED');
  if(identity.tenantId!==e.payload?.tenantId||identity.leaseId!==e.sourceId||identity.propertyId!==e.payload?.propertyId)reasons.push('OWNERSHIP_SOURCE_MISMATCH');
  if(identity.ownershipPercent!==100)reasons.push('MULTI_OWNER_ALLOCATION_NOT_SUPPORTED');
 }
 if(reasons.length)return hold(reasons,e.eventKey);
 // This trust row is still PREVIEW metadata; it cannot be booked as an actual receipt.
 const raw={organizationId:e.organizationId,pool:'RENT',eventType:'RENT_RECEIPT',
  sourceSystem:'BOOKS_BANK',sourceId:receipt.sourceTransactionId,sourceVersion:'1',
  eventDate:receipt.clearedAt,amountCents:receipt.amountCents,
  principalId:identity.ownerId,propertyId:identity.propertyId};
 try{
  const trust=normalizeTrustEvent(raw);
  return {status:'TRUST_PREVIEW_CANDIDATE',sourceKey:e.eventKey,trust,...SAFE};
 }catch{return hold(['TRUST_PREVIEW_VALIDATION_FAILED'],e.eventKey)}
}
export async function persistFinanceReceiptPreview({routerInput,trustStore}){
 if(!trustStore?.ingest)throw Error('DURABLE_TRUST_STORE_REQUIRED');
 const routed=routeFinanceEvent(routerInput);
 if(routed.status!=='TRUST_PREVIEW_CANDIDATE')return routed;
 const saved=await trustStore.ingest(routed.trust);
 return {status:saved.status,sourceKey:routed.sourceKey,trustEventKey:saved.eventKey,duplicate:saved.duplicate,
  reasons:saved.status==='QUARANTINED'?['DUPLICATE_SOURCE_CONFLICT']:[],...SAFE};
}
