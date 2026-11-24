import assert from 'node:assert/strict';
import {PropraReadOnlyClient} from './propra_readonly_client.mjs';
const calls=[];
const client=new PropraReadOnlyClient({baseUrl:'https://approved.example/',approvedHost:'approved.example',
 paths:['/known/account'],authHeaders:()=>({'X-Synthetic-Test-Credential':'NEVER_LOG_THIS'}),
 transport:async (url,opts)=>{calls.push({url,method:opts.method,redirect:opts.redirect,credentials:opts.credentials});
 return {ok:true,headers:{get:()=> 'application/json'},json:async()=>({accountId:'test-only'})}}});
assert.deepEqual(await client.get('/known/account'),{accountId:'test-only'});
assert.deepEqual(calls,[{url:'https://approved.example/known/account',method:'GET',redirect:'error',credentials:'omit'}]);
await assert.rejects(()=>client.get('/unknown'),/UNAPPROVED_PROPRA_ENDPOINT/);
await assert.rejects(()=>client.get('https://evil.example'),/UNAPPROVED_PROPRA_ENDPOINT/);
assert.throws(()=>new PropraReadOnlyClient({baseUrl:'https://approved.example/',approvedHost:'other.example',paths:['/known/account'],authHeaders:()=>({}),transport:()=>{}}));
assert.throws(()=>new PropraReadOnlyClient({baseUrl:'http://approved.example/',approvedHost:'approved.example',paths:['/known/account'],authHeaders:()=>({}),transport:()=>{}}));
assert.throws(()=>new PropraReadOnlyClient({baseUrl:'https://approved.example/',approvedHost:'approved.example',paths:['/bad?x=1'],authHeaders:()=>({}),transport:()=>{}}));
const failed=new PropraReadOnlyClient({baseUrl:'https://approved.example/',approvedHost:'approved.example',paths:['/known/account'],
 authHeaders:()=>({'X-Secret':'SYNTHETIC-CREDENTIAL'}),transport:async()=>{throw Error('SYNTHETIC-CREDENTIAL')}})
await assert.rejects(()=>failed.get('/known/account'),e=>e.message==='PROPRA_READ_ONLY_REQUEST_FAILED'&&!e.message.includes('SYNTHETIC'));
const denied=new PropraReadOnlyClient({baseUrl:'https://approved.example/',approvedHost:'approved.example',paths:['/known/account'],
 authHeaders:()=>({'X-Secret':'SYNTHETIC-CREDENTIAL'}),transport:async()=>({ok:false,status:403})});
await assert.rejects(()=>denied.get('/known/account'),/PROPRA_READ_ONLY_REQUEST_REJECTED/);
console.log('Propra client synthetic transport tests passed; no live request, no credentials in source');
