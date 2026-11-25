import test from 'node:test';import assert from 'node:assert/strict';
import {makeBooksClient} from './books_transport.mjs';
const ref='IRIS-TEST-11111111-1111-4111-8111-111111111111-2027-01';
test('uses Books organization and server auth for readback',async()=>{
 const calls=[];const client=makeBooksClient({apiBaseUrl:'https://www.zohoapis.com/',accessToken:'fake-test',fetchImpl:async(url,opts)=>{calls.push({url,opts});return{ok:true,json:async()=>({code:0,invoice:{invoice_id:'123',reference_number:ref}})}}});
 assert.equal((await client.getInvoice('123')).invoice_id,'123');
 assert.ok(calls[0].url.includes('organization_id=110003520057'));
 assert.equal(calls[0].opts.headers.Authorization,'Zoho-oauthtoken fake-test');
});
test('blocks unknown hosts, non-HTTPS and unapproved write mode',async()=>{
 assert.throws(()=>makeBooksClient({apiBaseUrl:'http://www.zohoapis.com/',accessToken:'x',fetchImpl:async()=>{}}),/UNAPPROVED_BOOKS_API_HOST/);
 const client=makeBooksClient({apiBaseUrl:'https://www.zohoapis.com/',accessToken:'x',fetchImpl:async()=>{throw Error('MUST_NOT_CALL_NETWORK')}});
 await assert.rejects(()=>client.createDraftDisabledByDefault({draft:{send:false,reference_number:ref}}),/BOOKS_DRAFT_WRITE_NOT_APPROVED/);
});
test('search requires exact reference; incomplete result cannot authorize writing',async()=>{
 const client=makeBooksClient({apiBaseUrl:'https://www.zohoapis.com/',accessToken:'x',fetchImpl:async()=>({ok:true,json:async()=>({code:0,invoices:[{invoice_id:'1',reference_number:'not-ref'}],page_context:{has_more_page:true}})})});
 const result=await client.findByReference(ref);
 assert.equal(result.exact.length,0);assert.equal(result.searchComplete,false);assert.equal(result.writeSafe,false);
});
