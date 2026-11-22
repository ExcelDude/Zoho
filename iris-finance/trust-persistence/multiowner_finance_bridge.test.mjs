import assert from 'node:assert/strict';
import {persistMultiOwnerFinanceReceipt} from './multiowner_finance_bridge.mjs';
const source={type:'RENT_PAYMENT_SETTLED',sourceSystem:'iris',sourceId:'L1',sourceVersion:'v1',organizationId:'110003520057',occurredAt:'2026-11-21T12:00:00Z',payload:{tenantId:'T1',propertyId:'P1'}};
const controls={sourceDataVerified:true,ownerOrTenantIdentityVerified:true,periodEligible:true,reviewedApproval:true,sourceSnapshotComplete:true,booksBankEvidenceVerified:true};
const receipt={leaseId:'L1',tenantId:'T1',propertyId:'P1',booksBankAccountId:'B1'};
const ownership=[{ownerId:'O1'}];
let calls=0;const store={ingest:async()=>{calls++;return {status:'PREVIEW_STORED',eventKey:'k1',duplicate:false,allocationCount:2}}};
const input={source,controls,receipt,ownership,approvedBankAccountId:'B1',store};
assert.equal((await persistMultiOwnerFinanceReceipt(input)).status,'PREVIEW_STORED');assert.equal(calls,1);
for(const obj of [
 {...input,source:{...source,type:'RENT_CYCLE_DUE',accountingPeriod:'2027-01'}},
 {...input,source:{...source,organizationId:'wrong'}},
 {...input,controls:{...controls,booksBankEvidenceVerified:false}},
 {...input,receipt:{...receipt,leaseId:'other'}},
 {...input,receipt:{...receipt,tenantId:'other'}},
 {...input,receipt:{...receipt,propertyId:'other'}},
 {...input,ownership:[]},
 {...input,approvedBankAccountId:'other'},
]) {const x=await persistMultiOwnerFinanceReceipt(obj);assert.notEqual(x.status,'PREVIEW_STORED')}
assert.equal(calls,1);
console.log('Finance source to multi-owner receipt bridge guardrails passed; only verified route persists preview');
