/** Read-only Iris PMS snapshot → January rent candidate events. No external writes. */
import {createHash} from 'node:crypto';
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const cents=value=>{
 if(!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(String(value??'')))throw Error('INVALID_MONEY');
 const [whole,frac='']=String(value).split('.');
 const total=Number(whole)*100+Number(frac.padEnd(2,'0'));
 if(!Number.isSafeInteger(total))throw Error('UNSAFE_MONEY');
 return total;
};
export function buildJanuaryRentCandidates({leases,properties,ownership,period='2027-01',snapshotAt='2026-11-16T00:00:00Z'}){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw Error('INVALID_PERIOD');
 if(!Array.isArray(leases)||!Array.isArray(properties)||!Array.isArray(ownership))throw Error('INCOMPLETE_SOURCE_COLLECTION');
 if(!Number.isFinite(Date.parse(snapshotAt)))throw Error('INVALID_SNAPSHOT_TIME');
 const monthStart=period+'-01',lastDay=new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5,7)),0)).toISOString().slice(0,10);
 const propertyMap=new Map(properties.map(p=>[p.id,p])),owners=new Map();
 for(const x of ownership){const a=owners.get(x.property_id)||[];a.push({ownerId:x.owner_id,percentage:Number(x.ownership_percentage)});owners.set(x.property_id,a)}
 const candidates=[],exceptions=[],seen=new Set();
 for(const lease of leases){
  const p=propertyMap.get(lease.property_id);
  if(lease.status!=='active'||!p||p.management_status!=='active'||lease.start_date>lastDay||(lease.end_date&&lease.end_date<monthStart))continue;
  const issues=[];
  if(seen.has(lease.id))issues.push('DUPLICATE_LEASE_ID');seen.add(lease.id);
  if(!lease.tenant_id)issues.push('MISSING_TENANT_ID');
  if(!lease.property_id)issues.push('MISSING_PROPERTY_ID');
  if(!lease.start_date||lease.start_date>lastDay)issues.push('LEASE_START_INVALID');
  let rentCents=null;try{rentCents=cents(lease.rent_amount);if(rentCents<=0)issues.push('NONPOSITIVE_RENT')}catch{issues.push('INVALID_RENT')}
  const linkedOwners=owners.get(lease.property_id)||[];
  if(!linkedOwners.length)issues.push('MISSING_OWNER_LINK');
  if(linkedOwners.some(o=>!o.ownerId||!Number.isFinite(o.percentage)||o.percentage<=0))issues.push('INVALID_OWNER_SHARES');
  if(linkedOwners.length&&Math.abs(linkedOwners.reduce((s,o)=>s+o.percentage,0)-100)>0.01)issues.push('OWNERSHIP_PERCENT_NOT_100');
  const sourcePayload={leaseId:lease.id,propertyId:lease.property_id,tenantId:lease.tenant_id,leaseStart:lease.start_date,leaseEnd:lease.end_date||null,rentCents,ownership:linkedOwners.slice().sort((a,b)=>a.ownerId.localeCompare(b.ownerId)),managementStatus:p.management_status};
  const sourceVersion=sha(sourcePayload);
  const event={type:'RENT_CYCLE_DUE',sourceSystem:'iris',sourceId:lease.id,sourceVersion,organizationId:'110003520057',occurredAt:snapshotAt,accountingPeriod:period,payload:sourcePayload};
  candidates.push({leaseId:lease.id,propertyId:lease.property_id,amountCents:rentCents,ownerCount:linkedOwners.length,issues,event,decision:'HOLD_REAL_OWNER_BILLING_NOT_AUTHORIZED'});
  for(const issue of issues)exceptions.push({leaseId:lease.id,propertyId:lease.property_id,reason:issue});
 }
 candidates.sort((a,b)=>a.leaseId.localeCompare(b.leaseId));
 return{period,snapshotAt,sourceCounts:{leases:leases.length,properties:properties.length,ownershipLinks:ownership.length},candidates,exceptions,summary:{rentCandidates:candidates.length,scheduledRentCents:candidates.reduce((sum,c)=>sum+(c.amountCents||0),0),withSourceExceptions:candidates.filter(c=>c.issues.length).length,realBooksWrites:0},postingAllowed:false,sendAllowed:false};
}
export async function loadIrisSnapshot({listRecords}){
 if(typeof listRecords!=='function')throw Error('READ_ONLY_LIST_RECORDS_REQUIRED');
 const out={};
 for(const resource of ['leases','properties','property_ownership']){
  let offset=0,rows=[],pages=0;
  while(true){
   const page=await listRecords({resource,limit:500,offset});
   if(!page||!Array.isArray(page.data)||page.count!==page.data.length||page.offset!==offset)throw Error('INCOMPLETE_'+resource.toUpperCase()+'_PAGE');
   rows=rows.concat(page.data);pages++;
   if(pages>100)throw Error('PAGINATION_LIMIT');
   if(!page.has_more)break;
   if(!Number.isInteger(page.next_offset)||page.next_offset<=offset)throw Error('BAD_NEXT_OFFSET');
   offset=page.next_offset;
  }
  out[resource]=rows;
 }
 return out;
}
