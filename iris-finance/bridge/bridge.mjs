import {parsePortalEvent,requestKey,sha256,parseBooksCallback} from './contract.mjs';
export function makeInvoiceReference(event){return 'IRIS-TEST-'+event.lease_id+'-'+event.accounting_period}
export function validatePilotApprovals({mapping,controls}){
 const missing=[];
 // Connectivity pilot must use a designated synthetic customer/item; real rent billing has separate ownership and legal approval gates.
 for(const k of ['sourceSnapshotVerified','accountantApproved','testCustomerConfirmed','testItemConfirmed','syntheticTestOnlyApproved'])if(controls?.[k]!==true)missing.push(k);
 for(const k of ['books_customer_id','books_item_id','iris_lease_id','iris_property_id'])if(!mapping?.[k])missing.push(k);
 if(mapping?.books_customer_id&&!/^\d+$/.test(String(mapping.books_customer_id)))missing.push('invalidBooksCustomer');
 if(mapping?.books_item_id&&!/^\d+$/.test(String(mapping.books_item_id)))missing.push('invalidBooksItem');
 return missing;
}
export function prepareDraftInvoice({event,lease,mapping,controls}){
 const e=parsePortalEvent(event),holds=validatePilotApprovals({mapping,controls});
 if(e.type!=='TEST_INVOICE_REQUEST')holds.push('notExplicitPilotEvent');
 if(lease?.id!==e.lease_id||lease?.property_id!==e.property_id||mapping?.iris_lease_id!==e.lease_id||mapping?.iris_property_id!==e.property_id)holds.push('sourceIdentityMismatch');
 if(!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(String(lease?.rent_amount??''))||Number(lease.rent_amount)<=0)holds.push('invalidRent');
 if(lease?.status!=='active')holds.push('leaseNotActive');
 const reference=makeInvoiceReference(e);
 return {key:requestKey(e),reference,holds,postingAllowed:false,sendAllowed:false,
  draft:holds.length?null:{customer_id:mapping.books_customer_id,reference_number:reference,
   date:e.accounting_period+'-01',due_date:e.accounting_period+'-01',
   send:false,notes:'IRIS INTEGRATION TEST — $1 synthetic charge. NOT TENANT RENT OR OWNER FUNDS. DO NOT SEND OR PAY',
   custom_fields:[{customfield_id:'242438000000032024',value:e.lease_id},{customfield_id:'242438000000031046',value:e.property_id},{customfield_id:'242438000000032026',value:e.source_event_id}],
   line_items:[{item_id:mapping.books_item_id,quantity:1,rate:1,description:'$1 integration pilot ONLY — not tenant rent, management fee or trust receipt'}]}};
}
/**
 * No Books write here. Use durable reservation with UNIQUE event_key and payload digest
 * before a future operator-approved dispatcher. All unrecognized/changed duplicates HOLD.
 */
export async function stagePortalEvent({event,store,lease,mapping,controls}){
 const e=parsePortalEvent(event);
 const digest=sha256(JSON.stringify(e)),key=requestKey(e);
 const reservation=await store.reserve({key,digest,sourceEventId:e.source_event_id});
 if(reservation.digest!==digest)return {status:'CONFLICT_HOLD',key,financialWrites:0};
 const quote=prepareDraftInvoice({event:e,lease,mapping,controls});
 const status=reservation.existing?'DUPLICATE_NO_ACTION':quote.holds.length?'HOLD':'PREVIEW_READY';
 await store.recordPreview({key,status,holds:quote.holds,reference:quote.reference});
 return {status,key,holds:quote.holds,reference:quote.reference,preview:quote.draft,financialWrites:0,postingAllowed:false};
}
/** Verify callback against independent Books readback; never trust the webhook's status alone. */
export async function reconcileBooksCallback({payload,booksReadInvoice,store}){
 const cb=parseBooksCallback(payload);
 const existing=await store.findByReference(cb.external_reference);
 if(!existing)return {status:'UNKNOWN_REFERENCE_HOLD',financialWrites:0};
 const invoice=await booksReadInvoice(cb.books_invoice_id);
 if(!invoice||String(invoice.invoice_id)!==cb.books_invoice_id||
    invoice.reference_number!==cb.external_reference||
    invoice.customer_id!==existing.booksCustomerId){
  await store.flagException({reference:cb.external_reference,reason:'BOOKS_READBACK_MISMATCH'});
  return {status:'READBACK_MISMATCH_HOLD',financialWrites:0};
 }
 await store.attachBooksEvidence({reference:cb.external_reference,invoiceId:cb.books_invoice_id,event:cb.event});
 return {status:'EVIDENCE_RECORDED',reference:cb.external_reference,invoiceId:cb.books_invoice_id,financialWrites:0};
}
