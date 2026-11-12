import assert from "node:assert/strict";
import {evaluate,summarize} from "./preflight.mjs";
const id=(x)=>"id-"+x;
const sample={
 properties:[{id:id("p"),name:"Test Property",management_status:"active"}],
 tenants:[{id:id("t")}],owners:[{id:id("o")}],
 property_ownership:[{property_id:id("p"),owner_id:id("o"),ownership_percentage:"100"}],
 leases:[{id:id("l"),property_id:id("p"),tenant_id:id("t"),status:"active",start_date:"2026-12-01",end_date:"2027-12-31",rent_amount:"3000.00"}]
};
const test=(mutate,reason)=>{let s=structuredClone(sample);mutate(s);let r=evaluate(s)[0];assert(r.reasons.includes(reason),reason);assert(!r.financial_posting_allowed);};
assert.equal(evaluate(sample)[0].status,"PROVISIONAL");
assert.equal(summarize(evaluate(sample)).provisional_monthly_rent_cad,3000);
test(s=>s.leases[0].status="terminated","LEASE_NOT_ACTIVE");
test(s=>s.leases[0].start_date="2027-02-01","OUTSIDE_EFFECTIVE_DATE");
test(s=>s.leases[0].end_date="2026-12-31","OUTSIDE_EFFECTIVE_DATE");
test(s=>s.properties[0].management_status="archived","PROPERTY_NOT_MANAGED");
test(s=>s.properties=[],"PROPERTY_NOT_FOUND");
test(s=>s.tenants=[],"TENANT_NOT_FOUND");
test(s=>s.property_ownership=[],"MISSING_OWNERSHIP");
test(s=>s.owners=[],"OWNER_REFERENCE_NOT_FOUND");
test(s=>s.property_ownership[0].ownership_percentage="75","OWNERSHIP_PERCENT_NOT_100");
test(s=>s.leases[0].rent_amount="-3","INVALID_RENT_AMOUNT");
let duplicate=structuredClone(sample);duplicate.leases.push({...duplicate.leases[0]});
assert(evaluate(duplicate)[1].reasons.includes("DUPLICATE_LEASE_ID"));
let multi=structuredClone(sample);multi.owners.push({id:id("other")});multi.property_ownership=[{property_id:id("p"),owner_id:id("o"),ownership_percentage:"60"},{property_id:id("p"),owner_id:id("other"),ownership_percentage:"40"}];
assert.equal(evaluate(multi)[0].status,"PROVISIONAL");
assert.equal(evaluate(sample)[0].financial_posting_allowed,false);
assert.throws(()=>evaluate(sample,"bad"),/Invalid YYYY-MM/);
console.log("15 rent preflight checks passed; no transaction posting.");
