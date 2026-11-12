import {evaluate} from "../rent-preflight/preflight.mjs";
import {feeQuote} from "../fees/fee_rules.mjs";
/** No-post finance orchestration. Integration with the event monitor is only through proposed intent keys: no enqueue and no Books calls. */
export function buildFinancePreview({snapshot,agreements=[],identityLinks=[],period="2027-01",monitor=null,approvedAccounting=false}){
 const leased=evaluate(snapshot,period);
 const agreementsByProperty=new Map();
 for(const a of agreements){let l=agreementsByProperty.get(a.property_id)||[];l.push(a);agreementsByProperty.set(a.property_id,l)}
 const links=new Set(identityLinks.filter(x=>x.verified===true).map(x=>x.tenant_id+"|"+x.books_contact_id));
 let out=[];
 for(const item of leased.filter(x=>!x.reasons.includes("LEASE_NOT_ACTIVE"))){
  const codes=[...item.reasons],eligible=agreementsByProperty.get(item.property_id)||[];
  const active=eligible.filter(a=>a.signed&&a.effective_start<=period+"-01"&&(!a.effective_end||a.effective_end>=period+"-01"));
  if(active.length!==1)codes.push(active.length===0?"NO_SIGNED_EFFECTIVE_AGREEMENT":"AMBIGUOUS_AGREEMENT");
  let ag=active[0];
  if(ag?.type==="PLACEMENT_V1") codes.push("PLACEMENT_ONLY_NO_MONTHLY_RENT_BILLING");
  if(ag?.type==="LEGACY"&&!ag.verifiedFeeTerms)codes.push("LEGACY_FEE_TERMS_UNVERIFIED");
  if(!identityLinks.some(x=>x.tenant_id===item.tenant_id&&x.books_contact_id&&x.verified===true))codes.push("TENANT_BOOKS_LINK_UNVERIFIED");
  if(ag&&!ag.owner_entitlement_verified)codes.push("OWNER_ENTITLEMENT_UNVERIFIED");
  if(!approvedAccounting)codes.push("RENT_ACCOUNTING_NOT_APPROVED");
  // There is no trusted signed tenant rent due-day exception data in current Iris API.
  if(ag&&!ag.rent_terms_verified)codes.push("SIGNED_LEASE_BILLING_TERMS_NOT_VERIFIED");
  const q=ag?feeQuote({agreement:ag,monthlyRentCents:Math.round(item.rent_amount_cad*100),collectedRentCents:0}):null;
  if(q&&q.status==="HOLD")codes.push(q.code);
  const key=period+"|"+item.lease_id+"|RENT_CHARGE";
  const decision=codes.length===0?"READY_FOR_APPROVED_STAGING":"BLOCKED";
  // The no-posting POC never authorizes an actual invoice, including staging.
  out.push({lease_id:item.lease_id,property_id:item.property_id,agreement_id:ag?.agreement_id??null,
    charge_intent_key:key,amount_cents:Math.round(item.rent_amount_cad*100),
    decision,blocks:[...new Set(codes)],owner_fee_quote_status:q?.status??"NO_AGREEMENT",postingAllowed:false,
    monitorStatus:"NOT_QUEUED",source:"READ_ONLY_PREVIEW"});
 }
 return out;
}
