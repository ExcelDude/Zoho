/** Stage only human-reviewed synthetic intents in in-memory monitor; no Books API and no finance-post event. */
export function queueStagingIntent({preview,monitor,orgId,payloadSha256,approvedStaging=false}){
 if(!preview||!monitor||!orgId)return{queued:false,reason:"MISSING_INPUTS"};
 if(!approvedStaging)return{queued:false,reason:"STAGING_APPROVAL_REQUIRED"};
 if(preview.decision!=="READY_FOR_APPROVED_STAGING"||preview.postingAllowed!==false||!preview.agreement_id)return{queued:false,reason:"PREFLIGHT_NOT_CLEARED"};
 if(!/^[a-fA-F0-9]{64}$/.test(payloadSha256||""))return{queued:false,reason:"CANONICAL_PAYLOAD_HASH_REQUIRED"};
 const event={
  org_id:orgId,
  event_kind:"RENT_CHARGE_REVIEW_ONLY",
  source_system:"iris-pms",
  source_event_id:preview.charge_intent_key+"|"+preview.agreement_id,
  accounting_period:preview.charge_intent_key.slice(0,7),
  payload_sha256:payloadSha256,
  amount_cents:preview.amount_cents
 };
 return {queued:true,monitorResult:monitor.enqueue(event),writeEnabled:false,eventIdentity:event.source_event_id};
}
