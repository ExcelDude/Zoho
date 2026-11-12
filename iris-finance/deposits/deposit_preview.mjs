/** Deposit custody and move-out deadline preview only; no legal determinations or funds movement. */
function addDays(iso,days){const d=new Date(`${iso}T00:00:00Z`);if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==iso)throw Error("Invalid ISO date");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
export function deadlinePreview({tenancyEndedAt=null,forwardingAddressReceivedAt=null,custodyType="MANAGED",depositCustodyEndedAt=null}={}){
 const result={status:"HOLD",refundDueAt:null,postingAllowed:false,needs:["TENANT_CONSENT_OR_RTB_ORDER_FOR_DEDUCTIONS","CONFIRM_ACTUAL_DEPOSIT_CUSTODY","BROKER_LEGAL_APPROVAL"]};
 if(custodyType==="PLACEMENT_ONLY")return {...result,needs:["HANDOFF_TO_OWNER_REQUIRED","OWNER_ASSUMES_DEPOSIT_CUSTODY_AFTER_HANDOFF"]};
 if(!tenancyEndedAt||!forwardingAddressReceivedAt)return {...result,needs:[...result.needs,"TENANCY_END_AND_WRITTEN_FORWARDING_ADDRESS_REQUIRED"]};
 const anchor=tenancyEndedAt>forwardingAddressReceivedAt?tenancyEndedAt:forwardingAddressReceivedAt;
 return {...result,refundDueAt:addDays(anchor,15),triggerDate:anchor,needs:result.needs,deadlineType:"CONTRACT_REVIEW_PREVIEW"};
}
export function depositInterestPreview({depositCents,custodyStart,custodyEnd,annualRatesPct={}}){
 const hold=(reason)=>({status:"HOLD",reason,postingAllowed:false});
 if(!Number.isSafeInteger(depositCents)||depositCents<0)return hold("INVALID_AMOUNT");
 if(!custodyStart||!custodyEnd)return hold("MISSING_ACTUAL_CUSTODY_DATES");
 const start=new Date(custodyStart+"T00:00:00Z"),end=new Date(custodyEnd+"T00:00:00Z");
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start.toISOString().slice(0,10)!==custodyStart||end.toISOString().slice(0,10)!==custodyEnd||end<start)return hold("INVALID_DATE_RANGE");
 const years=[];for(let y=start.getUTCFullYear();y<=end.getUTCFullYear();y++){if(!Number.isFinite(annualRatesPct[y]))return hold("MISSING_VERIFIED_RATE_"+y);years.push(y)}
 // Official RTB calculator parity is required before implementing nonzero annual-rate calculations.
 if(years.some(y=>annualRatesPct[y]!==0))return hold("NONZERO_INTEREST_NEEDS_RTB_CALCULATOR_PARITY");
 return {status:"ZERO_RATE_PREVIEW",interestCents:0,custodyStart,custodyEnd,rateYears:years,postingAllowed:false,notes:["Official rate schedule must be confirmed for the entire actual custody period.","No refund payment is authorized."]};
}
