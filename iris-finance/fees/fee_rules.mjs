/** Iris signed agreement fee quotation POC; in-memory only, no Books writes. All values are CAD cents. */
export function money(c){return (Math.round(c)/100).toFixed(2)}
export function feeQuote({agreement, monthlyRentCents, collectedRentCents=0, newPlacement=false, onboarding=false, nonresident=false, receiptDate=null, feeGstPct=5}) {
  const fail=(code)=>({status:"HOLD",code,postingAllowed:false});
  if(!agreement?.signed||!agreement.version||!agreement.type) return fail("SIGNED_AGREEMENT_REQUIRED");
  if(agreement.type==="LEGACY"&&!agreement.verifiedFeeTerms) return fail("LEGACY_FEE_TERMS_REQUIRED");
  for(const c of [monthlyRentCents,collectedRentCents])if(!Number.isSafeInteger(c)||c<0)return fail("INVALID_CENTS");
  if(!Number.isFinite(feeGstPct)||feeGstPct<0||feeGstPct>100)return fail("INVALID_GST");
  const type=agreement.type;
  const known={FURNISHED_V4:20,UNFURNISHED_V4:10,PLACEMENT_V1:0};
  if(!(type in known)&&type!=="LEGACY")return fail("UNKNOWN_AGREEMENT_TYPE");
  // Never make property furnishing flag sufficient proof of an agreement.
  const pct=type==="LEGACY"?agreement.verifiedFeeTerms.managementPercent:
    agreement.specialApprovedRatePct??known[type];
  if(!Number.isFinite(pct)||pct<0||pct>100)return fail("INVALID_MANAGEMENT_RATE");
  const managementFeeCents=Math.round(collectedRentCents*pct/100);
  const mgmtGstCents=Math.round(managementFeeCents*feeGstPct/100);
  const placementFeeCents=(!newPlacement||type==="FURNISHED_V4")?0:
    type==="UNFURNISHED_V4"?Math.max(Math.round(monthlyRentCents/2),100000):
    type==="PLACEMENT_V1"?monthlyRentCents:
    agreement.verifiedFeeTerms?.placementFeeCents??0;
  const onboardingFeeCents=type==="FURNISHED_V4"&&onboarding?90000:0;
  const placementGstCents=Math.round(placementFeeCents*feeGstPct/100);
  const onboardingGstCents=Math.round(onboardingFeeCents*feeGstPct/100);
  const nrWithholdingCents=nonresident?Math.round(collectedRentCents*0.25):0;
  const nextPayoutPeriod=(date)=>{if(!date)return null;const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);if(!m)return null;let y=+m[1],mon=+m[2],day=+m[3];if(mon<1||mon>12||day<1||day>new Date(Date.UTC(y,mon,0)).getUTCDate())return null;if(day>10){mon++;if(mon===13){mon=1;y++}}return `${y}-${String(mon).padStart(2,"0")}`};
  const payoutPeriod=nextPayoutPeriod(receiptDate);
  return {status:"CALCULATED_FOR_REVIEW",postingAllowed:false,
    managementFeeCents,mgmtGstCents,placementFeeCents,placementGstCents,onboardingFeeCents,onboardingGstCents,
    nrWithholdingCents,receiptPayoutPeriod:payoutPeriod,
    // Not a payout amount: placement debt, reserves, cash availability, approvals and annual NR fee unmodeled.
    indicativeRentAfterMonthlyFeeAndWithholdingCents:collectedRentCents-managementFeeCents-mgmtGstCents-nrWithholdingCents,
    warnings:["NO_AUTHORIZED_OWNER_PAYOUT","SIGNED_TERMS_AND_CRA_ACCOUNTANT_REVIEW_REQUIRED","PLACEMENT_AND_ONBOARDING_FEES_SEPARATE_INVOICE_OR_AUTHORIZATION"]
  };
}
