import test from 'node:test';import assert from 'node:assert/strict';
import {preparePortalOutbox,signOutboxDispatch,dispatchPilotOutbox} from './portal_outbox.mjs';
import {verifySignedPortalRequest} from './contract.mjs';
const l={id:'11111111-1111-4111-8111-111111111111',property_id:'22222222-2222-4222-8222-222222222222',status:'active'};
const args={lease:l,eventId:'33333333-3333-4333-8333-333333333333',version:1,period:'2027-01',occurredAt:'2026-11-25T00:00:00Z',action:'TEST_INVOICE_REQUEST',featureEnabled:true,actorRole:'finance_admin'};
test('only finance admins can emit a deliberate pilot event',()=>{
 assert.throws(()=>preparePortalOutbox({...args,featureEnabled:false}),/IRIS_PILOT_TRIGGER_DISABLED/);
 assert.throws(()=>preparePortalOutbox({...args,actorRole:'viewer'}),/IRIS_PILOT_TRIGGER_DISABLED/);
 assert.throws(()=>preparePortalOutbox({...args,action:'PAYOUT_EXECUTE'}),/PILOT_ACTION_DENIED/);
 assert.equal(preparePortalOutbox(args).lease_id,l.id);
});
test('outbox signature verifies exact JSON bytes',()=>{
 const event=preparePortalOutbox(args),secret='a'.repeat(32),timestamp='1795636800',signed=signOutboxDispatch({event,secret,timestamp});
 assert.equal(verifySignedPortalRequest({...signed,timestamp,signature:signed.headers['x-iris-signature'],secret,now:1795636800000}).property_id,l.property_id);
});
test('worker treats uncertain HTTP outcome as hold, never auto-retries',async()=>{
 const row={id:'pilot-1',event:preparePortalOutbox(args)},marked=[];
 const result=await dispatchPilotOutbox({claimOutbox:async()=>row,markAccepted:async x=>marked.push(['accepted',x]),markUncertain:async(x,r)=>marked.push(['uncertain',x,r]),postSignedEvent:async()=>{throw Error('timeout')},secret:'a'.repeat(32),timestamp:'1795636800'});
 assert.equal(result.status,'UNCERTAIN');assert.deepEqual(marked,[['uncertain','pilot-1','NETWORK_OR_TIMEOUT_UNKNOWN']]);
});
