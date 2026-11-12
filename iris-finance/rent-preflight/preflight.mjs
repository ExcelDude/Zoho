/**
 * Iris January rent preflight — read-only, zero network, no billing.
 * Input: JSON snapshot {properties,leases,owners,tenants,property_ownership}.
 * Does NOT validate fee agreements, rent due-day, CRM→Books UUID crosswalk,
 * opening trust balances or bank account identity. NEVER emits approved charges.
 */
export function evaluate(snapshot, period="2027-01") {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new Error("Invalid YYYY-MM period");
  const monthStart=period+"-01";
  const properties=new Map(snapshot.properties.map(x=>[x.id,x]));
  const tenants=new Set(snapshot.tenants.map(x=>x.id));
  const owners=new Set(snapshot.owners.map(x=>x.id));
  const owned=new Map();
  for(const o of snapshot.property_ownership){
    if(!owned.has(o.property_id))owned.set(o.property_id,[]);
    owned.get(o.property_id).push(o);
  }
  const seen=new Set();
  return snapshot.leases.map(l=>{
    const reasons=[];
    const p=properties.get(l.property_id);
    const allocations=owned.get(l.property_id)||[];
    if(l.status!=="active")reasons.push("LEASE_NOT_ACTIVE");
    if(!l.start_date||l.start_date>monthStart||(l.end_date&&l.end_date<monthStart))reasons.push("OUTSIDE_EFFECTIVE_DATE");
    if(!p)reasons.push("PROPERTY_NOT_FOUND");
    if(p&&p.management_status!=="active")reasons.push("PROPERTY_NOT_MANAGED");
    if(!tenants.has(l.tenant_id))reasons.push("TENANT_NOT_FOUND");
    if(!allocations.length)reasons.push("MISSING_OWNERSHIP");
    if(allocations.some(o=>!owners.has(o.owner_id)))reasons.push("OWNER_REFERENCE_NOT_FOUND");
    if(allocations.length&&Math.abs(allocations.reduce((sum,o)=>sum+Number(o.ownership_percentage),0)-100)>0.0001)
      reasons.push("OWNERSHIP_PERCENT_NOT_100");
    const gross=Number(l.rent_amount);
    if(!Number.isFinite(gross)||gross<=0)reasons.push("INVALID_RENT_AMOUNT");
    const key=[period,l.id].join("|");
    if(seen.has(key))reasons.push("DUPLICATE_LEASE_ID");
    seen.add(key);
    // Status-only screen: cannot clear financial prerequisites with current read-only API.
    const provisional=reasons.length===0;
    return {
      period,lease_id:l.id,property_id:l.property_id,tenant_id:l.tenant_id,
      property_name:p?.name||"",rent_amount_cad:gross,ownership_rows:allocations.length,
      status:provisional?"PROVISIONAL":"BLOCKED",reasons,
      financial_posting_allowed:false,
      missing_finance_approvals:[
        "SIGNED_RENT_DUE_DATE_AND_FREQUENCY",
        "PMS_TO_CRM_TO_BOOKS_IDENTITY_LINK",
        "OWNER_ENTITLEMENT_AND_EFFECTIVE_OWNERSHIP",
        "APPROVED_RENT_ACCOUNTING_AND_TAX_TREATMENT"
      ],
      idempotency_reference:period+"|"+l.id+"|RENT_CHARGE",
    };
  });
}
export function summarize(rows){
 const current=rows.filter(x=>x.status!=="BLOCKED"||!x.reasons.includes("LEASE_NOT_ACTIVE"));
 const provisional=current.filter(x=>x.status==="PROVISIONAL");
 const missing=current.filter(x=>x.reasons.includes("MISSING_OWNERSHIP")&&!x.reasons.includes("OUTSIDE_EFFECTIVE_DATE")&&!x.reasons.includes("PROPERTY_NOT_MANAGED"));
 return {considered:current.length,provisional:provisional.length,provisional_monthly_rent_cad:Math.round(provisional.reduce((s,x)=>s+x.rent_amount_cad,0)*100)/100,
 blocked:current.length-provisional.length,missing_ownership_effective:missing.length,missing_ownership_monthly_rent_cad:Math.round(missing.reduce((s,x)=>s+x.rent_amount_cad,0)*100)/100,financial_posting_allowed:false};
}