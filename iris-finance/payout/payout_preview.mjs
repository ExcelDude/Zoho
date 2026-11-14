/** Iris owner payout preview. All cash movements supplied by caller. Integer CAD cents, no network calls. */
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value;
const allowedTypes = new Set(['RENT_RECEIPT','OWNER_EXPENSE','FEE_GST_TRANSFER','NR_WITHHOLDING','OWNER_TOPUP','OWNER_PAYOUT']);
export function prepareOwnerPayout({period, ownerId, propertyId, openingBalanceCents, reserveCents=0, events=[], controls={}}){
  const blocking=[],excluded=[];
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period||''))throw new Error('INVALID_PERIOD');
  if(!ownerId||!propertyId)blocking.push('OWNER_OR_PROPERTY_REQUIRED');
  if(!Number.isSafeInteger(openingBalanceCents)||openingBalanceCents<0)blocking.push('OPENING_BALANCE_UNVERIFIED');
  if(!Number.isSafeInteger(reserveCents)||reserveCents<0)blocking.push('INVALID_RESERVE');
  const required=['verifiedOwnerBooksId','signedEffectiveAgreement','ownershipSnapshotApproved','openingBalanceApproved','bankReconciled','trustLedgerReconciled','periodSourceComplete','outstandingChargesReviewed','managingBrokerApproval'];
  for(const name of required)if(controls[name]!==true)blocking.push(name.toUpperCase()+'_REQUIRED');
  const cutoff=period+'-10',observed=new Set();
  const totals={rentReceiptsCents:0,ownerTopupsCents:0,feeAndGstCents:0,ownerExpensesCents:0,nrWithholdingCents:0,alreadyPaidCents:0};
  for(const e of events){
    if(!e||!e.eventId||observed.has(e.eventId)){blocking.push('DUPLICATE_OR_MISSING_EVENT_ID');continue}
    observed.add(e.eventId);
    if(e.ownerId!==ownerId||e.propertyId!==propertyId){excluded.push({eventId:e.eventId,reason:'OTHER_OWNER_OR_PROPERTY'});continue}
    if(!allowedTypes.has(e.type)){blocking.push('UNKNOWN_EVENT_TYPE');continue}
    if(!Number.isSafeInteger(e.amountCents)||e.amountCents<=0){blocking.push('INVALID_EVENT_AMOUNT');continue}
    if(e.state!=='SETTLED'||!e.booksEvidenceId){excluded.push({eventId:e.eventId,reason:'NOT_SETTLED_OR_UNVERIFIED'});continue}
    if(!validDate(e.effectiveDate)){blocking.push('INVALID_EFFECTIVE_DATE');continue}
    if(e.type==='RENT_RECEIPT'||e.type==='OWNER_TOPUP'){
      if(!validDate(e.clearedAt)){excluded.push({eventId:e.eventId,reason:'MISSING_CLEARED_DATE'});continue}
      if(e.clearedAt>cutoff){excluded.push({eventId:e.eventId,reason:'AFTER_CUTOFF'});continue}
      if(e.clearedAt<period+'-01'&&e.includedInOpeningBalance!==false){excluded.push({eventId:e.eventId,reason:'POSSIBLY_ALREADY_IN_OPENING_BALANCE'});continue}
    }else if(e.effectiveDate>cutoff){excluded.push({eventId:e.eventId,reason:'AFTER_CUTOFF'});continue}
    else if(e.effectiveDate<period+'-01'&&e.includedInOpeningBalance!==false){excluded.push({eventId:e.eventId,reason:'POSSIBLY_ALREADY_IN_OPENING_BALANCE'});continue}
    if(e.type==='RENT_RECEIPT')totals.rentReceiptsCents+=e.amountCents;
    if(e.type==='OWNER_TOPUP')totals.ownerTopupsCents+=e.amountCents;
    if(e.type==='FEE_GST_TRANSFER')totals.feeAndGstCents+=e.amountCents;
    if(e.type==='OWNER_EXPENSE')totals.ownerExpensesCents+=e.amountCents;
    if(e.type==='NR_WITHHOLDING')totals.nrWithholdingCents+=e.amountCents;
    if(e.type==='OWNER_PAYOUT')totals.alreadyPaidCents+=e.amountCents;
  }
  const charges=totals.feeAndGstCents+totals.ownerExpensesCents+totals.nrWithholdingCents+totals.alreadyPaidCents;
  const available=(Number.isSafeInteger(openingBalanceCents)?openingBalanceCents:0)+totals.rentReceiptsCents+totals.ownerTopupsCents-charges;
  if(available<0)blocking.push('NEGATIVE_OWNER_TRUST_POSITION');
  const payout=Math.max(0,available-(Number.isSafeInteger(reserveCents)?reserveCents:0));
  return {ownerId,propertyId,period,cutoff,due:period+'-20',totals,availableBeforeReserveCents:available,reserveCents,proposedPayoutCents:payout,
   status:blocking.length?'HOLD':'REVIEW_CANDIDATE_ONLY',blocking:[...new Set(blocking)],excluded,releaseAllowed:false,postingAllowed:false,
   notes:['No EFT, Books write or statement distribution','Immutable source and Books settlement evidence required','Cross-property pooling needs separate principal approvals']};
}
