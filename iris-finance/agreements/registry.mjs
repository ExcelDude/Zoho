/** Iris agreement registry validation. No external APIs or financial writes. All input is untrusted agreement metadata, never private documents. */
function parseCSV(text){
 const out=[],row=[];let field="",quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++}else if(c==='"')quoted=false;else field+=c}
 else if(c==='"')quoted=true;else if(c===','){row.push(field);field=""}else if(c==='\n'){row.push(field.replace(/\r$/,""));out.push([...row]);row.length=0;field=""}else field+=c}
 if(quoted)throw Error("CSV_UNTERMINATED_QUOTE");if(field!==""||row.length){row.push(field.replace(/\r$/,""));out.push([...row])}
 if(!out.length)throw Error("CSV_EMPTY");
 const headers=out.shift().map((x,i)=>i===0?x.replace(/^\uFEFF/,"").trim():x.trim());
 if(new Set(headers).size!==headers.length)throw Error("CSV_DUPLICATE_COLUMNS");
 return out.filter(r=>r.some(x=>x.trim())).map((r,n)=>{if(r.length!==headers.length)throw Error("CSV_COLUMN_COUNT_ROW_"+(n+2));return Object.fromEntries(headers.map((h,i)=>[h,r[i].trim()]))});
}
function validDate(d){if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return false;const x=new Date(d+"T00:00:00Z");return !Number.isNaN(x.getTime())&&x.toISOString().slice(0,10)===d}
function validateAgreements(rows,{asOf="2027-01-01"}={}){
 if(!validDate(asOf))throw Error("INVALID_AS_OF");
 const all=[],byProperty=new Map(),ids=new Map();
 for(let i=0;i<rows.length;i++){
  const a=rows[i],issues=[];
  for(const k of required)if(!String(a[k]??"").trim())issues.push("MISSING_"+k.toUpperCase());
  if(a.effective_start&&!validDate(a.effective_start))issues.push("INVALID_EFFECTIVE_START");
  if(a.signed_at&&!validDate(a.signed_at))issues.push("INVALID_SIGNED_AT");
  if(a.effective_end&&(!validDate(a.effective_end)||a.effective_end<a.effective_start))issues.push("INVALID_EFFECTIVE_END");
  if(a.signed_at&&a.effective_start&&validDate(a.signed_at)&&validDate(a.effective_start)&&a.signed_at>a.effective_start)issues.push("SIGNED_AFTER_EFFECTIVE_START_REVIEW");
  const types=["FURNISHED_V4","UNFURNISHED_V4","PLACEMENT_V1","LEGACY"];
  if(a.type&&!types.includes(a.type))issues.push("UNKNOWN_TYPE");
  if(a.review_status!=="APPROVED")issues.push("NOT_REVIEWER_APPROVED");
  const pct=Number(a.management_pct);
  if(!Number.isFinite(pct)||pct<0||pct>100)issues.push("INVALID_MGMT_PERCENT");
  if(a.type==="FURNISHED_V4"&&pct!==20&&a.special_rate_approved!=="YES")issues.push("RATE_EXCEPTION_APPROVAL_REQUIRED");
  if(a.type==="UNFURNISHED_V4"&&pct!==10&&a.special_rate_approved!=="YES")issues.push("RATE_EXCEPTION_APPROVAL_REQUIRED");
  if(a.type==="PLACEMENT_V1"&&pct!==0)issues.push("PLACEMENT_NO_MANAGEMENT_FEE");
  if(a.type==="LEGACY"&&!["YES",true].includes(a.legacy_terms_verified))issues.push("LEGACY_TERMS_REQUIRED");
  if(a.nonresident==="YES"&&!["YES","NO"].includes(a.nonresident_verified))issues.push("NR_STATUS_VERIFICATION_REQUIRED");
  if(a.agreement_id){if(ids.has(a.agreement_id))issues.push("DUPLICATE_AGREEMENT_ID");ids.set(a.agreement_id,true)}
  const r={...a,issues,status:issues.length?"HOLD":"VALIDATED_FOR_REVIEW",postingAllowed:false,row:i+2};
  all.push(r);const group=byProperty.get(a.property_id)||[];group.push(r);byProperty.set(a.property_id,group);
 }
 // Overlap is a hard stop even when rows belong to different co-owners; a formal multi-owner
 // agreement relationship requires explicit support, never guess a winning rate.
 for(const [property,group] of byProperty){for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){
   const a=group[i],b=group[j];if(!a.effective_start||!b.effective_start||!validDate(a.effective_start)||!validDate(b.effective_start))continue;
   const aend=a.effective_end||"9999-12-31",bend=b.effective_end||"9999-12-31";
   if(a.effective_start<=bend&&b.effective_start<=aend){
     for(const x of [a,b]){if(!x.issues.includes("OVERLAPPING_AGREEMENT_PERIOD"))x.issues.push("OVERLAPPING_AGREEMENT_PERIOD");x.status="HOLD"}
   }
 }}
 return {records:all,summary:{total:all.length,ready:all.filter(x=>x.status==="VALIDATED_FOR_REVIEW").length,held:all.filter(x=>x.status==="HOLD").length},postingAllowed:false};
}
export {parseCSV,validateAgreements};
