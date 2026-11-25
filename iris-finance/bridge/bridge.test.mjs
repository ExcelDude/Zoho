import test from 'node:test';import assert from 'node:assert/strict';import {createHmac} from 'node:crypto';
import {verifySignedPortalRequest,parsePortalEvent,ORG_ID} from './contract.mjs';
import {stagePortalEvent,reconcileBooksCallback,prepareDraftInvoice,makeInvoiceReference} from './bridge.mjs';
import {portalEventEndpoint,booksCallbackEndpoint} from './http_handlers.mjs';
const LEASE='11111111-1111-4111-8111-111111111111',PROP='22222222-2222-4222-8222-222222222222',EVENT='33333333-3333-4333-8333-333333333333';
const event=()=>({organization_id:ORG_ID,type:'TEST_INVOICE_REQUEST',source_event_id:EVENT,lease_id:LEASE,property_id:PROP,accounting_period:'2027-01',source_version:1,occurred_at:'2026-11-25T12:00:00Z'});
const lease={id:LEASE,property_id:PROP,status:'active',rent_amount:'2500.00'};
const mapping={books_customer_id:'100023',books_item_id:'100053',iris_lease_id:LEASE,iris_property_id:PROP};
const controls=Object.fromEntries(['sourceSnapshotVerified','accountantApproved','testCustomerConfirmed','testItemConfirmed','syntheticTestOnlyApproved'].map(x=>[x,true]));
class Store{constructor(){this.events=new Map();this.evidence=[];this.exceptions=[];this.ref=null;}
 async reserve({key,digest,sourceEventId}){const prev=this.events.get(key);if(prev)return{...prev,existing:true};const row={key,digest,sourceEventId};this.events.set(key,row);return{...row,existing:false}}
 async recordPreview(x){this.ref=x.reference;this.preview=x;}
 async findByReference(r){return r===this.ref?{booksCustomerId:mapping.books_customer_id}:null}
 async flagException(x){this.exceptions.push(x)}
 async attachBooksEvidence(x){this.evidence.push(x)}
}
test('valid portal request is verified over exact raw body with replay window',()=>{
 const raw=JSON.stringify(event()),secret='a'.repeat(32),timestamp='1795636800',now=1795636800000;
 const signature=createHmac('sha256',secret).update(timestamp+'.'+raw).digest('hex');
 assert.equal(verifySignedPortalRequest({rawBody:raw,timestamp,signature,secret,now}).lease_id,LEASE);
 assert.throws(()=>verifySignedPortalRequest({rawBody:raw,timestamp,signature:'wrong',secret,now}),/INVALID_PORTAL_SIGNATURE/);
 assert.throws(()=>verifySignedPortalRequest({rawBody:raw,timestamp,signature,secret,now:now+6*60*1000}),/STALE_PORTAL_REQUEST/);
});
test('reject extra data, wrong org and non-approved events',()=>{
 assert.throws(()=>parsePortalEvent({...event(),tenant_email:'private'}),/UNEXPECTED_DATA_FIELD/);
 assert.throws(()=>parsePortalEvent({...event(),organization_id:'wrong'}),/WRONG_BOOKS_ORG/);
 assert.throws(()=>parsePortalEvent({...event(),type:'PAYOUT_EXECUTE'}),/EVENT_TYPE_DENIED/);
});
test('without owner or accountant approvals, pilot cannot produce a draft',()=>{
 const x=prepareDraftInvoice({event:event(),lease,mapping,controls:{...controls,syntheticTestOnlyApproved:false}});
 assert.equal(x.draft,null);assert.equal(x.postingAllowed,false);assert.ok(x.holds.includes('syntheticTestOnlyApproved'));
});
test('even approved synthetic pilot is preview only with no invoice transmission',async()=>{
 const store=new Store(),r=await stagePortalEvent({event:event(),store,lease,mapping,controls});
 assert.equal(r.status,'PREVIEW_READY');assert.equal(r.financialWrites,0);assert.equal(r.preview.send,false);assert.equal(r.preview.line_items[0].rate,1);assert.equal(r.preview.custom_fields.length,3);
 assert.equal(r.reference,makeInvoiceReference(event()));
 const again=await stagePortalEvent({event:event(),store,lease,mapping,controls});
 assert.equal(again.status,'DUPLICATE_NO_ACTION');assert.equal(store.events.size,1);
});
test('payload mutation under same key is held',async()=>{
 const store=new Store();await stagePortalEvent({event:event(),store,lease,mapping,controls});
 const changed={...event(),source_event_id:'44444444-4444-4444-8444-444444444444'};
 const result=await stagePortalEvent({event:changed,store,lease,mapping,controls});
 assert.equal(result.status,'CONFLICT_HOLD');assert.equal(store.events.size,1);
});
test('Books callback requires confirmed independent invoice readback',async()=>{
 const store=new Store();await stagePortalEvent({event:event(),store,lease,mapping,controls});
 const p={organization_id:ORG_ID,module:'invoice',event:'created',books_invoice_id:'998877',external_reference:makeInvoiceReference(event())};
 const mismatch=await reconcileBooksCallback({payload:p,store,booksReadInvoice:async()=>({invoice_id:'998877',reference_number:p.external_reference,customer_id:'wrong'})});
 assert.equal(mismatch.status,'READBACK_MISMATCH_HOLD');assert.equal(store.exceptions.length,1);
 const ok=await reconcileBooksCallback({payload:p,store,booksReadInvoice:async()=>({invoice_id:'998877',reference_number:p.external_reference,customer_id:mapping.books_customer_id})});
 assert.equal(ok.status,'EVIDENCE_RECORDED');assert.equal(store.evidence.length,1);
});
test('portal endpoint accepts only signed events, callback requires bearer credential',async()=>{
 const env={IRIS_EVENT_HMAC_SECRET:'a'.repeat(32),BOOKS_CALLBACK_BEARER_SECRET:'b'.repeat(32)};
 const raw=JSON.stringify(event()),timestamp='1795636800',signature=createHmac('sha256',env.IRIS_EVENT_HMAC_SECRET).update(timestamp+'.'+raw).digest('hex'),store=new Store();
 const deps={rawBody:raw,headers:{'x-iris-timestamp':timestamp,'x-iris-signature':signature},store,loadLease:async()=>lease,loadMapping:async()=>mapping,loadControls:async()=>controls,env,now:1795636800000};
 assert.equal((await portalEventEndpoint(deps)).statusCode,202);
 assert.equal((await portalEventEndpoint({...deps,headers:{}})).statusCode,401);
 const payload=JSON.stringify({organization_id:ORG_ID,module:'invoice',event:'created',books_invoice_id:'998877',external_reference:makeInvoiceReference(event())});
 assert.equal((await booksCallbackEndpoint({rawBody:payload,headers:{authorization:'Bearer '+env.BOOKS_CALLBACK_BEARER_SECRET},env,store,booksReadInvoice:async()=>({invoice_id:'998877',reference_number:makeInvoiceReference(event()),customer_id:mapping.books_customer_id})})).statusCode,200);
 assert.equal((await booksCallbackEndpoint({rawBody:payload,headers:{authorization:'Bearer invalid'},env,store,booksReadInvoice:async()=>null})).statusCode,401);
});
