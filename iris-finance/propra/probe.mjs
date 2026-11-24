/**
 * Run ONLY after the Propra documentation confirms API base URL, a harmless GET path,
 * and authentication HEADER names. Credentials come from local environment or
 * an approved server-side secret manager, never CLI arguments/source files.
 *
 * Example (header names placeholders, not discovered Propra documentation):
 *   PROPRA_API_BASE_URL=... PROPRA_API_HOST=... PROPRA_GET_PATH=... \
 *   PROPRA_API_KEY_HEADER=... PROPRA_API_SECRET_HEADER=... \
 *   PROPRA_API_KEY=... PROPRA_API_SECRET=... node probe.mjs
 *
 * Prints no response body, ID, key, secret, URL, request headers, or PII.
 */
import {PropraReadOnlyClient} from './propra_readonly_client.mjs';
export function probeConfig(env){
 const names=['PROPRA_API_BASE_URL','PROPRA_API_HOST','PROPRA_GET_PATH',
  'PROPRA_API_KEY_HEADER','PROPRA_API_SECRET_HEADER','PROPRA_API_KEY','PROPRA_API_SECRET'];
 if(names.some(n=>!env[n]))throw Error('DOCUMENTED_ENDPOINT_AND_RUNTIME_SECRETS_REQUIRED');
 const headerValid=n=>/^x-[a-z0-9-]{1,80}$/i.test(n)&&!/^(x-forwarded-|x-internal-|x-debug-)/i.test(n);
 if(!headerValid(env.PROPRA_API_KEY_HEADER)||!headerValid(env.PROPRA_API_SECRET_HEADER)||
  env.PROPRA_API_KEY_HEADER.toLowerCase()===env.PROPRA_API_SECRET_HEADER.toLowerCase())
  throw Error('UNVERIFIED_PROPRA_AUTH_HEADER_FORMAT');
 const approvedHost=env.PROPRA_API_HOST;
 const client=new PropraReadOnlyClient({
  baseUrl:env.PROPRA_API_BASE_URL,approvedHost,paths:[env.PROPRA_GET_PATH],
  authHeaders:()=>({
   [env.PROPRA_API_KEY_HEADER]:env.PROPRA_API_KEY,
   [env.PROPRA_API_SECRET_HEADER]:env.PROPRA_API_SECRET
  })
 });
 return {client,path:env.PROPRA_GET_PATH};
}
export async function runProbe(env,{transport}={}){
 const {client:_,path}=probeConfig(env);
 const client=transport?new PropraReadOnlyClient({
   baseUrl:env.PROPRA_API_BASE_URL,approvedHost:env.PROPRA_API_HOST,
   paths:[path],authHeaders:()=>({
     [env.PROPRA_API_KEY_HEADER]:env.PROPRA_API_KEY,
     [env.PROPRA_API_SECRET_HEADER]:env.PROPRA_API_SECRET
   }),transport
 }):_;
 const result=await client.get(path,{signal:AbortSignal.timeout(10000)});
 // Only structure, not content. Field names can contain user-provided labels,
 // so even field names are deliberately withheld.
 const responseShape=Array.isArray(result)?'ARRAY':result===null?'NULL':typeof result==='object'?'OBJECT':'SCALAR';
 return {status:'READ_ONLY_RESPONSE_RECEIVED',responseShape,
  safeToPost:false,sourceRecordsNotPersisted:true};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 try{
  const response=await runProbe(process.env);
  process.stdout.write(JSON.stringify(response)+'\n');
 }catch{
  process.stderr.write('Propra probe did not complete. Verify documented endpoint, auth format and runtime configuration; details suppressed.\n');
  process.exitCode=1;
 }
}
