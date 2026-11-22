/** Iris Books fee / statement review integration — no network, posting or publishing.
 * Reuses existing Books mapping, readback and statement-approval prototypes.
 * Candidate fee quotes are NOT settled trust events and are never statements.
 */
import {previewOwnerFeeStatements} from './owner_fee_statement_bridge.mjs';
import {reviewCrosswalk} from '../identity/crosswalk.mjs';
import {makeDraft} from '../books/books_fee_draft.mjs';
import {validateInvoiceReadback} from '../books/invoice_readback.mjs';
import {buildPortalHandoffPreview} from '../statements/statement_approval.mjs';
const SAFE=Object.freeze({postingAllowed:false,booksWriteAllowed:false,sendAllowed:false,publishAllowed:false,trustTransferAllowed:false,ownerPayoutAllowed:false});
const MANAGE_ITEM='242438000000032035',GST_ID='242438000000031068',BOOKS_ORG='110003520057';
const fail=(issues,details={})=>({status:'HOLD',issues:[...new Set(issues)],...details,...SAFE});
/** All data in candidate is metadata for manual finance verification, never a Books API request. */
export function prepareFeeInvoiceReadiness({feePreview,ownerId,ownerMappings,owners,booksContacts,ownership,
  configuration,approvals}={}){
 const issues=[];
 if(feePreview?.status!=='INTERNAL_FEE_AND_STATEMENT_PREVIEW')issues.push('COLLECTED_RENT_FEE_PREVIEW_REQUIRED');
 const owner=feePreview?.owners?.find(x=>x.ownerId===ownerId);
 if(!owner||feePreview.owners.filter(x=>x.ownerId===ownerId).length!==1)issues.push('UNIQUE_OWNER_FEE_QUOTE_REQUIRED');
 let mapping=null;
 try{
  const c=reviewCrosswalk({owners:owners||[],booksContacts:booksContacts||[],
    ownership:ownership||[],rows:ownerMappings||[]});
  const matching=c.rows.filter(x=>x.iris_owner_id===ownerId);
  if(matching.length!==1||matching[0]?.status!=='APPROVED_IDENTITY_MAPPING')issues.push('OWNER_BOOKS_ID_CROSSWALK_UNVERIFIED');
  else mapping=matching[0];
 }catch{issues.push('INVALID_OWNER_BOOKS_CROSSWALK')}
 if(configuration?.organizationId!==BOOKS_ORG||configuration?.managementItemId!==MANAGE_ITEM||
  configuration?.gstTaxId!==GST_ID||configuration?.managementItemActive!==true||
  configuration?.gstTaxActive!==true||configuration?.verifiedBooksReadback!==true)
  issues.push('BOOKS_ITEM_TAX_OR_ORG_NOT_VERIFIED');
 for(const key of ['signedAgreementDocumentVerified','ownerIdentityIndependentlyReviewed',
 'receiptBankAndBooksReconciled','feeAmountReviewed','gstTreatmentReviewed','financeReviewerApproved']){
  if(approvals?.[key]!==true)issues.push('APPROVAL_'+key.toUpperCase()+'_REQUIRED');
 }
 if(!approvals?.reviewerEvidenceRef||!approvals?.sourceReceiptEvidenceRef)issues.push('APPROVAL_EVIDENCE_MISSING');
 if(owner&&(!Number.isSafeInteger(owner.managementFeeQuoteCents)||owner.managementFeeQuoteCents<0||
  !Number.isSafeInteger(owner.feeGstQuoteCents)||owner.feeGstQuoteCents<0))issues.push('INVALID_FEE_QUOTE');
 if(owner?.managementFeeQuoteCents===0)issues.push('NO_MONTHLY_MANAGEMENT_FEE_TO_INVOICE');
 if(issues.length)return fail(issues);
 const draft=makeDraft({kind:'MANAGEMENT_FEE',
  agreement:{signed:true,agreement_id:owner.agreementId,version:owner.agreementVersion,
    effective_start:feePreview.clearedAt,type:'LEGACY',verifiedFeeTerms:true},
  ownerBooksCustomerId:mapping.books_contact_id,sourceEventId:feePreview.receiptKey+'|'+owner.ownerId,
  propertyId:owner.propertyId,baseFeeCents:owner.managementFeeQuoteCents,
  feeGstCents:owner.feeGstQuoteCents,reviewApproved:true});
 if(draft.status!=='DRAFT_FOR_MANUAL_REVIEW')return fail(['BOOKS_INVOICE_PAYLOAD_BLOCKED_'+draft.reason]);
 return {status:'READY_FOR_MANUAL_BOOKS_DRAFT_REVIEW',ownerId,sourceFeeQuoteCents:owner.managementFeeQuoteCents,
   sourceGstQuoteCents:owner.feeGstQuoteCents,booksCustomerId:mapping.books_contact_id,
   expected:{organization_id:BOOKS_ORG,customer_id:mapping.books_contact_id,
    source_event_id:draft.source_reference.sourceEventId,item_id:MANAGE_ITEM,tax_id:GST_ID,
    base_cents:owner.managementFeeQuoteCents,gst_cents:owner.feeGstQuoteCents,
    validated_agreement_id:owner.agreementId,signed_terms_verified:true},
   manualDraftPreview:draft,readyForProductionInvoice:false,...SAFE};
}
export function reviewExistingBooksInvoice({readiness,booksReadback,independentReadbackVerified=false}={}){
 if(readiness?.status!=='READY_FOR_MANUAL_BOOKS_DRAFT_REVIEW'||independentReadbackVerified!==true)
  return fail(['INDEPENDENT_BOOKS_INVOICE_READBACK_REQUIRED']);
 const result=validateInvoiceReadback(readiness.expected,booksReadback);
 return {status:result.result==='PASS_READBACK_ONLY'?'BOOKS_READBACK_MATCHED_INTERNAL':'HOLD',
  issues:result.issues,booksInvoiceId:result.invoice_id||null,match:result.reconciled,
  feeCollectionAuthorized:false,...SAFE};
}
export function assessOwnerStatementHandoff({approvalRecord,verifiedOwnerBooksId=false,
  statementLinkedToActualSettledLedger=false,approvedBankAndGlReconciliation=false,
  actualStatementLedgerCompletenessVerified=false,ownerPortalMappingApproved=false,
  portalConnectorAvailable=false}={}){
 const issues=[];
 if(!verifiedOwnerBooksId)issues.push('OWNER_BOOKS_ID_REQUIRED');
 if(!statementLinkedToActualSettledLedger)issues.push('SETTLED_OWNER_LEDGER_REQUIRED');
 if(!approvedBankAndGlReconciliation)issues.push('APPROVED_THREE_WAY_RECONCILIATION_REQUIRED');
 if(!actualStatementLedgerCompletenessVerified)issues.push('STATEMENT_LEDGER_COMPLETENESS_REQUIRED');
 if(!approvalRecord||approvalRecord.state!=='BROKER_APPROVED_INTERNAL')issues.push('FINANCE_AND_BROKER_APPROVAL_REQUIRED');
 if(!approvalRecord?.reviewedBy||!approvalRecord?.brokerApprovedBy||
  approvalRecord.reviewedBy===approvalRecord.brokerApprovedBy||
  approvalRecord.preparedBy===approvalRecord.reviewedBy||
  approvalRecord.preparedBy===approvalRecord.brokerApprovedBy)
  issues.push('SEPARATE_APPROVER_IDENTITY_REQUIRED');
 let portal;
 try{if(approvalRecord)portal=buildPortalHandoffPreview({record:approvalRecord,portalOwnerMappingApproved:ownerPortalMappingApproved,connectorAvailable:portalConnectorAvailable});}
 catch{issues.push('STATEMENT_HASH_OR_VERSION_INVALID')}
 if(portal?.blocks?.length)issues.push(...portal.blocks);
 return {status:issues.length?'HOLD':'READY_FOR_SEPARATE_PORTAL_IMPLEMENTATION',issues:[...new Set(issues)],
  handoffReference:issues.length?null:portal.reference,actualStatementPublished:false,
  realFinancialApprovalsVerifiedByService:false,...SAFE};
}
