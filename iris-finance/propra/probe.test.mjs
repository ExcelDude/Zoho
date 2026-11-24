import assert from 'node:assert/strict';
import {probeConfig,runProbe} from './probe.mjs';
const env={PROPRA_API_BASE_URL:'https://approved.example/',PROPRA_API_HOST:'approved.example',
 PROPRA_GET_PATH:'/account',PROPRA_API_KEY_HEADER:'X-Test-Key',
 PROPRA_API_SECRET_HEADER:'X-Test-Secret',PROPRA_API_KEY:'DUMMY_TEST_KEY',
 PROPRA_API_SECRET:'DUMMY_TEST_SECRET'};
assert.equal(probeConfig(env).path,'/account');
await assert.rejects(()=>runProbe({...env,PROPRA_API_HOST:'unknown.example'}),/PROPRA_APPROVED_CONFIGURATION_REQUIRED/);
assert.throws(()=>probeConfig({...env,PROPRA_API_KEY_HEADER:'Authorization'}),/UNVERIFIED_PROPRA_AUTH_HEADER_FORMAT/);
assert.throws(()=>probeConfig({...env,PROPRA_API_SECRET:''}),/DOCUMENTED_ENDPOINT_AND_RUNTIME_SECRETS_REQUIRED/);
assert.throws(()=>probeConfig({...env,PROPRA_GET_PATH:'/account?token=secret'}),/PROPRA_APPROVED_CONFIGURATION_REQUIRED/);
let called=0;
const result=await runProbe(env,{transport:async (url,options)=>{
 called++;assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
 assert.equal(url,'https://approved.example/account');
 assert.equal(options.headers['X-Test-Key'],'DUMMY_TEST_KEY');
 return {ok:true,headers:{get:()=> 'application/json'},json:async()=>({private_email:'not-for-logs'})};
}});
assert.equal(called,1);
assert.deepEqual(result,{status:'READ_ONLY_RESPONSE_RECEIVED',responseShape:'OBJECT',
 safeToPost:false,sourceRecordsNotPersisted:true});
assert(!JSON.stringify(result).includes('private_email'));
console.log('Propra probe CLI synthetic tests passed; no live network request');
