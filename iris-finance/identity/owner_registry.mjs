/** Iris/Zoho Books owner identity crosswalk: pure READ-ONLY, never auto-approve. */
const norm=s=>typeof s==='string'?s.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' '):'';
const email=s=>norm(s);
const index=(items,keyFn)=>{const m=new Map();for(const x of items){const k=keyFn(x);if(k)m.set(k,[...(m.get(k)||[]),x])}return m};
export function proposeOwnerCrosswalk({irisOwners,booksContacts,approvedLinks=[]}){
 if(!Array.isArray(irisOwners)||!Array.isArray(booksContacts)||!Array.isArray(approvedLinks))throw Error('INVALID_SOURCE');
 const ownerIds=new Set(),booksIds=new Set(),linkIds=new Set();
 for(const o of irisOwners){if(!o?.id||ownerIds.has(o.id))throw Error('DUPLICATE_OR_MISSING_IRIS_OWNER_ID');ownerIds.add(o.id)}
 for(const b of booksContacts){if(!b?.contact_id||booksIds.has(b.contact_id))throw Error('DUPLICATE_OR_MISSING_BOOKS_CONTACT_ID');booksIds.add(b.contact_id)}
 for(const l of approvedLinks){if(!ownerIds.has(l.irisOwnerId)||!booksIds.has(l.booksContactId)||linkIds.has(l.irisOwnerId))throw Error('INVALID_APPROVED_LINK');linkIds.add(l.irisOwnerId)}
 const emailIndex=index(booksContacts,b=>email(b.email)),nameIndex=index(booksContacts,b=>norm(b.contact_name)),approved=new Map(approvedLinks.map(l=>[l.irisOwnerId,l]));
 const results=[];
 for(const owner of irisOwners){
  const em=email(owner.email),nm=norm(owner.name),byEmail=em?(emailIndex.get(em)||[]):[],byName=nm?(nameIndex.get(nm)||[]):[];
  const both=byEmail.filter(b=>norm(b.contact_name)===nm);
  let category='UNMATCHED',suggested=null;
  const conflicts=byEmail.length&&byName.length&&!byEmail.some(b=>byName.some(n=>n.contact_id===b.contact_id));
  if(both.length===1){category='EXACT_NAME_AND_EMAIL';suggested=both[0].contact_id}
  else if(conflicts){category='CONFLICTING_EMAIL_AND_NAME'}
  else if(byEmail.length===1){category='EMAIL_ONLY_REVIEW';suggested=byEmail[0].contact_id}
  else if(byName.length===1){category='NAME_ONLY_REVIEW';suggested=byName[0].contact_id}
  else if(byEmail.length>1||byName.length>1){category='AMBIGUOUS'}
  const a=approved.get(owner.id),confirmed=a&&a.booksContactId===suggested&&a.sourceEvidenceId&&a.reviewedBy&&a.approvedAt;
  results.push({irisOwnerId:owner.id,suggestedBooksContactId:suggested,category,conflictingEvidence:Boolean(conflicts),
   booksEmailCandidates:byEmail.length,booksNameCandidates:byName.length,
   status:confirmed?'HUMAN_APPROVED_LINK':category==='EXACT_NAME_AND_EMAIL'?'HIGH_CONFIDENCE_REVIEW':'MANUAL_REVIEW',
   useForFinancialWrites:false,approvalEvidenceId:confirmed?a.sourceEvidenceId:null});
 }
 const duplicates=new Map();
 for(const r of results)if(r.suggestedBooksContactId)duplicates.set(r.suggestedBooksContactId,[...(duplicates.get(r.suggestedBooksContactId)||[]),r.irisOwnerId]);
 for(const r of results)if(r.suggestedBooksContactId&&(duplicates.get(r.suggestedBooksContactId)||[]).length>1){
  r.status='COLLISION_REVIEW';r.category='MANY_IRIS_OWNERS_ONE_BOOKS_CONTACT';r.approvalEvidenceId=null;
 }
 return {count:results.length,summary:{exactNameEmail:results.filter(r=>r.category==='EXACT_NAME_AND_EMAIL').length,
  emailOnlyReview:results.filter(r=>r.category==='EMAIL_ONLY_REVIEW').length,nameOnlyReview:results.filter(r=>r.category==='NAME_ONLY_REVIEW').length,
  unmatched:results.filter(r=>r.category==='UNMATCHED').length,ambiguous:results.filter(r=>['AMBIGUOUS','CONFLICTING_EMAIL_AND_NAME','MANY_IRIS_OWNERS_ONE_BOOKS_CONTACT'].includes(r.category)).length,
  approved:results.filter(r=>r.status==='HUMAN_APPROVED_LINK').length},results,autoApplied:0,booksChanges:0,irisChanges:0};
}
export function buildAgreementRegistry({owners,properties,propertyOwnership,managementAgreements,workdriveAgreements}){
 for(const x of [owners,properties,propertyOwnership,managementAgreements,workdriveAgreements])if(!Array.isArray(x))throw Error('INVALID_AGREEMENT_SOURCE');
 const ownerIds=new Set(owners.map(o=>o.id)),propertyIds=new Set(properties.map(p=>p.id)),byProperty=new Map();
 for(const p of propertyOwnership){if(!byProperty.has(p.property_id))byProperty.set(p.property_id,new Set());byProperty.get(p.property_id).add(p.owner_id)}
 const registry=[],exceptions=[],seen=new Set();
 for(const a of managementAgreements){
  if(!a.id||seen.has('iris:'+a.id)){exceptions.push({referenceId:a.id||null,reason:'DUPLICATE_OR_MISSING_AGREEMENT_ID'});continue}
  seen.add('iris:'+a.id);
  const ownersForProperty=[...(byProperty.get(a.property_id)||[])];
  const inferredOwnerId=a.owner_id||((ownersForProperty.length===1)?ownersForProperty[0]:null);
  const reasons=[];
  if(!propertyIds.has(a.property_id))reasons.push('UNKNOWN_PROPERTY');
  if(!inferredOwnerId||!ownerIds.has(inferredOwnerId))reasons.push('OWNER_LINK_MISSING');
  if(a.owner_id&&ownersForProperty.length&&!ownersForProperty.includes(a.owner_id))reasons.push('OWNER_PROPERTY_RELATION_CONFLICT');
  if(!a.file_name)reasons.push('AGREEMENT_FILENAME_MISSING');
  registry.push({ref:'iris:'+a.id,source:'IRIS_AGREEMENT',ownerId:inferredOwnerId,propertyId:a.property_id||null,
   documentType:a.agreement_type||null,fileName:a.file_name||null,issues:reasons,
   status:reasons.length?'REVIEW':'REFERENCE_ONLY',termsExtracted:false,signedVerified:false,feeRateApproved:false});
 }
 const ownerNames=index(owners,o=>norm(o.name));
 for(const f of workdriveAgreements){
  const key='drive:'+f.file_id;
  if(!f.file_id||seen.has(key)){exceptions.push({referenceId:f.file_id||null,reason:'DUPLICATE_OR_MISSING_WORKDRIVE_FILE_ID'});continue}
  seen.add(key);
  const candidateOwners=ownerNames.get(norm(f.owner_name))||[];
  const reasons=[];
  if(candidateOwners.length!==1)reasons.push('WORKDRIVE_OWNER_NAME_AMBIGUOUS');
  if(!f.property_folder)reasons.push('PROPERTY_FOLDER_MISSING');
  registry.push({ref:key,source:'WORKDRIVE_REFERENCE',ownerId:candidateOwners.length===1?candidateOwners[0].id:null,
   propertyId:null,propertyFolder:f.property_folder||null,documentType:f.agreement_type||null,fileName:f.file_name||null,
   issues:reasons,status:reasons.length?'REVIEW':'REFERENCE_ONLY',termsExtracted:false,signedVerified:false,feeRateApproved:false});
 }
 return {count:registry.length,registry,exceptions,feeRatesExtracted:0,agreementsVerifiedSigned:0,ownerFinanceChanges:0};
}
