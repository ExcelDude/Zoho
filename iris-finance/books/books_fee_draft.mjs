/** Read-only Iris -> Zoho Books fee invoice payload preview. No network or post action. */
export function makeDraft({kind,agreement,ownerBooksCustomerId,sourceEventId,propertyId,leaseId=null,baseFeeCents,feeGstCents,reviewApproved=false}){
 const error=(reason)=>({status:"BLOCKED",reason,postingAllowed:false});
 const items={MANAGEMENT_FEE:"242438000000032035",PLACEMENT_FEE:"242438000000031090",ONBOARDING_FEE:"242438000000031090"};
 if(!Object.hasOwn(items,kind))return error("UNSUPPORTED_KIND");
 if(!agreement?.signed||!agreement?.agreement_id||!agreement?.version||!agreement?.effective_start)return error("VERIFIED_SIGNED_AGREEMENT_REQUIRED");
 if(agreement.type==="LEGACY"&&!agreement.verifiedFeeTerms)return error("LEGACY_TERMS_REQUIRED");
 if(kind==="MANAGEMENT_FEE"&&agreement.type==="PLACEMENT_V1")return error("PLACEMENT_ONLY_NO_MANAGEMENT_FEE");
 if(kind==="ONBOARDING_FEE"&&agreement.type!=="FURNISHED_V4")return error("ONBOARDING_NOT_AUTHORIZED");
 if(kind==="PLACEMENT_FEE"&&agreement.type==="FURNISHED_V4")return error("PLACEMENT_NOT_AUTHORIZED");
 if(!ownerBooksCustomerId||!sourceEventId||!propertyId)return error("VERIFIED_FINANCE_IDENTIFIERS_REQUIRED");
 if(!Number.isSafeInteger(baseFeeCents)||baseFeeCents<=0||!Number.isSafeInteger(feeGstCents)||feeGstCents<0)return error("INVALID_FEE_CENTS");
 if(Math.abs(feeGstCents-Math.round(baseFeeCents*.05))>0)return error("GST_MISMATCH_REVIEW");
 if(!reviewApproved)return error("REVIEW_APPROVAL_REQUIRED");
 const line={item_id:items[kind],name:kind,rate:baseFeeCents/100,quantity:1,tax_id:"242438000000031068"};
 return {status:"DRAFT_FOR_MANUAL_REVIEW",postingAllowed:false,
  books_org_id:"110003520057",customer_id:ownerBooksCustomerId,
  line_items:[line],expected_total_cents:baseFeeCents+feeGstCents,
  source_reference:{kind,sourceEventId,propertyId,leaseId,agreementId:agreement.agreement_id,agreementVersion:agreement.version},
  warning:"UNSENT MAPPING PREVIEW: Books tax calculation, item applicability, ownership and accountant approval must be verified in sandbox; no API posting action exists."};
}
