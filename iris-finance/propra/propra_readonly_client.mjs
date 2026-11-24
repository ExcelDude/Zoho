/** Iris Propra read-only integration transport (unconfigured until official API host/auth verified).
 * No secrets in source, no guessed API routes, no write methods, no browser usage.
 */
export class PropraReadOnlyClient {
 constructor({baseUrl,approvedHost,paths,authHeaders,transport=fetch}={}){
  const url=new URL(baseUrl||'https://invalid.invalid/');
  if(url.protocol!=='https:'||!approvedHost||url.hostname!==approvedHost||
     url.username||url.password||url.search||url.hash||url.pathname!=='/'||
     !Array.isArray(paths)||paths.length<1||!paths.every(p=>typeof p==='string'&&/^\/[a-zA-Z0-9/_-]+$/.test(p))||
     new Set(paths).size!==paths.length||typeof authHeaders!=='function'||
     typeof transport!=='function')throw Error('PROPRA_APPROVED_CONFIGURATION_REQUIRED');
  this.origin=url.origin;this.paths=new Set(paths);this.headers=authHeaders;this.transport=transport;
 }
 async get(path,{signal}={}){
  if(!this.paths.has(path))throw Error('UNAPPROVED_PROPRA_ENDPOINT');
  // Keys and secrets are returned by the server-side secret manager at request time.
  let response;
  try{
   const headers=this.headers();
   if(!headers||typeof headers!=='object'||Object.keys(headers).length<1)throw Error('AUTH_MISSING');
   response=await this.transport(this.origin+path,{
    method:'GET',headers:{...headers,Accept:'application/json'},
    redirect:'error',credentials:'omit',signal
   });
  }catch{throw Error('PROPRA_READ_ONLY_REQUEST_FAILED')}
  if(!response?.ok)throw Error('PROPRA_READ_ONLY_REQUEST_REJECTED');
  const type=response.headers?.get?.('content-type')||'';
  if(!type.toLowerCase().includes('application/json'))throw Error('PROPRA_UNEXPECTED_RESPONSE_TYPE');
  let value;
  try{value=await response.json()}catch{throw Error('PROPRA_INVALID_JSON')}
  return value;
 }
}
