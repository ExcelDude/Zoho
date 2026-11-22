/** Rent Trust owner/principal subledger preview.
 * Pure deterministic checks; NO POSTING, transfers, writes, account mapping assumptions.
 * Integers are CAD cents. Only verified, settled source events are included.
 */
const TYPES = new Set(['RENT_RECEIPT','OWNER_TOP_UP','OWNER_PAYOUT','AUTHORIZED_OWNER_EXPENSE','FEE_TRANSFER','UNIDENTIFIED_RECEIPT','IDENTIFIED_SUSPENSE_TRANSFER','REVERSAL']);
const POSITIVE = new Set(['RENT_RECEIPT','OWNER_TOP_UP','IDENTIFIED_SUSPENSE_TRANSFER']);
const NEGATIVE = new Set(['OWNER_PAYOUT','AUTHORIZED_OWNER_EXPENSE','FEE_TRANSFER']);
const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s+'T00:00:00Z').toISOString().slice(0,10) === s;
const validCent = x => Number.isSafeInteger(x) && x >= 0;
const distinct = a => new Set(a).size === a.length;

export function previewRentTrustLedger({cutoff,opening=[],events=[],controls={}}={}) {
 const issues=[],excluded=[],entries=[],balance=new Map(),openings=new Set(),eventIds=new Set(),bankIds=new Set(),booksIds=new Set();
 let suspenseCents=0;
 if(!validDate(cutoff)) issues.push('INVALID_CUTOFF');
 if(!Array.isArray(opening)||!Array.isArray(events)) return {status:'HOLD',issues:['INVALID_COLLECTIONS'],postingAllowed:false};
 for(const k of ['openingBalancesApproved','rentBankMapped','booksGLReconciled','ownershipSnapshotsApproved','sourceEventsComplete','bankCutoffVerified'])
   if(controls[k]!==true) issues.push('CONTROL_'+k.toUpperCase()+'_REQUIRED');
 if(!validCent(controls.openingSuspenseCents))issues.push('UNVERIFIED_SUSPENSE_OPENING');
 else suspenseCents=controls.openingSuspenseCents;
 for(const o of opening){
  if(!o?.ownerId||!o?.propertyId||!o?.ownershipSnapshotId||!validCent(o.amountCents)){issues.push('INVALID_OPENING');continue}
  const key=o.ownerId+'|'+o.propertyId+'|'+o.ownershipSnapshotId;
  if(openings.has(key)){issues.push('DUPLICATE_OPENING');continue}
  openings.add(key);
  balance.set(key,o.amountCents);
 }
 // Do not manufacture balances from events on an invalid or missing opening set.
 const ordered=[...events].sort((a,b)=>String(a.eventDate||'').localeCompare(String(b.eventDate||''))||String(a.eventId||'').localeCompare(String(b.eventId||'')));
 for(const e of ordered){
  if(!e?.eventId||eventIds.has(e.eventId)){issues.push('DUPLICATE_OR_MISSING_EVENT_ID');continue}
  eventIds.add(e.eventId);
  if(!TYPES.has(e.type)||!validDate(e.eventDate)||!validDate(cutoff)||e.eventDate>cutoff||!Number.isSafeInteger(e.amountCents)||e.amountCents<=0){issues.push('INVALID_EVENT');continue}
  if(e.status!=='CLEARED'||!e.bankEvidenceId||!e.booksEvidenceId||!e.bankAccountId||!e.sourceSystem||!e.sourceId){
   excluded.push({eventId:e.eventId,reason:'UNCLEARED_OR_EVIDENCE_MISSING'});
   issues.push('EVIDENCE_GAP');continue;
  }
  if(e.bankAccountId!==controls.approvedRentBankAccountId||!controls.approvedRentBankAccountId){issues.push('WRONG_OR_UNVERIFIED_RENT_BANK');continue}
  // Distinct external transaction IDs except approved split allocations within one event.
  if(bankIds.has(e.bankEvidenceId)||booksIds.has(e.booksEvidenceId)){issues.push('DUPLICATE_EXTERNAL_TRANSACTION');continue}
  bankIds.add(e.bankEvidenceId);booksIds.add(e.booksEvidenceId);
  const allocations=e.allocations;
  if(!Array.isArray(allocations)){issues.push('ALLOCATIONS_REQUIRED');continue}
  if(e.type==='UNIDENTIFIED_RECEIPT'){
   if(allocations.length!==0){issues.push('SUSPENSE_CANNOT_ALLOCATE_TO_OWNER');continue}
   suspenseCents+=e.amountCents;
   entries.push({eventId:e.eventId,type:e.type,suspenseDeltaCents:e.amountCents,ownerDeltas:[]});continue;
  }
  if(!allocations.length){issues.push('OWNER_ALLOCATIONS_REQUIRED');continue}
  if(!allocations.every(a=>a?.ownerId&&a.propertyId&&a.ownershipSnapshotId&&Number.isSafeInteger(a.amountCents)&&a.amountCents>0&&
       openings.has(a.ownerId+'|'+a.propertyId+'|'+a.ownershipSnapshotId))){issues.push('UNKNOWN_OR_INVALID_OWNER_ALLOCATION');continue}
  const keys=allocations.map(a=>a.ownerId+'|'+a.propertyId+'|'+a.ownershipSnapshotId);
  if(!distinct(keys)){issues.push('DUPLICATE_ALLOCATION_SLICE');continue}
  const total=allocations.reduce((s,a)=>s+a.amountCents,0);
  if(total!==e.amountCents||!Number.isSafeInteger(total)){issues.push('ALLOCATION_SUM_MISMATCH');continue}
  if(NEGATIVE.has(e.type)&&e.approvedByFinance!==true){issues.push('DISBURSEMENT_APPROVAL_REQUIRED');continue}
  if(e.type==='IDENTIFIED_SUSPENSE_TRANSFER'&&(e.allocationApproved!==true||suspenseCents<e.amountCents)){issues.push('SUSPENSE_RELEASE_NOT_APPROVED_OR_FUNDED');continue}
  let direction=POSITIVE.has(e.type)?1:-1;
  if(e.type==='REVERSAL'){
    if(!e.reversalOf||!e.reversalApproved||!['CREDIT','DEBIT'].includes(e.reversalDirection)){issues.push('INVALID_REVERSAL');continue}
    direction=e.reversalDirection==='CREDIT'?1:-1;
  }
  // Atomic all-or-nothing evaluation of the event.
  if(allocations.some(a=>balance.get(a.ownerId+'|'+a.propertyId+'|'+a.ownershipSnapshotId)+direction*a.amountCents<0)){
   issues.push('NEGATIVE_OWNER_PROPERTY_BALANCE');continue;
  }
  for(const a of allocations){const k=a.ownerId+'|'+a.propertyId+'|'+a.ownershipSnapshotId;balance.set(k,balance.get(k)+direction*a.amountCents)}
  if(e.type==='IDENTIFIED_SUSPENSE_TRANSFER')suspenseCents-=e.amountCents;
  entries.push({eventId:e.eventId,type:e.type,suspenseDeltaCents:e.type==='IDENTIFIED_SUSPENSE_TRANSFER'?-e.amountCents:0,
    ownerDeltas:allocations.map(a=>({ownerId:a.ownerId,propertyId:a.propertyId,ownershipSnapshotId:a.ownershipSnapshotId,signedCents:direction*a.amountCents}))});
 }
 const balances=[...balance].map(([key,amountCents])=>({key,amountCents})).sort((a,b)=>a.key.localeCompare(b.key));
 const ownerPrincipalCents=balances.reduce((s,a)=>s+a.amountCents,0);
 return {cutoff,status:issues.length?'HOLD':'READ_ONLY_PREVIEW',issues:[...new Set(issues)],excluded,entries,balances,
   ownerPrincipalCents,suspenseCents,combinedLiabilityCents:ownerPrincipalCents+suspenseCents,
   reconciliationCertified:false,postingAllowed:false,payoutAllowed:false,bankTransferAllowed:false};
}
export function buildRentTrustExceptionQueue(preview){
 const exceptions=preview.issues.map(reason=>({reason,priority:reason.includes('BANK')||reason.includes('NEGATIVE')?'CRITICAL':'REVIEW',manualResolutionRequired:true,autoRetry:false}));
 for(const e of preview.excluded)exceptions.push({reason:e.reason,eventId:e.eventId,priority:'REVIEW',manualResolutionRequired:true,autoRetry:false});
 return {exceptions,postingAllowed:false,autoRetryAllowed:false};
}
