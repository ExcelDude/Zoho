/** Conservative agreement-document to Iris owner/property reference association.
 * Metadata only: NEVER infer a signed agreement, approved fee, or financial authority.
 */
export function normalizedOwnerName(s){return String(s??'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();}
export function normalizedStreet(s){
 return String(s??'').normalize('NFKC').toLowerCase()
 .replace(/\([^)]*\)/g,' ')
 .replace(/^\s*(?:#|unit\s*)?\d{1,5}\s*-\s*(?=\d)/,'')
 .replace(/\b(street|st)\b/g,'st').replace(/\b(road|rd)\b/g,'rd')
 .replace(/\b(avenue|ave)\b/g,'ave').replace(/\b(boulevard|blvd)\b/g,'blvd')
 .replace(/\b(drive|dr)\b/g,'dr').replace(/\b(place|pl)\b/g,'pl')
 .replace(/\b(court|ct)\b/g,'ct').replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();
}
const index=(list,key)=>{const out=new Map();for(const x of list){const k=key(x);if(k)out.set(k,[...(out.get(k)||[]),x])}return out;};
export function assessDocumentReferences({owners,properties,ownershipLinks,documents}){
 for(const a of [owners,properties,ownershipLinks,documents])if(!Array.isArray(a))throw Error('INVALID_INPUT');
 const unique=(rows,field,reason)=>{const seen=new Set();for(const r of rows){if(!r?.[field]||seen.has(r[field]))throw Error(reason);seen.add(r[field])}};
 unique(owners,'id','INVALID_OWNER_IDENTIFIERS');unique(properties,'id','INVALID_PROPERTY_IDENTIFIERS');unique(documents,'file_id','INVALID_DOCUMENT_REFERENCES');
 const ownerByName=index(owners,x=>normalizedOwnerName(x.name)),propertyByStreet=index(properties,p=>normalizedStreet(p.address_line1));
 const ownersByProperty=new Map(),ownerIds=new Set(owners.map(o=>o.id)),propertyIds=new Set(properties.map(p=>p.id));
 for(const l of ownershipLinks){
  if(!ownerIds.has(l.owner_id)||!propertyIds.has(l.property_id))throw Error('BROKEN_PROPERTY_OWNERSHIP_JOIN');
  ownersByProperty.set(l.property_id,new Set([...(ownersByProperty.get(l.property_id)||[]),l.owner_id]));
 }
 const results=[];
 for(const d of documents){
  const named=ownerByName.get(normalizedOwnerName(d.owner_name))||[];
  const atStreet=propertyByStreet.get(normalizedStreet(d.property_folder))||[];
  const corroborated=named.length===1?atStreet.filter(p=>(ownersByProperty.get(p.id)||new Set()).has(named[0].id)):[];
  const other=atStreet.filter(p=>corroborated.every(q=>q.id!==p.id));
  let classification,ownerId=null,propertyId=null;
  if(named.length===1&&corroborated.length===1&&other.length===0){
   classification='OWNER_AND_PROPERTY_UNIQUE_REFERENCE';ownerId=named[0].id;propertyId=corroborated[0].id;
  }else if(named.length===1&&corroborated.length===1&&other.length>0){
   classification='PROPERTY_ADDRESS_AMBIGUOUS_REVIEW';ownerId=named[0].id;propertyId=corroborated[0].id;
  }else if(named.length===1&&corroborated.length>1){
   classification='MULTIPLE_PROPERTIES_SAME_OWNER_STREET';ownerId=named[0].id;
  }else if(named.length!==1){
   classification='OWNER_NAME_UNRESOLVED';
  }else if(atStreet.length===0){
   classification='PROPERTY_FOLDER_UNRESOLVED';ownerId=named[0].id;
  }else{
   classification='OWNER_PROPERTY_RELATION_CONFLICT';ownerId=named[0].id;
  }
  results.push({fileId:d.file_id,ownerId,propertyId,classification,ownerNameCandidates:named.length,
   propertyStreetCandidates:atStreet.length,corroboratedCandidates:corroborated.length,
   documentType:d.agreement_type||null,fileName:d.file_name||null,propertyFolder:d.property_folder||null,
   signedPdfContentsReviewed:false,feeTermsApproved:false,status:'MANUAL_REVIEW_ONLY',
   mayApplyToBooks:false});
 }
 return {total:results.length,results,summary:results.reduce((a,x)=>(a[x.classification]=(a[x.classification]||0)+1,a),{}),booksWrites:0,feeTermsImported:0};
}
