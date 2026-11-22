/** Rent payment exception gate — preview only, never posts.
 * Rejects stale or unverified lease balances and treats overpayments/NSF as manual review.
 */
const SAFE=Object.freeze({postingAllowed:false,paymentAllowed:false,payoutAllowed:false,booksWriteAllowed:false,bankTransferAllowed:false});
const money=n=>Number.isSafeInteger(n)&&n>=0;
const id=v=>typeof v==='string'&&v.trim().length>0;
const hold=(reasons,category)=>({status:'HOLD',category,reasons:[...new Set(reasons)],...SAFE});
export function assessRentReceipt({receipt,obligation}={}){
 const issues=[];
 if(!receipt||!id(receipt.bankTransactionId)||!id(receipt.leaseId)||!id(receipt.tenantId)||!id(receipt.propertyId)||
    !money(receipt.amountCents)||receipt.amountCents===0)issues.push('RECEIPT_UNVERIFIED');
 if(!obligation||obligation.verified!==true||obligation.balanceApproved!==true||!id(obligation.invoiceOrRentPlanRef)||
    !id(obligation.period)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(obligation.period)||!id(obligation.snapshotRef)||
    !money(obligation.rentDueCents)||!money(obligation.priorClearedCents)||!money(obligation.priorCreditsCents))
    issues.push('VERIFIED_RENT_OBLIGATION_REQUIRED');
 if(obligation&&(obligation.leaseId!==receipt?.leaseId||obligation.tenantId!==receipt?.tenantId||
    obligation.propertyId!==receipt?.propertyId))issues.push('RENT_OBLIGATION_SOURCE_MISMATCH');
 if(obligation?.priorClearedCents!=null&&obligation?.rentDueCents!=null&&
    money(obligation.priorClearedCents)&&money(obligation.rentDueCents)&&obligation.priorClearedCents>obligation.rentDueCents)
    issues.push('EXISTING_OVERPAYMENT_NEEDS_REVIEW');
 if(obligation?.priorCreditsCents>0)issues.push('EXISTING_CREDITS_NEED_ALLOCATION_APPROVAL');
 if(obligation?.previousReceiptIdsVerified!==true||!Array.isArray(obligation?.previousReceiptIds))
    issues.push('RECEIPT_HISTORY_UNVERIFIED');
 if(obligation?.previousReceiptIds?.includes(receipt?.bankTransactionId))
    issues.push('ALREADY_APPLIED_RECEIPT');
 if(obligation?.snapshotFinalized!==true)issues.push('RENT_BALANCE_SNAPSHOT_NOT_FINAL');
 if(issues.length)return hold(issues,'EVIDENCE_GAP');
 const remaining=obligation.rentDueCents-obligation.priorClearedCents;
 if(receipt.amountCents>remaining)return {...hold(['OVERPAYMENT_OR_UNAPPLIED_FUNDS_REVIEW'],'OVERPAYMENT'),
   rentOutstandingCents:remaining,unappliedCents:receipt.amountCents-remaining};
 if(remaining===0)return hold(['RENT_ALREADY_SATISFIED'],'OVERPAYMENT');
 const after=remaining-receipt.amountCents;
 return {status:'ALLOCATABLE_PREVIEW',category:after>0?'PARTIAL_PAYMENT':'EXACT_PAYMENT',
   rentOutstandingBeforeCents:remaining,appliedPreviewCents:receipt.amountCents,
   rentOutstandingAfterCents:after,unappliedCents:0,...SAFE};
}
export function previewNsfReversal({originalReceipt,reversal,controls={}}={}){
 const issues=[];
 if(!originalReceipt?.eventKey||!originalReceipt?.bankTransactionId||!money(originalReceipt?.amountCents)||
   originalReceipt.amountCents===0||originalReceipt.persistedAndCleared!==true)issues.push('ORIGINAL_RECEIPT_UNVERIFIED');
 if(!reversal?.bankTransactionId||!reversal?.bankEvidenceId||!reversal?.booksEvidenceId||!reversal?.reversesBankTransactionId||
    !money(reversal?.amountCents)||reversal.amountCents===0||reversal.status!=='SETTLED')
    issues.push('NSF_EVIDENCE_MISSING');
 if(reversal?.reversesBankTransactionId!==originalReceipt?.bankTransactionId)issues.push('NSF_REFERENCE_MISMATCH');
 if(reversal?.amountCents!==originalReceipt?.amountCents)issues.push('PARTIAL_NSF_REQUIRES_ACCOUNTANT_REVIEW');
 if(controls.bankPoolApproved!==true||controls.independentBankReadback!==true||
    controls.booksReversalReadback!==true||controls.accountantApproval!==true)
    issues.push('NSF_APPROVAL_OR_RECONCILIATION_MISSING');
 if(controls.previouslyReversed===true||controls.reversalRefAlreadyUsed===true)
    issues.push('DUPLICATE_NSF_REVERSAL');
 if(issues.length)return hold(issues,'NSF');
 return {status:'NSF_REVERSAL_REVIEW_CANDIDATE',category:'NSF',
   originalEventKey:originalReceipt.eventKey,reversalBankTransactionId:reversal.bankTransactionId,
   reversalAmountCents:reversal.amountCents,requiresAppendOnlyRecord:true,
   requiresBooksAndBankReconciliation:true,...SAFE};
}
