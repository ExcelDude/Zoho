import assert from 'node:assert/strict';import {runJanuaryDryRun} from './january_runner.mjs';
const data={leases:[{id:'L1',property_id:'P1',tenant_id:'T1',start_date:'2026-12-01',end_date:'2027-06-01',rent_amount:'3000.00',status:'active'}],
 properties:[{id:'P1',management_status:'active'}],property_ownership:[{property_id:'P1',owner_id:'O1',ownership_percentage:100}]};
class Store{
 constructor(){this.rows=new Map();this.n=0}
 async insertOrGet(e){const old=this.rows.get(e.eventKey);if(old)return {...old,wasExisting:true};const value={...e,status:'RECEIVED'};this.rows.set(e.eventKey,value);return {...value,wasExisting:false}}
 async claim(key){const x=this.rows.get(key);if(!x||x.status!=='RECEIVED')return{acquired:false,reason:'DUPLICATE'};x.status='PROCESSING';x.token='t'+(++this.n);return{acquired:true,token:x.token,event:x}}
 async complete(key,token,status,p){const x=this.rows.get(key);assert.equal(x.token,token);x.status=status;x.projection=p}
 async quarantine(key){this.rows.get(key).status='QUARANTINED'}
}
const listRecords=async({resource,offset})=>({resource,offset,count:data[resource].length,has_more:false,data:data[resource]});
const allTrue={sourceDataVerified:true,ownerOrTenantIdentityVerified:true,periodEligible:true,reviewedApproval:true,sourceSnapshotComplete:true,independentIdentityEvidence:true,rentChargePolicyApproved:true};
const result=await runJanuaryDryRun({listRecords,store:new Store(),snapshotAt:'2026-11-16T09:00:00Z',controlsForCandidate:()=>({})});
assert.equal(result.rentCandidates,1);assert.equal(result.scheduledRentCents,300000);assert.equal(result.blocked,1);assert.equal(result.financialWrites,0);
const noIdentity=await runJanuaryDryRun({listRecords,store:new Store(),snapshotAt:'2026-11-16T09:00:00Z',controlsForCandidate:()=>({...allTrue,independentIdentityEvidence:false})});
assert.equal(noIdentity.blocked,1);
const noPolicy=await runJanuaryDryRun({listRecords,store:new Store(),snapshotAt:'2026-11-16T09:00:00Z',controlsForCandidate:()=>({...allTrue,rentChargePolicyApproved:false})});
assert.equal(noPolicy.blocked,1);
const authorizedPreview=await runJanuaryDryRun({listRecords,store:new Store(),snapshotAt:'2026-11-16T09:00:00Z',controlsForCandidate:()=>allTrue});
assert.equal(authorizedPreview.previews,1);assert.equal(authorizedPreview.financialWrites,0);
data.property_ownership=[];const missingJoin=await runJanuaryDryRun({listRecords,store:new Store(),snapshotAt:'2026-11-16T09:00:00Z',controlsForCandidate:()=>allTrue});assert.equal(missingJoin.blocked,1);
console.log('January runner dry-run boundary checks passed; zero actual Books writes');
