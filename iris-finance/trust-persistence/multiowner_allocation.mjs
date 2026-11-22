/** Pure multi-owner rent receipt allocation. NO accounting postings.
 * Ownership shares are integer basis points. Any remainder is distributed by
 * largest fractional remainder, with a stable owner/snapshot tie-break.
 */
import {createHash} from 'node:crypto';
import {normalizeTrustEvent} from './trust_event_store.mjs';
const SAFE=Object.freeze({postingAllowed:false,trustTransferAllowed:false,payoutAllowed:false,booksWriteAllowed:false});
const id=s=>typeof s==='string'&&s.length>0&&s.length<=256&&/^[A-Za-z0-9][A-Za-z0-9:_./%-]*$/.test(s);
const digest=s=>createHash('sha256').update(JSON.stringify(s)).digest('hex');
const hold=(reasons)=>({status:'HOLD',reasons:[...new Set(reasons)],...SAFE});
export function prepareMultiOwnerReceipt({receipt,ownership,approvedBankAccountId}={}){
 const errors=[];
 if(!receipt||!id(receipt.bankTransactionId)||!id(receipt.booksEvidenceId)||!id(receipt.bankEvidenceId)||
 !id(receipt.leaseId)||!id(receipt.tenantId)||!id(receipt.propertyId))errors.push('RECEIPT_SOURCE_EVIDENCE_MISSING');
 if(!Number.isSafeInteger(receipt?.amountCents)||receipt.amountCents<=0)errors.push('INVALID_RECEIPT_CENTS');
 if(typeof receipt?.clearedAt!=='string'||!/^\\d{4}-\\d{2}-\\d{2}$/.test(receipt.clearedAt)||Number.isNaN(Date.parse(receipt.clearedAt))||new Date(receipt.clearedAt+'T00:00:00Z').toISOString().slice(0,10)!==receipt.clearedAt)errors.push('INVALID_CLEARED_DATE');
 if(receipt?.status!=='CLEARED'||receipt?.bankVerified!==true||receipt?.booksVerified!==true||
 receipt?.tenantLeaseIdentityVerified!==true)errors.push('UNVERIFIED_SETTLED_RECEIPT');
 if(!approvedBankAccountId||receipt?.booksBankAccountId!==approvedBankAccountId||receipt?.bankMappingApproved!==true||receipt?.pool!=='RENT')
 errors.push('RENT_BANK_MAPPING_MISSING');
 if(!Array.isArray(ownership)||ownership.length<1)errors.push('OWNERSHIP_RECORDS_REQUIRED');
 if(receipt?.ownershipApproved!==true)errors.push('OWNERSHIP_APPROVAL_MISSING');
 const slices=[],seen=new Set();
 for(const o of Array.isArray(ownership)?ownership:[]){
  if(!id(o?.ownerId)||!id(o?.propertyId)||!id(o?.ownershipSnapshotId)||o.propertyId!==receipt?.propertyId||
    !Number.isSafeInteger(o.basisPoints)||o.basisPoints<=0||o.basisPoints>10000||o.verified!==true){
   errors.push('INVALID_OWNER_SLICE');continue;
  }
  const key=[o.ownerId,o.propertyId,o.ownershipSnapshotId].join('|');
  if(seen.has(key))errors.push('DUPLICATE_OWNER_SLICE');seen.add(key);
  slices.push({...o,key});
 }
 if(slices.length&&slices.reduce((a,o)=>a+o.basisPoints,0)!==10000)errors.push('OWNERSHIP_NOT_100_PERCENT');
 if(slices.length&&new Set(slices.map(o=>o.ownershipSnapshotId)).size!==1)errors.push('MIXED_OWNERSHIP_SNAPSHOTS');
 if(errors.length)return hold(errors);
 const ordered=slices.sort((a,b)=>a.key.localeCompare(b.key));
 const rows=ordered.map(o=>{
   const numerator=BigInt(receipt.amountCents)*BigInt(o.basisPoints);
   return {ownerId:o.ownerId,propertyId:o.propertyId,ownershipSnapshotId:o.ownershipSnapshotId,
     basisPoints:o.basisPoints,amountCents:Number(numerator/10000n),remainder:Number(numerator%10000n),key:o.key};
 });
 const allocated=rows.reduce((n,x)=>n+x.amountCents,0);
 const pennies=receipt.amountCents-allocated;
 const ranking=[...rows].sort((a,b)=>b.remainder-a.remainder||a.key.localeCompare(b.key));
 for(let i=0;i<pennies;i++)ranking[i].amountCents++;
 const allocations=rows.map(({key,remainder,...x})=>x).filter(x=>x.amountCents>0);
 if(allocations.reduce((n,x)=>n+x.amountCents,0)!==receipt.amountCents)return hold(['ALLOCATION_SUM_MISMATCH']);
 // Stable source identity: bank transaction, not lease revision or payment amount.
 const trust=normalizeTrustEvent({organizationId:'110003520057',pool:'RENT',eventType:'RENT_RECEIPT',
  sourceSystem:'BOOKS_BANK',sourceId:receipt.bankTransactionId,sourceVersion:'1',
  eventDate:receipt.clearedAt,amountCents:receipt.amountCents,principalId:null,propertyId:receipt.propertyId});
 const allocationFingerprint=digest({eventKey:trust.eventKey,amountCents:receipt.amountCents,
   evidence:{booksEvidenceId:receipt.booksEvidenceId,bankEvidenceId:receipt.bankEvidenceId,
     leaseId:receipt.leaseId,tenantId:receipt.tenantId},
   allocations,approvedSnapshot:ordered[0].ownershipSnapshotId});
 return {status:'MULTI_OWNER_PREVIEW_READY',trust,allocations,
    allocationFingerprint,sourceLeaseId:receipt.leaseId,sourceTenantId:receipt.tenantId,
    unallocatedCents:0, ...SAFE};
}
