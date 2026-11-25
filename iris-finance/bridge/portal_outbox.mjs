import {createHmac} from 'node:crypto';
import {ORG_ID,parsePortalEvent} from './contract.mjs';
/** Called by Iris SERVER after a staff-approved pilot action, not in browser or on every lease edit.
 * The source DB must supply an immutable UUID and monotonic version; no default/random fallback.
 */
export function preparePortalOutbox({lease,eventId,version,period,occurredAt,action,featureEnabled,actorRole}){
 if(featureEnabled!==true||actorRole!=='finance_admin')throw Error('IRIS_PILOT_TRIGGER_DISABLED');
 if(action!=='TEST_INVOICE_REQUEST')throw Error('PILOT_ACTION_DENIED');
 if(!lease||lease.status!=='active')throw Error('LEASE_NOT_ACTIVE');
 return parsePortalEvent({organization_id:ORG_ID,type:action,source_event_id:eventId,
  lease_id:lease.id,property_id:lease.property_id,accounting_period:period,
  source_version:version,occurred_at:occurredAt});
}
export function signOutboxDispatch({event,secret,timestamp}){
 if(typeof secret!=='string'||secret.length<32)throw Error('IRIS_OUTBOX_SECRET_MISSING');
 if(!/^\d{10}$/.test(String(timestamp)))throw Error('INVALID_DISPATCH_TIMESTAMP');
 const rawBody=JSON.stringify(parsePortalEvent(event));
 return {rawBody,headers:{'content-type':'application/json','x-iris-timestamp':String(timestamp),
  'x-iris-signature':createHmac('sha256',secret).update(timestamp+'.'+rawBody).digest('hex')}};
}
/** Poll persistent Iris outbox with row locks. Never issue POST inside a database trigger.
 * Post-submit timeouts are UNCERTAIN; no blind automatic retry.
 */
export async function dispatchPilotOutbox({claimOutbox,markAccepted,markUncertain,postSignedEvent,secret,timestamp}){
 const row=await claimOutbox();
 if(!row)return {status:'NO_EVENTS'};
 const signed=signOutboxDispatch({event:row.event,secret,timestamp});
 try{
  const response=await postSignedEvent(signed);
  if(response?.status===202){await markAccepted(row.id);return{status:'ACCEPTED',id:row.id};}
  await markUncertain(row.id,'NON_202_HTTP_RESPONSE');return{status:'UNCERTAIN',id:row.id};
 }catch{
  await markUncertain(row.id,'NETWORK_OR_TIMEOUT_UNKNOWN');return{status:'UNCERTAIN',id:row.id};
 }
}
