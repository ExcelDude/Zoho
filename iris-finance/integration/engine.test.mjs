import assert from 'node:assert/strict';
import {IntegrationEngine,validateEvent,decideEvent,classifyWriteOutcome} from './engine.mjs';
class FakeStore {
 constructor(){this.rows=new Map();this.audit=[];this.counter=0}
 async insertOrGet(e){const r=this.rows.get(e.eventKey);if(r)return {...r,wasExisting:true};const row={...e,status:'RECEIVED',wasExisting:false};this.rows.set(e.eventKey,row);return row}
 async claim(key){const r=this.rows.get(key);if(!r)return {acquired:false,reason:'MISSING_EVENT'};if(r.status!=='RECEIVED')return {acquired:false,reason:'ALREADY_CLAIMED_OR_HANDLED'};const token='claim-'+(++this.counter);r.status='PROCESSING';r.token=token;this.audit.push(['CLAIM',key]);return {acquired:true,token,event:r}}
 async complete(key,token,status,projection){const r=this.rows.get(key);if(r?.status!=='PROCESSING'||r.token!==token)throw Error('LOST_CLAIM');r.status=status;r.projection=projection;this.audit.push(['COMPLETE',key,status])}
 async quarantine(key,reason){const r=this.rows.get(key);if(!r)throw Error('MISSING_EVENT');r.status='QUARANTINED';r.reason=reason;this.audit.push(['QUARANTINE',key,reason])}
}
const original={type:'LEASE_ACTIVATED',sourceSystem:'iris',sourceId:'lease-123',sourceVersion:'1',organizationId:'110003520057',occurredAt:'2026-11-16T09:00:00Z',payload:{rentCents:300000,tenantId:'tenant1'}};
const gates={sourceDataVerified:true,ownerOrTenantIdentityVerified:true,periodEligible:true,reviewedApproval:true,sourceSnapshotComplete:true};
const s=new FakeStore(),engine=new IntegrationEngine({store:s,clock:()=>original.occurredAt});
const ingested=await engine.ingest(original);assert.equal(ingested.status,'RECEIVED');assert.equal(ingested.duplicate,false);
const again=await engine.ingest(original);assert.equal(again.duplicate,true);assert.equal(s.rows.size,1);
const first=await engine.process(ingested.eventKey,{controls:gates});assert.equal(first.status,'PREVIEW_READY');assert.equal(first.productionWriteAllowed,false);
const second=await engine.process(ingested.eventKey,{controls:gates});assert.equal(second.status,'ALREADY_CLAIMED_OR_HANDLED');
const another={...original,sourceVersion:'2',payload:{...original.payload,rentCents:310000}};assert.notEqual(validateEvent(another).eventKey,ingested.eventKey);
const revised=await engine.ingest(another);assert.equal(revised.status,'RECEIVED');assert.equal(s.rows.size,2);
const conflicting={...original,payload:{...original.payload,rentCents:490000}};assert.equal((await engine.ingest(conflicting)).status,'QUARANTINED');
assert.equal(s.rows.get(ingested.eventKey).status,'QUARANTINED');
const f=await engine.ingest({...original,sourceId:'lease-456'});assert.equal((await engine.process(f.eventKey,{controls:{...gates,reviewedApproval:false}})).status,'HOLD');
assert.throws(()=>validateEvent({...original,type:'UNKNOWN'}),/UNSUPPORTED_EVENT_TYPE/);
assert.throws(()=>validateEvent({...original,organizationId:'wrong'}),/UNKNOWN_BOOKS_ORGANIZATION/);
assert.throws(()=>validateEvent({...original,type:'RENT_CYCLE_DUE'}),/ACCOUNTING_PERIOD_REQUIRED/);
const fee=validateEvent({...original,type:'OWNER_FEE_ELIGIBLE',accountingPeriod:'2027-01'});assert(decideEvent({event:fee,controls:gates}).blocking.includes('SIGNED_AGREEMENT_REQUIRED'));
const receipt=validateEvent({...original,type:'RENT_PAYMENT_SETTLED'});assert(decideEvent({event:receipt,controls:gates}).blocking.includes('BANK_EVIDENCE_REQUIRED'));
assert.equal(classifyWriteOutcome({request:{sourceRef:'x',idempotencyKey:'y'},lookup:null}).status,'QUARANTINE');
assert.equal(classifyWriteOutcome({request:{sourceRef:'x',idempotencyKey:'y'},lookup:[],createResult:'TIMEOUT'}).reason,'UNCERTAIN_WRITE_DO_NOT_RETRY');
assert.equal(classifyWriteOutcome({request:{sourceRef:'x',idempotencyKey:'y'},lookup:[{invoice_id:'A'},{invoice_id:'B'}]}).status,'QUARANTINE');
assert.equal(classifyWriteOutcome({request:{sourceRef:'x',idempotencyKey:'y'},lookup:[{invoice_id:'A'}]}).status,'EXISTING_REFERENCE_REQUIRES_READBACK');
assert.equal(classifyWriteOutcome({request:{sourceRef:'x',idempotencyKey:'y'},lookup:[]}).status,'WRITE_NOT_AUTHORIZED');
assert.notEqual(validateEvent({...original,type:'RENT_CYCLE_DUE',accountingPeriod:'2027-01'}).eventKey,validateEvent({...original,type:'RENT_CYCLE_DUE',accountingPeriod:'2027-02'}).eventKey);
console.log('Integration engine 17 core scenarios passed; writes disabled');
