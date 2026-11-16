import {createHash} from 'node:crypto';

const stable = value => Array.isArray(value) ? '['+value.map(stable).join(',')+']' :
  value && typeof value==='object' ? '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}' : JSON.stringify(value);
const digest = v => createHash('sha256').update(stable(v)).digest('hex');
const TYPES = new Set(['LEASE_ACTIVATED','LEASE_RENT_CHANGED','RENT_CYCLE_DUE','RENT_PAYMENT_SETTLED','OWNER_AGREEMENT_APPROVED','OWNER_FEE_ELIGIBLE','MAINTENANCE_APPROVED','BANK_RECEIPT_UNMATCHED','OWNER_STATEMENT_PREPARE']);
const ACTION = {
 LEASE_ACTIVATED:'PREPARE_RENT_PLAN', LEASE_RENT_CHANGED:'REVALIDATE_RENT_PLAN',
 RENT_CYCLE_DUE:'PREPARE_RENT_DRAFT', RENT_PAYMENT_SETTLED:'RECONCILE_RECEIPT',
 OWNER_AGREEMENT_APPROVED:'REVALIDATE_FEE_RULES',OWNER_FEE_ELIGIBLE:'PREPARE_FEE_DRAFT',
 MAINTENANCE_APPROVED:'PREPARE_AP_DRAFT', BANK_RECEIPT_UNMATCHED:'OPEN_EXCEPTION',
 OWNER_STATEMENT_PREPARE:'GENERATE_STATEMENT_PREVIEW'
};
const SAFE = {productionWriteAllowed:false,paymentAllowed:false,sendAllowed:false,trustTransferAllowed:false};
export function validateEvent(event){
 if(!event || !TYPES.has(event.type))throw Error('UNSUPPORTED_EVENT_TYPE');
 for(const field of ['sourceSystem','sourceId','sourceVersion','organizationId','occurredAt'])
   if(typeof event[field]!=='string'||!event[field].trim())throw Error('MISSING_'+field.toUpperCase());
 if(!Number.isFinite(Date.parse(event.occurredAt)))throw Error('INVALID_EVENT_TIME');
 if(!event.payload||Array.isArray(event.payload)||typeof event.payload!=='object')throw Error('INVALID_PAYLOAD');
 if(event.organizationId!=='110003520057')throw Error('UNKNOWN_BOOKS_ORGANIZATION');
 if(['RENT_CYCLE_DUE','OWNER_FEE_ELIGIBLE','OWNER_STATEMENT_PREPARE'].includes(event.type)&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(event.accountingPeriod||''))throw Error('ACCOUNTING_PERIOD_REQUIRED');
 const eventKey=[event.organizationId,event.sourceSystem,event.sourceId,event.type,event.accountingPeriod||'NA',event.sourceVersion].map(encodeURIComponent).join('|');
 return {...event,eventKey,payloadHash:digest(event.payload),plannedAction:ACTION[event.type]};
}
export function decideEvent({event,controls={}}){
 const blocked=[];
 for(const k of ['sourceDataVerified','ownerOrTenantIdentityVerified','periodEligible','reviewedApproval','sourceSnapshotComplete'])
  if(controls[k]!==true)blocked.push('GATE_'+k.toUpperCase());
 if(['OWNER_FEE_ELIGIBLE','OWNER_STATEMENT_PREPARE'].includes(event.type)&&controls.signedAgreementVerified!==true)blocked.push('SIGNED_AGREEMENT_REQUIRED');
 if(['RENT_PAYMENT_SETTLED','BANK_RECEIPT_UNMATCHED'].includes(event.type)&&controls.booksBankEvidenceVerified!==true)blocked.push('BANK_EVIDENCE_REQUIRED');
 const projection={eventKey:event.eventKey,action:event.plannedAction,sourceId:event.sourceId,sourceVersion:event.sourceVersion,organizationId:event.organizationId,payloadHash:event.payloadHash,decision:blocked.length?'HOLD':'PREVIEW_READY',blocking:blocked,...SAFE};
 return projection;
}
export class IntegrationEngine {
 constructor({store,clock=()=>new Date().toISOString()}){if(!store?.insertOrGet||!store?.claim||!store?.complete||!store?.quarantine)throw Error('DURABLE_STORE_ADAPTER_REQUIRED');this.store=store;this.clock=clock}
 async ingest(raw){
  const e=validateEvent(raw);
  // Database must enforce UNIQUE(event_key) and compare payload hash atomically.
  const saved=await this.store.insertOrGet(e);
  if(saved.payloadHash!==e.payloadHash){await this.store.quarantine(e.eventKey,'SOURCE_VERSION_PAYLOAD_CONFLICT');return {status:'QUARANTINED',eventKey:e.eventKey,reason:'SOURCE_VERSION_PAYLOAD_CONFLICT',...SAFE}}
  return {status:saved.status,eventKey:e.eventKey,duplicate:saved.wasExisting===true,...SAFE};
 }
 async process(eventKey,{controls}={}){
  const claim=await this.store.claim(eventKey,this.clock());
  if(!claim.acquired)return {status:claim.reason||'NOT_CLAIMED',eventKey,...SAFE};
  const event=claim.event;
  try{
   const projection=decideEvent({event,controls});
   await this.store.complete(eventKey,claim.token,projection.decision,projection,this.clock());
   return {status:projection.decision,eventKey,projection,...SAFE};
  }catch(error){
   // No financial writes in this engine. Unexpected errors remain retryable by human-reviewed queue.
   await this.store.quarantine(eventKey,'ENGINE_ERROR');
   return {status:'QUARANTINED',eventKey,reason:'ENGINE_ERROR',...SAFE};
  }
 }
}
export function classifyWriteOutcome({request,lookup,createResult}){
 // This helper DOES NOT PERFORM writes; it makes future adapter behavior explicit.
 if(!request?.sourceRef||!request?.idempotencyKey)return {status:'HOLD',reason:'MISSING_EXTERNAL_IDEMPOTENCY'};
 if(!Array.isArray(lookup))return {status:'QUARANTINE',reason:'REFERENCE_LOOKUP_FAILED'};
 if(lookup.length>1)return {status:'QUARANTINE',reason:'DUPLICATE_EXTERNAL_REFERENCE'};
 if(lookup.length===1)return {status:'EXISTING_REFERENCE_REQUIRES_READBACK',invoiceId:lookup[0].invoice_id};
 if(createResult==='TIMEOUT'||createResult==='UNKNOWN')return {status:'QUARANTINE',reason:'UNCERTAIN_WRITE_DO_NOT_RETRY'};
 return {status:'WRITE_NOT_AUTHORIZED',reason:'DRY_RUN_ONLY'};
}
