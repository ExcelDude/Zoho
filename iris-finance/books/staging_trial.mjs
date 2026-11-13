/** Guarded isolated Zoho Books staging draft experiment. No embedded credentials or network client.
 * Requires explicitly supplied trusted adapter for a SEPARATE Books test org.
 * Never call with actual Iris production org 110003520057.
 * Do not run without a test customer and test org approved in writing.
 */
export async function executeStagingTrial({config,expected,adapter}) {
 const deny=reason=>({state:"NOT_EXECUTED",reason,created:false,readbackVerified:false});
 if(!config||config.mode!=="ISOLATED_TEST"||config.allowWrite!==true)return deny("EXPLICIT_STAGING_WRITE_AUTHORIZATION_REQUIRED");
 if(!config.orgId||config.orgId==="110003520057"||!config.testOrgConfirmed)return deny("NOT_VERIFIED_SEPARATE_TEST_ORG");
 if(!config.testCustomerId||!config.testCustomerConfirmed||config.testCustomerId!==expected?.customer_id)return deny("NOT_VERIFIED_TEST_CUSTOMER");
 if(!expected?.source_event_id?.startsWith("IRIS-STAGE-")||!expected?.validated_agreement_id?.startsWith("TEST-AG-"))return deny("NONTEST_EVENT_OR_AGREEMENT");
 if(expected.organization_id!==config.orgId)return deny("ORG_MISMATCH");
 if(expected.tax_id!=="242438000000031068"||expected.item_id!=="242438000000032035")return deny("UNVERIFIED_ITEM_OR_TAX");
 if(!Number.isSafeInteger(expected.base_cents)||expected.base_cents<=0||expected.gst_cents!==Math.round(expected.base_cents*0.05))return deny("INVALID_AMOUNTS");
 if(!adapter?.findByReference||!adapter?.createDraft||!adapter?.getById)return deny("ADAPTER_INCOMPLETE");
 const existing=await adapter.findByReference(config.orgId,expected.source_event_id);
 if(!Array.isArray(existing))return deny("REFERENCE_LOOKUP_NOT_AUTHORITATIVE");
 if(existing.length!==0)return {state:"HOLD_EXISTING_REFERENCE",created:false,readbackVerified:false,existingCount:existing.length};
 const payload={customer_id:config.testCustomerId,reference_number:expected.source_event_id,
   line_items:[{item_id:expected.item_id,rate:expected.base_cents/100,quantity:1,tax_id:expected.tax_id}],
   notes:"ISOLATED TEST: internal fee invoice validation. Do not send or collect.",is_inclusive_tax:false};
 let created;
 try{created=await adapter.createDraft(config.orgId,payload)}
 catch(e){return {state:"UNCERTAIN_AFTER_WRITE_ATTEMPT",created:"UNKNOWN",readbackVerified:false,reason:"DO_NOT_RETRY_WITHOUT_BOOKS_LOOKUP"}}
 if(!created?.invoice_id)return {state:"UNCERTAIN_AFTER_WRITE_ATTEMPT",created:"UNKNOWN",readbackVerified:false,reason:"NO_INVOICE_ID_RETURNED"};
 let fetched;
 try{fetched=await adapter.getById(config.orgId,created.invoice_id)}
 catch(e){return {state:"CREATED_READBACK_FAILED",created:true,readbackVerified:false,invoice_id:created.invoice_id}}
 const issues=[];
 if(fetched?.invoice_id!==created.invoice_id)issues.push("ID_MISMATCH");
 if(fetched?.customer_id!==config.testCustomerId)issues.push("CUSTOMER_MISMATCH");
 if(fetched?.reference_number!==expected.source_event_id)issues.push("REFERENCE_MISMATCH");
 if(fetched?.status!=="draft")issues.push("NOT_DRAFT");
 if(fetched?.line_items?.length!==1)issues.push("LINE_COUNT");
 else if(fetched.line_items[0].item_id!==expected.item_id||fetched.line_items[0].tax_id!==expected.tax_id)issues.push("ITEM_OR_TAX");
 if(fetched?.total_cents!==expected.base_cents+expected.gst_cents)issues.push("TOTAL_MISMATCH");
 if(issues.length)return{state:"CREATED_BUT_RECONCILIATION_HOLD",invoice_id:created.invoice_id,created:true,readbackVerified:false,issues};
 return{state:"STAGING_DRAFT_VERIFIED",created:true,readbackVerified:true,invoice_id:created.invoice_id,postedToProduction:false};
}
