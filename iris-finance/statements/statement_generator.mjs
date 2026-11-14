/** Iris rent-trust owner statement generator. No network or financial actions. Integer CAD cents. */
const types=new Set(["RENT_RECEIPT","FEE_GST_TRANSFER","OWNER_EXPENSE","OWNER_PAYOUT","OWNER_TOPUP","NR_WITHHOLDING","ADJUSTMENT"]);
const inflows=new Set(["RENT_RECEIPT","OWNER_TOPUP"]),outflows=new Set(["FEE_GST_TRANSFER","OWNER_EXPENSE","OWNER_PAYOUT","NR_WITHHOLDING"]);
const validDate=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s+"T00:00:00Z").toISOString().slice(0,10)===s;
const money=n=>(n/100).toFixed(2);
export function generateOwnerStatement({ownerId,period,propertyOpenings,events,controls={},expectedClosingByProperty={}}){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period||""))throw Error("INVALID_PERIOD");
 const issues=[],excluded=[],balances=new Map(),seen=new Set();
 if(!ownerId)issues.push("OWNER_ID_REQUIRED");
 if(!Array.isArray(propertyOpenings)||!propertyOpenings.length)issues.push("PROPERTY_OPENINGS_REQUIRED");
 if(!Array.isArray(events))issues.push("EVENTS_ARRAY_REQUIRED");
 for(const key of ["ownerIdentityVerified","signedAgreementsVerified","ownershipSnapshotVerified","openingBalancesVerified","booksCashEventsComplete","feesAndExpensesReviewed","trustBankReconciled","booksGLReconciled","statementReviewerApproved"])
  if(controls[key]!==true)issues.push("CONTROL_"+key.toUpperCase()+"_REQUIRED");
 for(const p of propertyOpenings||[]){
  if(!p.propertyId||balances.has(p.propertyId)){issues.push("DUPLICATE_OR_MISSING_PROPERTY_OPENING");continue}
  if(!Number.isSafeInteger(p.openingCents)||p.openingCents<0){issues.push("INVALID_OPENING_CENTS");continue}
  if(!p.evidenceId)issues.push("OPENING_SOURCE_EVIDENCE_REQUIRED");
  balances.set(p.propertyId,{propertyId:p.propertyId,openingCents:p.openingCents,rentCents:0,feesAndGstCents:0,ownerExpensesCents:0,payoutsCents:0,topupsCents:0,nonresidentWithholdingCents:0,adjustmentsCents:0,closingCents:p.openingCents,entries:[]});
 }
 for(const e of events||[]){
  if(!e?.eventId||seen.has(e.eventId)){issues.push("DUPLICATE_OR_MISSING_EVENT_ID");continue}seen.add(e.eventId);
  if(e.ownerId!==ownerId){excluded.push({eventId:e.eventId,reason:"OTHER_OWNER"});continue}
  if(!balances.has(e.propertyId)){issues.push("EVENT_PROPERTY_NOT_IN_OPENING_SNAPSHOT");continue}
  if(!types.has(e.type)){issues.push("UNSUPPORTED_EVENT_TYPE");continue}
  if(!Number.isSafeInteger(e.signedAmountCents)||e.signedAmountCents===0){issues.push("INVALID_SIGNED_AMOUNT_CENTS");continue}
  if(inflows.has(e.type)&&e.signedAmountCents<0||outflows.has(e.type)&&e.signedAmountCents>0){issues.push("WRONG_EVENT_SIGN");continue}
  if(!validDate(e.eventDate)){issues.push("INVALID_EVENT_DATE");continue}
  if(e.eventDate.slice(0,7)!==period){excluded.push({eventId:e.eventId,reason:"OUTSIDE_STATEMENT_PERIOD"});continue}
  if(e.state!=="SETTLED"||!e.booksEvidenceId){excluded.push({eventId:e.eventId,reason:"UNSETTLED_OR_BOOKS_EVIDENCE_MISSING"});continue}
  if(!e.sourceRef){issues.push("SOURCE_REFERENCE_MISSING");continue}
  const p=balances.get(e.propertyId);
  const bucket={RENT_RECEIPT:"rentCents",FEE_GST_TRANSFER:"feesAndGstCents",OWNER_EXPENSE:"ownerExpensesCents",OWNER_PAYOUT:"payoutsCents",OWNER_TOPUP:"topupsCents",NR_WITHHOLDING:"nonresidentWithholdingCents",ADJUSTMENT:"adjustmentsCents"}[e.type];
  p[bucket]+=e.signedAmountCents;p.closingCents+=e.signedAmountCents;
  p.entries.push({eventId:e.eventId,eventDate:e.eventDate,type:e.type,signedAmountCents:e.signedAmountCents,booksEvidenceId:e.booksEvidenceId,sourceRef:e.sourceRef});
 }
 const properties=[...balances.values()].sort((a,b)=>a.propertyId.localeCompare(b.propertyId));
 for(const p of properties){
  p.entries.sort((a,b)=>a.eventDate.localeCompare(b.eventDate)||a.eventId.localeCompare(b.eventId));
  if(p.closingCents<0)issues.push("NEGATIVE_PROPERTY_TRUST_BALANCE_"+p.propertyId);
  if(!Number.isSafeInteger(expectedClosingByProperty[p.propertyId]))issues.push("CLOSING_LEDGER_EVIDENCE_MISSING_"+p.propertyId);
  else if(p.closingCents!==expectedClosingByProperty[p.propertyId])issues.push("CLOSING_LEDGER_VARIANCE_"+p.propertyId);
 }
 const keys=["openingCents","rentCents","feesAndGstCents","ownerExpensesCents","payoutsCents","topupsCents","nonresidentWithholdingCents","adjustmentsCents","closingCents"];
 const totals=Object.fromEntries(keys.map(k=>[k,properties.reduce((sum,p)=>sum+p[k],0)]));
 const sum=keys.filter(k=>k!=="closingCents").reduce((n,k)=>n+totals[k],0);
 if(sum!==totals.closingCents)issues.push("OWNER_STATEMENT_ARITHMETIC_MISMATCH");
 return{ownerId,period,currency:"CAD",kind:"RENT_TRUST_OWNER_STATEMENT",status:issues.length?"HOLD":"PREVIEW_READY_FOR_INTERNAL_REVIEW",issues:[...new Set(issues)],excluded,properties,totals,availableForOwner:false,sendAllowed:false,postingAllowed:false,note:"Read-only. Deposit trust is separate; draft fee invoice is not settled trust-transfer evidence."};
}
export function renderStatementMarkdown(statement){
 const t=statement.totals;
 const format=Object.entries(t).map(([k,v])=>"| "+k+" | $"+money(v)+" |").join("\n");
 const lines=statement.properties.map(p=>"| "+p.propertyId+" | $"+money(p.openingCents)+" | $"+money(p.rentCents)+" | $"+money(p.feesAndGstCents)+" | $"+money(p.ownerExpensesCents)+" | $"+money(p.payoutsCents)+" | $"+money(p.closingCents)+" |").join("\n");
 return "# INTERNAL PREVIEW ONLY — NOT FOR OWNER DISTRIBUTION\n\nOwner ID: "+statement.ownerId+"  \nPeriod: "+statement.period+"  \nCurrency: CAD  \nGate: "+statement.status+"\n\n## By property\n| Property | Opening | Collected rent | Fees incl GST | Expenses | Payouts | Closing |\n|---|---:|---:|---:|---:|---:|---:|\n"+lines+"\n\n## Consolidated balances\n| Category | Amount |\n|---|---:|\n"+format+"\n\n## Review controls\n"+(statement.issues.length?statement.issues.join("; "):"Passed for internal review only")+"\n\nNo deposits, trust transfers, invoice postings, or payment instructions are included.\n";
}