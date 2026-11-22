/** Bridge from validated finance receipt to approved multi-owner allocation preview.
 * No rent-charge-as-receipt, no auto-deduced owners, and no financial posting.
 */
import {validateEvent,decideEvent} from '../integration/engine.mjs';
const SAFE=Object.freeze({postingAllowed:false,booksWriteAllowed:false,paymentAllowed:false,bankTransferAllowed:false});
export async function persistMultiOwnerFinanceReceipt({source,controls={},receipt,ownership,approvedBankAccountId,obligation,store}={}){
 if(!store?.ingest)throw Error('ATOMIC_ALLOCATION_STORE_REQUIRED');
 let e;try{e=validateEvent(source)}catch{return {status:'HOLD',reasons:['INVALID_FINANCE_SOURCE'],...SAFE}}
 if(e.type!=='RENT_PAYMENT_SETTLED')return {status:'SOURCE_PREVIEW_ONLY',reason:'NOT_RENT_PAYMENT_SETTLED',...SAFE};
 const decision=decideEvent({event:e,controls});
 const reasons=[...decision.blocking];
 if(!receipt||receipt.leaseId!==e.sourceId||receipt.tenantId!==e.payload?.tenantId||receipt.propertyId!==e.payload?.propertyId)
   reasons.push('RECEIPT_SOURCE_REFERENCE_MISMATCH');
 if(!Array.isArray(ownership)||ownership.length===0)reasons.push('OWNER_SNAPSHOT_REQUIRED');
 if(receipt?.booksBankAccountId!==approvedBankAccountId)reasons.push('BANK_ACCOUNT_NOT_APPROVED');
 if(reasons.length)return {status:'HOLD',reasons:[...new Set(reasons)],...SAFE};
 const res=await store.ingest({receipt,ownership,approvedBankAccountId,obligation});
 return {status:res.status,eventKey:res.eventKey||null,duplicate:res.duplicate||false,
   allocationCount:res.allocationCount||0,reasons:res.reasons||[],...SAFE};
}
