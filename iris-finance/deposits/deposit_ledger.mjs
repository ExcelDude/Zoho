/** Tenant deposit subledger and refund PREVIEW, Canadian cents, no posting/network calls.
 * Interest calculation is an estimate pending RTB benchmark and accountant signoff.
 */
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const day=s=>Date.parse(s+'T00:00:00Z')/86400000;
const iso=d=>new Date(d*86400000).toISOString().slice(0,10);
const addDays=(s,n)=>iso(day(s)+n);
const rateAt=(rates,date)=>rates.find(r=>r.from<=date&&date<=r.to);
export function estimateDepositInterest({principalCents,heldFrom,throughDate,rates=[]}){
 const issues=[];
 if(!Number.isSafeInteger(principalCents)||principalCents<0)issues.push('INVALID_PRINCIPAL');
 if(!validDate(heldFrom)||!validDate(throughDate)||heldFrom>throughDate)issues.push('INVALID_HOLDING_DATES');
 if(!Array.isArray(rates)||!rates.length)issues.push('PRESCRIBED_RATE_SCHEDULE_REQUIRED');
 if(issues.length)return {status:'HOLD',issues,interestEstimateCents:null,postingAllowed:false};
 const ordered=[...rates].sort((a,b)=>a.from.localeCompare(b.from));
 for(let i=0;i<ordered.length;i++){
  const r=ordered[i];
  if(!validDate(r.from)||!validDate(r.to)||r.from>r.to||!Number.isFinite(r.annualPercent)||r.annualPercent<0||r.annualPercent>100||r.approved!==true)issues.push('INVALID_OR_UNAPPROVED_RATE');
  if(i&&ordered[i-1].to>=r.from)issues.push('OVERLAPPING_RATE_SCHEDULE');
 }
 if(issues.length)return {status:'HOLD',issues,interestEstimateCents:null,postingAllowed:false};
 // Daily simple accrual is only an estimate; statutory calculator comparison remains mandatory.
 let total=0;
 for(let d=day(heldFrom);d<=day(throughDate);d++){
  const dt=iso(d),r=rateAt(ordered,dt);
  if(!r){issues.push('RATE_GAP_'+dt);break}
  const year=Number(dt.slice(0,4)),daysInYear=(year%4===0&&(year%100!==0||year%400===0))?366:365;
  total+=principalCents*(r.annualPercent/100)/daysInYear;
 }
 return {status:issues.length?'HOLD':'ESTIMATE_FOR_REVIEW',issues,interestEstimateCents:issues.length?null:Math.round(total),throughDate,postingAllowed:false,rtbVerified:false};
}
const TYPES=new Set(['SECURITY_RECEIPT','PET_RECEIPT','SECURITY_REFUND','PET_REFUND','AUTHORIZED_DEDUCTION','OWNER_HANDOFF']);
const decrease=new Set(['SECURITY_REFUND','PET_REFUND','AUTHORIZED_DEDUCTION','OWNER_HANDOFF']);
export function buildTenantDepositLedger({tenantId,leaseId,propertyId,openingSecurityCents,openingPetCents,events=[],controls={}}){
 const issues=[],excluded=[],seen=new Set(),entries=[];
 if(!tenantId||!leaseId||!propertyId)issues.push('MISSING_TENANCY_REFERENCE');
 for(const [k,v] of [['SECURITY',openingSecurityCents],['PET',openingPetCents]])if(!Number.isSafeInteger(v)||v<0)issues.push('INVALID_'+k+'_OPENING');
 for(const k of ['openingBalanceApproved','depositTrustMapped','booksBankReconciled','tenantIdentityVerified'])if(controls[k]!==true)issues.push('CONTROL_'+k.toUpperCase()+'_REQUIRED');
 let security=Number.isSafeInteger(openingSecurityCents)?openingSecurityCents:0,pet=Number.isSafeInteger(openingPetCents)?openingPetCents:0;
 for(const e of events){
  if(!e?.eventId||seen.has(e.eventId)){issues.push('DUPLICATE_OR_MISSING_EVENT_ID');continue}seen.add(e.eventId);
  if(e.tenantId!==tenantId||e.leaseId!==leaseId||e.propertyId!==propertyId){issues.push('CROSS_TENANCY_EVENT');continue}
  if(!TYPES.has(e.type)){issues.push('UNKNOWN_EVENT_TYPE');continue}
  if(!validDate(e.eventDate)||!Number.isSafeInteger(e.amountCents)||e.amountCents<=0){issues.push('INVALID_EVENT_VALUE');continue}
  if(e.status!=='SETTLED'||!e.booksEvidenceId||!e.bankEvidenceId){excluded.push({eventId:e.eventId,reason:'UNSETTLED_OR_EVIDENCE_MISSING'});continue}
  const isPet=e.depositType==='PET',isSecurity=e.depositType==='SECURITY';
  if(!isPet&&!isSecurity){issues.push('DEPOSIT_TYPE_REQUIRED');continue}
  if(e.type==='SECURITY_RECEIPT'&&!isSecurity||e.type==='PET_RECEIPT'&&!isPet||e.type==='SECURITY_REFUND'&&!isSecurity||e.type==='PET_REFUND'&&!isPet){issues.push('EVENT_DEPOSIT_TYPE_MISMATCH');continue}
  if(e.type==='AUTHORIZED_DEDUCTION'&&e.deductionAuthorized!==true){issues.push('DEDUCTION_AUTHORIZATION_REQUIRED');continue}
  if(e.type==='OWNER_HANDOFF'&&(controls.placementOnlyApproved!==true||e.handoffApproved!==true)){issues.push('PLACEMENT_HANDOFF_NOT_AUTHORIZED');continue}
  const amount=decrease.has(e.type)?-e.amountCents:e.amountCents;
  if(isPet)pet+=amount;else security+=amount;
  entries.push({eventId:e.eventId,type:e.type,eventDate:e.eventDate,depositType:e.depositType,signedAmountCents:amount,booksEvidenceId:e.booksEvidenceId});
  if(security<0||pet<0)issues.push('NEGATIVE_DEPOSIT_SUBLEDGER');
 }
 entries.sort((a,b)=>a.eventDate.localeCompare(b.eventDate)||a.eventId.localeCompare(b.eventId));
 return {tenantId,leaseId,propertyId,securityCents:security,petCents:pet,totalPrincipalCents:security+pet,entries,excluded,
  status:issues.length?'HOLD':'INTERNAL_PREVIEW',issues:[...new Set(issues)],interestIncluded:false,releaseAllowed:false,postingAllowed:false};
}
export function prepareDepositRefund({ledger,tenancyEndDate,forwardingAddressReceivedDate,refundDate,interestEstimate,
 deductions=[],controls={}}){
 const issues=[...(ledger?.issues||[])];
 if(!ledger||ledger.status!=='INTERNAL_PREVIEW')issues.push('LEDGER_NOT_VERIFIED');
 if(!validDate(tenancyEndDate)||!validDate(forwardingAddressReceivedDate))issues.push('TENANCY_OR_FORWARDING_DATE_REQUIRED');
 const deadline=issues.includes('TENANCY_OR_FORWARDING_DATE_REQUIRED')?null:addDays(tenancyEndDate>forwardingAddressReceivedDate?tenancyEndDate:forwardingAddressReceivedDate,15);
 if(!validDate(refundDate))issues.push('REFUND_DATE_REQUIRED');
 if(deadline&&validDate(refundDate)&&refundDate>deadline)issues.push('REFUND_DEADLINE_EXCEEDED');
 for(const k of ['signedMoveOutReview','financeReviewerApproval','bankAndBooksDepositReconciled','depositInterestBenchmarkApproved'])if(controls[k]!==true)issues.push('CONTROL_'+k.toUpperCase()+'_REQUIRED');
 if(interestEstimate?.status!=='ESTIMATE_FOR_REVIEW'||!Number.isSafeInteger(interestEstimate?.interestEstimateCents)||!controls.interestAmountConfirmedAgainstRTB)issues.push('INTEREST_AMOUNT_UNVERIFIED');
 if(validDate(refundDate)&&(!validDate(interestEstimate?.throughDate)||interestEstimate.throughDate<refundDate))issues.push('INTEREST_NOT_CALCULATED_THROUGH_REFUND_DATE');
 if(!Array.isArray(deductions))issues.push('INVALID_DEDUCTIONS');
 let totalDeductions=0;
 for(const d of deductions||[]){
  if(!Number.isSafeInteger(d.amountCents)||d.amountCents<=0||!d.reason||!d.invoiceOrEvidenceId){issues.push('INVALID_DEDUCTION_EVIDENCE');continue}
  if(!(d.tenantWrittenAgreement===true||d.rtbOrderVerified===true)){issues.push('DEDUCTION_CONSENT_OR_ORDER_REQUIRED');continue}
  totalDeductions+=d.amountCents;
 }
 const principal=ledger?.totalPrincipalCents;
 if(!Number.isSafeInteger(principal)||principal<0)issues.push('INVALID_LEDGER_PRINCIPAL');
 if(Number.isSafeInteger(principal)&&totalDeductions>principal)issues.push('DEDUCTIONS_EXCEED_DEPOSIT_PRINCIPAL');
 const remaining=Number.isSafeInteger(principal)?Math.max(0,principal-totalDeductions):null;
 return {tenantId:ledger?.tenantId,leaseId:ledger?.leaseId,deadline,principalCents:principal,deductionsCents:totalDeductions,
  interestEstimateCents:interestEstimate?.interestEstimateCents??null,refundPreviewCents:remaining===null||!Number.isSafeInteger(interestEstimate?.interestEstimateCents)?null:remaining+interestEstimate.interestEstimateCents,
  interestFundingOwnerExpenseRequiresReview:true,status:issues.length?'HOLD':'INTERNAL_REFUND_CANDIDATE_ONLY',issues:[...new Set(issues)],postingAllowed:false,refundAllowed:false};
}
