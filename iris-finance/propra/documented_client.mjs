/** Documented Propra Public API v1 GET-only client.
 * OpenAPI source: user-provided Propra Public API Documentation v1.
 * Server credentials MUST be provided at runtime (never in frontend/GitHub).
 */
const BASE='https://propra.app/api/v1';
const LIST=new Set(['/owners','/properties','/units','/tenants','/residencies','/gl-accounts','/journals','/clearables','/suppliers','/operators','/requests','/applications','/campaigns']);
const EXACT=new Set(['/account','/ping/auth',...LIST]);
function credentials(key,secret){
 if(typeof key!=='string'||!key.startsWith('pn_')||typeof secret!=='string'||!secret.startsWith('pz_'))throw Error('PROPRA_CREDENTIALS_MISSING');
 return {'X-API-Key':key,'Authorization':secret,'Accept':'application/json'};
}
export class PropraDocumentedReadClient{
 constructor({key,secret,transport=fetch}={}){
  this.auth=()=>credentials(key,secret);
  if(typeof transport!=='function')throw Error('TRANSPORT_REQUIRED');
  this.transport=transport;
 }
 async get(path,{first,after}={}){
  if(!EXACT.has(path))throw Error('PROPRA_UNAPPROVED_PATH');
  if((first!==undefined||after!==undefined)&&!LIST.has(path))throw Error('PROPRA_PAGINATION_NOT_SUPPORTED');
  if(first!==undefined&&(!Number.isInteger(first)||first<1||first>20))throw Error('PROPRA_PAGE_LIMIT_EXCEEDED');
  if(after!==undefined&&(typeof after!=='string'||after.length<1||after.length>2048))throw Error('PROPRA_INVALID_CURSOR');
  const url=new URL(BASE+path);
  if(first!==undefined)url.searchParams.set('first',String(first));
  if(after!==undefined)url.searchParams.set('after',after);
  let response;
  try{response=await this.transport(url.toString(),{method:'GET',redirect:'error',credentials:'omit',headers:this.auth(),signal:AbortSignal.timeout(10000)});}
  catch{throw Error('PROPRA_CONNECTION_FAILED')}
  if(!response?.ok)throw Error(response?.status===401?'PROPRA_AUTHENTICATION_FAILED':response?.status===403?'PROPRA_READ_SCOPE_DENIED':'PROPRA_GET_FAILED');
  if(!(response.headers?.get?.('content-type')||'').toLowerCase().includes('json'))throw Error('PROPRA_RESPONSE_NOT_JSON');
  try{return await response.json()}catch{throw Error('PROPRA_JSON_INVALID')}
 }
 async listPage(path,{first=1,after}={}){
  if(!LIST.has(path))throw Error('PROPRA_UNAPPROVED_LIST_PATH');
  const data=await this.get(path,{first,after});
  if(!data||!Array.isArray(data.edges)||typeof data.pageInfo?.hasNextPage!=='boolean')throw Error('PROPRA_PAGINATION_CONTRACT_MISMATCH');
  if(data.pageInfo.hasNextPage&&(typeof data.pageInfo.endCursor!=='string'||!data.pageInfo.endCursor))throw Error('PROPRA_CURSOR_MISSING');
  return {count:data.edges.length,hasNextPage:data.pageInfo.hasNextPage,endCursor:data.pageInfo.endCursor||null,items:data.edges.map(x=>x.node)};
 }
}
export const PROPRA_DOCUMENTED_BASE=BASE;
