/** Iris owner-level management fee and owner statement REVIEW PREVIEW.
 * Not an invoice, owner distribution statement, Books entry, or payout.
 * Uses ONLY independently verified CLEARED receipts and signed effective agreement terms.
 */
import {prepareMultiOwnerReceipt} from './multiowner_allocation.mjs';
const SAFE=Object.freeze({invoiceAllowed:false,postingAllowed:false,payoutAllowed:false,publishAllowed:false,sendAllowed:false,trustTransferAllowed:false});
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const date=s=>typeof s==='string'&&/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const minorRound=(n,bps)=>Number((BigInt(n)*BigInt(bps)+5000n)/10000n);
const hold=issues=>({status:'HOLD',issues:[...new Set(issues)],...SAFE});
export function previewOwnerFeeStatements({receipt,ownership,agreements,approvedBankAccountId,accounting={}}={}){
 const allocation=prepareMultiOwnerReceipt({receipt,ownership,approvedBankAccountId});
 if(allocation.status!=='MULTI_OWNER_PREVIEW_READY')return hold(allocation.reasons||['UNVERIFIED_RECEIPT_OR_OWNERSHIP']);
 const issues=[];
 if(!accounting.reconciledCashEvidence||!accounting.booksReceiptReadback||!accounting.actualCollectedNotPreview||
    !accounting.ownershipLegalIdentityVerified||!accounting.taxRateApproved||
    !accounting.statementPeriodApproved)issues.push('ACCOUNTING_EVIDENCE_OR_APPROVAL_REQUIRED');
 if(!date(receipt?.clearedAt))issues.push('CLEARED_DATE_INVALID');
 if(!Array.isArray(agreements)||agreements.length!==ownership.length)issues.push('AGREEMENTS_REQUIRED_FOR_ALL_OWNERS');
 const byOwner=new Map();
 for(const a of agreements||[]){
   if(!a||!a.ownerId||byOwner.has(a.ownerId)){issues.push('DUPLICATE_OR_MISSING_AGREEMENT');continue}
   byOwner.set(a.ownerId,a);
 }
 const rows=[];
 for(const allocationRow of allocation.allocations){
   const a=byOwner.get(allocationRow.ownerId);
   if(!a||a.signed!==true||!a.agreementId||!a.version||!a.effectiveFrom||
      !date(a.effectiveFrom)||a.effectiveFrom>receipt.clearedAt||
      (a.effectiveTo!=null&&(!date(a.effectiveTo)||receipt.clearedAt>a.effectiveTo))||
      a.propertyId!==receipt.propertyId||a.ownershipSnapshotId!==allocationRow.ownershipSnapshotId){
      issues.push('SIGNED_EFFECTIVE_AGREEMENT_MISSING_'+allocationRow.ownerId);continue;
   }
   let bps;
   if(a.type==='FURNISHED_V4')bps=2000;
   else if(a.type==='UNFURNISHED_V4')bps=1000;
   else if(a.type==='PLACEMENT_V1')bps=0;
   else if(a.type==='LEGACY'&&a.signedOverrideApproved===true&&integer(a.managementRateBps))bps=a.managementRateBps;
   else{issues.push('UNVERIFIED_LEGACY_OR_UNKNOWN_AGREEMENT_'+allocationRow.ownerId);continue}
   if(a.approvedOverrideRateBps!=null){
     if(a.overrideEvidenceApproved!==true||!integer(a.approvedOverrideRateBps)||a.approvedOverrideRateBps>10000){
        issues.push('UNVERIFIED_FEE_OVERRIDE_'+allocationRow.ownerId);continue
     }
     bps=a.approvedOverrideRateBps;
   }
   if(bps>10000){issues.push('INVALID_MANAGEMENT_RATE_'+allocationRow.ownerId);continue}
   if(!integer(a.gstRateBps)||a.gstRateBps>10000||a.gstApproved!==true){
      issues.push('GST_RATE_NOT_APPROVED_'+allocationRow.ownerId);continue
   }
   if(a.nonresident!==true&&a.nonresident!==false){issues.push('RESIDENCY_UNVERIFIED_'+allocationRow.ownerId);continue}
   if(a.nonresident===true&&a.craWithholdingApproved!==true){
      issues.push('NONRESIDENT_WITHHOLDING_NOT_APPROVED_'+allocationRow.ownerId);continue
   }
   const fee=minorRound(allocationRow.amountCents,bps),gst=minorRound(fee,a.gstRateBps);
   const withholding=a.nonresident?minorRound(allocationRow.amountCents,2500):0;
   const after=allocationRow.amountCents-fee-gst-withholding;
   if(after<0){issues.push('NEGATIVE_INDICATIVE_OWNER_AMOUNT_'+allocationRow.ownerId);continue}
   rows.push({ownerId:allocationRow.ownerId,propertyId:receipt.propertyId,
     ownershipSnapshotId:allocationRow.ownershipSnapshotId,agreementId:a.agreementId,
     agreementVersion:a.version,agreementType:a.type,receiptKey:allocation.trust.eventKey,
     collectedReceiptShareCents:allocationRow.amountCents,
     managementRateBps:bps,managementFeeQuoteCents:fee,feeGstQuoteCents:gst,
     nonresidentWithholdingQuoteCents:withholding,
     indicativeAfterQuotedDeductionsCents:after,
     payoutAmountCents:null,ownerStatementStatus:'INTERNAL_DRAFT_ONLY',
     feePostingStatus:'UNPOSTED_QUOTE'});
 }
 if(rows.length!==allocation.allocations.length)issues.push('NOT_ALL_OWNER_AGREEMENTS_COVERED');
 if(issues.length)return hold(issues);
 const total=key=>rows.reduce((s,r)=>s+r[key],0);
 return {status:'INTERNAL_FEE_AND_STATEMENT_PREVIEW',receiptKey:allocation.trust.eventKey,
  clearedAt:receipt.clearedAt,
  payoutCyclePeriod:(()=>{let d=receipt.clearedAt.split('-').map(Number);let y=d[0],m=d[1];if(d[2]>10){m++;if(m>12){m=1;y++}}return String(y)+'-'+String(m).padStart(2,'0')})(),
  owners:rows,totals:{collectedReceiptCents:total('collectedReceiptShareCents'),
    managementFeeQuoteCents:total('managementFeeQuoteCents'),feeGstQuoteCents:total('feeGstQuoteCents'),
    nonresidentWithholdingQuoteCents:total('nonresidentWithholdingQuoteCents')},
  trustLiabilityAdjusted:false,booksFeeInvoiceCreated:false,statementApproved:false,
  ownerPayoutApproved:false,...SAFE};
}
