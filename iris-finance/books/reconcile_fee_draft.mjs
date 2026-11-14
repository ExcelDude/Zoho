/** Source-invoice reconciliation gate: read-only and no trust/posting controls enabled. */
export function assessFeeInvoice({invoice,expected,matchingInvoices=[]}){
 const issues=[];
 if(!invoice||!expected)return {status:"HOLD",issues:["MISSING_SOURCE_OR_INVOICE"],allowFinancialPosting:false};
 const eq=(value,want,code)=>{if(value!==want)issues.push(code)};
 eq(invoice.invoice_id,expected.invoice_id,"INVOICE_ID_MISMATCH");
 eq(invoice.customer_id,expected.customer_id,"CUSTOMER_MISMATCH");
 eq(invoice.reference_number,expected.reference_number,"REFERENCE_MISMATCH");
 eq(invoice.status,"draft","NOT_DRAFT");
 if(!Array.isArray(invoice.line_items)||invoice.line_items.length!==1)issues.push("INVALID_LINE_COUNT");
 else {const l=invoice.line_items[0];eq(l.item_id,expected.item_id,"ITEM_MISMATCH");eq(l.tax_id,expected.tax_id,"TAX_ID_MISMATCH");if(Math.round(Number(l.rate)*100)!==expected.baseCents)issues.push("RATE_MISMATCH");if(Number(l.quantity)!==1)issues.push("QUANTITY_MISMATCH");}
 if(Math.round(Number(invoice.sub_total)*100)!==expected.baseCents)issues.push("SUBTOTAL_MISMATCH");
 if(Math.round(Number(invoice.tax_total)*100)!==expected.taxCents)issues.push("GST_MISMATCH");
 if(Math.round(Number(invoice.total)*100)!==expected.baseCents+expected.taxCents)issues.push("TOTAL_MISMATCH");
 if(!Array.isArray(matchingInvoices))issues.push("REFERENCE_LOOKUP_UNVERIFIED");
 else if(matchingInvoices.length!==1||matchingInvoices[0].invoice_id!==expected.invoice_id)issues.push("DUPLICATE_OR_MISSING_REFERENCE");
 return {status:issues.length?"HOLD":"VERIFIED_DRAFT_ONLY",issues,allowFinancialPosting:false,allowTrustTransfer:false,
  nextGates:["SIGNED_OWNER_AGREEMENT","AUTHORITATIVE_BOOKS_OWNER_ID","FINANCE_LEDGER_POSTING_REVIEW","TRUST_CUSTODY_AND_BANK_SIGNOFF"]};
}
