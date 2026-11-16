/** Iris bank receipt matching: conservative, dry-run and no financial postings. */
const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const pools = new Set(['RENT_TRUST','DEPOSIT_TRUST','OPERATING']);
export function assessReceiptBatch({receipts,bankAccounts,leaseCandidates=[],tenantMappings=[],appliedReceiptIds=[]}){
 if(!Array.isArray(receipts)||!Array.isArray(bankAccounts)||!Array.isArray(leaseCandidates)||!Array.isArray(tenantMappings))throw Error('INVALID_SOURCE_COLLECTIONS');
 const accounts=new Map(),accountIds=new Set(),mappings=new Map(),leases=new Map(),applied=new Set(appliedReceiptIds);
 for(const a of bankAccounts){
  if(!a?.booksAccountId||accountIds.has(a.booksAccountId))throw Error('DUPLICATE_OR_INVALID_BANK_ACCOUNT');
  accountIds.add(a.booksAccountId);
  if(a.approved===true&&pools.has(a.pool))accounts.set(a.booksAccountId,a);
 }
 for(const m of tenantMappings){if(m?.tenantId&&m.booksCustomerId&&m.independentlyVerified===true){if(mappings.has(m.tenantId))throw Error('DUPLICATE_TENANT_MAPPING');mappings.set(m.tenantId,m)}}
 for(const l of leaseCandidates){
  if(!l?.leaseId)throw Error('MISSING_LEASE_ID');
  if(leases.has(l.leaseId))throw Error('DUPLICATE_LEASE_CANDIDATE');
  leases.set(l.leaseId,l);
 }
 const seen=new Set(),rows=[];
 for(const receipt of receipts){
  const reasons=[];
  const key=receipt?.booksTransactionId;
  if(!key||seen.has(key))reasons.push('DUPLICATE_OR_MISSING_BANK_TRANSACTION_ID');
  if(key)seen.add(key);
  if(key&&applied.has(key))reasons.push('ALREADY_APPLIED_OR_RECONCILED');
  const account=accounts.get(receipt?.booksBankAccountId);
  if(!account)reasons.push('BANK_ACCOUNT_POOL_NOT_APPROVED');
  if(!Number.isSafeInteger(receipt?.amountCents)||receipt.amountCents<=0)reasons.push('INVALID_RECEIPT_AMOUNT');
  if(!validDate(receipt?.clearedAt)||receipt?.settlementStatus!=='CLEARED')reasons.push('NOT_CONFIRMED_CLEARED');
  if(!receipt?.booksEvidenceId||!receipt?.bankStatementEvidenceId)reasons.push('INSUFFICIENT_BANK_AND_BOOKS_EVIDENCE');
  if(!receipt?.sourceSystem||receipt.sourceSystem!=='BOOKS_BANK')reasons.push('UNTRUSTED_RECEIPT_ORIGIN');
  let classification='UNKNOWN',candidateLeaseId=null,matchedTenantId=null;
  const ref=receipt?.verifiedReference;
  // A verified reference must be produced by authenticated tenant/customer linkage,
  // never inferred from a free-text memo, name, property address, amount, or email.
  if(ref?.verificationMethod!=='INDEPENDENT_ACCOUNT_MAPPING'||!ref?.tenantId||!ref?.leaseId||ref.verified!==true)reasons.push('NO_AUTHORITATIVE_TENANT_REFERENCE');
  else{
   const lease=leases.get(ref.leaseId),mapping=mappings.get(ref.tenantId);
   if(!lease||lease.tenantId!==ref.tenantId||lease.propertyId!==ref.propertyId)reasons.push('LEASE_OR_PROPERTY_REFERENCE_MISMATCH');
   else if(!mapping||mapping.booksCustomerId!==ref.booksCustomerId)reasons.push('TENANT_BOOKS_ID_UNVERIFIED');
   else if(!lease.period||!/^\d{4}-(0[1-9]|1[0-2])$/.test(lease.period))reasons.push('MISSING_LEASE_ACCOUNTING_PERIOD');
   else{
    matchedTenantId=ref.tenantId;candidateLeaseId=ref.leaseId;
    if(account?.pool==='RENT_TRUST'){
     classification='RENT_CANDIDATE';
     if(lease.expectedRentCents!==receipt.amountCents)reasons.push('RENT_AMOUNT_NEEDS_ALLOCATION_REVIEW');
    }else if(account?.pool==='DEPOSIT_TRUST'){
     classification='DEPOSIT_CANDIDATE';
     if(!ref.depositType||!['SECURITY','PET'].includes(ref.depositType))reasons.push('DEPOSIT_TYPE_NOT_VERIFIED');
     if(!Number.isSafeInteger(ref.expectedDepositCents)||receipt.amountCents!==ref.expectedDepositCents)reasons.push('DEPOSIT_AMOUNT_NEEDS_ALLOCATION_REVIEW');
    }else reasons.push('RENT_OR_DEPOSIT_RECEIVED_IN_OPERATING_ACCOUNT');
   }
  }
  const status=reasons.length?'HOLD_FOR_REVIEW':'MATCH_CANDIDATE_ONLY';
  rows.push({booksTransactionId:key||null,bankPool:account?.pool||'UNVERIFIED',classification,status,reasons:[...new Set(reasons)],
   leaseId:candidateLeaseId,tenantId:matchedTenantId,amountCents:receipt?.amountCents??null,
   journalPostingAllowed:false,trustAllocationAllowed:false,booksCategorizationAllowed:false,paymentActionAllowed:false});
 }
 return{count:rows.length,reviewRequired:rows.filter(x=>x.status==='HOLD_FOR_REVIEW').length,candidates:rows.filter(x=>x.status==='MATCH_CANDIDATE_ONLY').length,
 rows,postingsCreated:0,bankTransactionsModified:0,paymentActions:0};
}
export function buildReceiptExceptionQueue(batch){
 return batch.rows.filter(r=>r.status==='HOLD_FOR_REVIEW').map(r=>({externalRef:r.booksTransactionId,category:'BANK_RECEIPT_UNMATCHED',
  priority:r.reasons.includes('BANK_ACCOUNT_POOL_NOT_APPROVED')?'CRITICAL':'REVIEW',
  reasonCodes:r.reasons,action:'REVIEW_BANK_EVIDENCE_AND_APPROVE_MANUAL_MATCH',autoRetry:false,financialActionAllowed:false}));
}
