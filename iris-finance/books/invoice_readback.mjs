/** Iris Books invoice readback acceptance: isolated simulator, no network/API writes.
 * expected/actual cents are normalized integers; production adapter must convert from actual Books response
 * using currency-safe decimal parsing and independently verify raw response fields.
 */
export function validateInvoiceReadback(expected,actual){
 const issues=[];
 if(!expected||!actual)return {result:"HOLD",issues:["MISSING_EXPECTED_OR_READBACK"],reconciled:false,postingAllowed:false};
 const required=["organization_id","customer_id","source_event_id","item_id","tax_id"];
 for(const k of required) if(!expected[k])issues.push("EXPECTED_"+k.toUpperCase()+"_MISSING");
 if(actual.organization_id!==expected.organization_id)issues.push("ORG_MISMATCH");
 if(actual.customer_id!==expected.customer_id)issues.push("CUSTOMER_MISMATCH");
 if(actual.reference_number!==expected.source_event_id)issues.push("SOURCE_REFERENCE_MISMATCH");
 if(!actual.invoice_id||typeof actual.invoice_id!=="string")issues.push("BOOKS_INVOICE_ID_MISSING");
 if(!["draft","sent","overdue","paid","partially_paid"].includes(actual.status))issues.push("UNEXPECTED_INVOICE_STATUS");
 if(!Number.isSafeInteger(expected.base_cents)||expected.base_cents<=0)issues.push("INVALID_EXPECTED_FEE");
 if(!Number.isSafeInteger(expected.gst_cents)||expected.gst_cents<0)issues.push("INVALID_EXPECTED_GST");
 const lines=actual.line_items;
 if(!Array.isArray(lines)||lines.length!==1)issues.push("UNEXPECTED_LINE_COUNT");
 else{
  const line=lines[0];
  if(line.item_id!==expected.item_id)issues.push("ITEM_MISMATCH");
  if(line.tax_id!==expected.tax_id)issues.push("TAX_ID_MISMATCH");
  if(line.quantity!==1)issues.push("QUANTITY_MISMATCH");
  if(!Number.isSafeInteger(line.base_cents)||line.base_cents!==expected.base_cents)issues.push("BASE_AMOUNT_MISMATCH");
  if(!Number.isSafeInteger(line.tax_cents)||line.tax_cents!==expected.gst_cents)issues.push("GST_AMOUNT_MISMATCH");
 }
 const expectedTotal=expected.base_cents+expected.gst_cents;
 if(!Number.isSafeInteger(actual.total_cents)||actual.total_cents!==expectedTotal)issues.push("INVOICE_TOTAL_MISMATCH");
 if(!expected.validated_agreement_id||!expected.signed_terms_verified)issues.push("OWNER_AGREEMENT_UNVERIFIED");
 return {result:issues.length?"HOLD":"PASS_READBACK_ONLY",issues,reconciled:issues.length===0,postingAllowed:false,invoice_id:actual.invoice_id||null,
  note:"Readback comparison is not authorization to collect cash or transfer trust funds."};
}
