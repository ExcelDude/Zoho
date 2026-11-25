import {verifySignedPortalRequest,verifyCallbackBearer,parseBooksCallback} from './contract.mjs';
import {stagePortalEvent,reconcileBooksCallback} from './bridge.mjs';
const JSON_HEADERS={'content-type':'application/json','cache-control':'no-store'};
const reply=(statusCode,data)=>({statusCode,headers:JSON_HEADERS,body:JSON.stringify(data)});
function parse(raw){if(typeof raw!=='string'||Buffer.byteLength(raw)>16384)throw Error('BAD_REQUEST_SIZE');return JSON.parse(raw)}
/**
 * Framework-independent server handlers. Framework must pass raw body, never parsed/re-encoded
 * body. Wire only to server-side routes; secrets are environment variables, not browser state.
 */
export async function portalEventEndpoint({rawBody,headers,store,loadLease,loadMapping,loadControls,env,now}){
 try{
  const event=verifySignedPortalRequest({rawBody,timestamp:headers['x-iris-timestamp'],signature:headers['x-iris-signature'],secret:env.IRIS_EVENT_HMAC_SECRET,now});
  const [lease,mapping,controls]=await Promise.all([loadLease(event.lease_id),loadMapping(event),loadControls(event)]);
  const result=await stagePortalEvent({event,store,lease,mapping,controls});
  return reply(202,result);
 }catch(e){
  const auth=/SIGNATURE|STALE_PORTAL|PORTAL_SECRET/.test(e.message);
  return reply(auth?401:400,{error:auth?'UNAUTHORIZED':'VALIDATION_FAILED'});
 }
}
export async function booksCallbackEndpoint({rawBody,headers,store,booksReadInvoice,env}){
 try{
  verifyCallbackBearer({authorization:headers.authorization,secret:env.BOOKS_CALLBACK_BEARER_SECRET});
  const payload=parseBooksCallback(parse(rawBody));
  const result=await reconcileBooksCallback({payload,store,booksReadInvoice});
  return reply(result.status==='EVIDENCE_RECORDED'?200:202,result);
 }catch(e){return reply(/CALLBACK_UNAUTHORIZED|BOOKS_CALLBACK_SECRET/.test(e.message)?401:400,{error:'CALLBACK_REJECTED'});}
}
