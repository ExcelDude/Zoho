/** Iris owner→Zoho Books ID verification. Only evidence-backed exact IDs are accepted, no guessing or network writes. */
export function reviewCrosswalk({owners,booksContacts,ownership,rows}){
 const ownerMap=new Map(owners.map(x=>[x.id,x]));
 const booksMap=new Map(booksContacts.map(x=>[x.contact_id,x]));
 const owned=new Set(ownership.map(x=>x.owner_id));
 const seenO=new Set(),seenB=new Set(),out=[];
 for(const x of rows){
  const issues=[];
  if(!x.iris_owner_id||!ownerMap.has(x.iris_owner_id))issues.push("UNKNOWN_IRIS_OWNER");
  else if(ownerMap.get(x.iris_owner_id).status!=="active")issues.push("INACTIVE_OWNER");
  if(!owned.has(x.iris_owner_id))issues.push("OWNER_WITH_NO_OWNERSHIP");
  if(!x.books_contact_id||!booksMap.has(x.books_contact_id))issues.push("BOOKS_CUSTOMER_NOT_FOUND");
  else {const b=booksMap.get(x.books_contact_id);if(b.contact_type!=="customer"||b.status!=="active")issues.push("BOOKS_CONTACT_NOT_ACTIVE_CUSTOMER")}
  if(x.iris_owner_id&&seenO.has(x.iris_owner_id))issues.push("DUPLICATE_IRIS_OWNER_MAPPING");
  if(x.books_contact_id&&seenB.has(x.books_contact_id))issues.push("DUPLICATE_BOOKS_CONTACT_MAPPING");
  seenO.add(x.iris_owner_id);if(x.books_contact_id)seenB.add(x.books_contact_id);
  if(!x.evidence_ref||x.reviewer_status!=="APPROVED"||!x.reviewer_id||!x.verified_at)issues.push("NOT_INDEPENDENTLY_VERIFIED");
  if(x.evidence_ref&&/name-only|email-only|fuzzy|guess/i.test(x.evidence_ref))issues.push("UNSAFE_IDENTITY_EVIDENCE");
  out.push({iris_owner_id:x.iris_owner_id,books_contact_id:x.books_contact_id||null,status:issues.length?"HOLD":"APPROVED_IDENTITY_MAPPING",issues,postingAllowed:false});
 }
 const ready=out.filter(x=>x.status==="APPROVED_IDENTITY_MAPPING").length;
 return {rows:out,summary:{total:out.length,approved:ready,held:out.length-ready},postingAllowed:false};
}
