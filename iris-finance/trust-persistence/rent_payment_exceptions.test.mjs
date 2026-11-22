import assert from 'node:assert/strict';
import {assessRentReceipt,previewNsfReversal} from './rent_payment_exceptions.mjs';
const receipt={bankTransactionId:'bank-r1',leaseId:'L1',tenantId:'T1',propertyId:'P1',amountCents:50000};
const obligation={verified:true,balanceApproved:true,invoiceOrRentPlanRef:'January-invoice-readonly',period:'2027-01',
 snapshotRef:'snapshot-1',rentDueCents:100000,priorClearedCents:0,priorCreditsCents:0,
 leaseId:'L1',tenantId:'T1',propertyId:'P1',previousReceiptIdsVerified:true,
 previousReceiptIds:[],snapshotFinalized:true};
let count=0;
const eq=(a,b)=>{assert.deepEqual(a,b);count++};
const partial=assessRentReceipt({receipt,obligation});
eq(partial.status,'ALLOCATABLE_PREVIEW');eq(partial.category,'PARTIAL_PAYMENT');eq(partial.rentOutstandingAfterCents,50000);
eq(assessRentReceipt({receipt:{...receipt,amountCents:100000},obligation}).category,'EXACT_PAYMENT');
eq(assessRentReceipt({receipt:{...receipt,amountCents:100001},obligation}).category,'OVERPAYMENT');
eq(assessRentReceipt({receipt:{...receipt,amountCents:100001},obligation}).unappliedCents,1);
eq(assessRentReceipt({receipt,obligation:{...obligation,priorClearedCents:50000}}).category,'EXACT_PAYMENT');
eq(assessRentReceipt({receipt,obligation:{...obligation,priorClearedCents:90000}}).status,'HOLD');
eq(assessRentReceipt({receipt,obligation:{...obligation,verified:false}}).status,'HOLD');
eq(assessRentReceipt({receipt,obligation:{...obligation,balanceApproved:false}}).status,'HOLD');
eq(assessRentReceipt({receipt,obligation:{...obligation,previousReceiptIds:['bank-r1']}}).status,'HOLD');
eq(assessRentReceipt({receipt,obligation:{...obligation,previousReceiptIdsVerified:false}}).status,'HOLD');
eq(assessRentReceipt({receipt,obligation:{...obligation,snapshotFinalized:false}}).status,'HOLD');
eq(assessRentReceipt({receipt,obligation:{...obligation,priorCreditsCents:1}}).status,'HOLD');
eq(assessRentReceipt({receipt,obligation:{...obligation,propertyId:'other'}}).status,'HOLD');
eq(assessRentReceipt({receipt,obligation:{...obligation,priorClearedCents:100001}}).status,'HOLD');
eq(assessRentReceipt({receipt:{...receipt,amountCents:0},obligation}).status,'HOLD');
eq(assessRentReceipt({receipt,obligation:null}).status,'HOLD');
const original={eventKey:'event1',bankTransactionId:'bank-r1',amountCents:50000,persistedAndCleared:true};
const reversal={bankTransactionId:'bank-nsf-1',bankEvidenceId:'RBC-1',booksEvidenceId:'Books-1',reversesBankTransactionId:'bank-r1',amountCents:50000,status:'SETTLED'};
const controls={bankPoolApproved:true,independentBankReadback:true,booksReversalReadback:true,accountantApproval:true,previouslyReversed:false,reversalRefAlreadyUsed:false};
eq(previewNsfReversal({originalReceipt:original,reversal,controls}).status,'NSF_REVERSAL_REVIEW_CANDIDATE');
eq(previewNsfReversal({originalReceipt:original,reversal:{...reversal,amountCents:40000},controls}).status,'HOLD');
eq(previewNsfReversal({originalReceipt:original,reversal:{...reversal,reversesBankTransactionId:'different'},controls}).status,'HOLD');
eq(previewNsfReversal({originalReceipt:original,reversal:{...reversal,status:'PENDING'},controls}).status,'HOLD');
eq(previewNsfReversal({originalReceipt:original,reversal,controls:{...controls,accountantApproval:false}}).status,'HOLD');
eq(previewNsfReversal({originalReceipt:original,reversal,controls:{...controls,previouslyReversed:true}}).status,'HOLD');
eq(previewNsfReversal({originalReceipt:original,reversal,controls:{...controls,reversalRefAlreadyUsed:true}}).status,'HOLD');
eq(previewNsfReversal({originalReceipt:{...original,persistedAndCleared:false},reversal,controls}).status,'HOLD');
eq(partial.postingAllowed,false);
console.log('Rent payment exception assertions passed: '+count+'; no financial writes');
