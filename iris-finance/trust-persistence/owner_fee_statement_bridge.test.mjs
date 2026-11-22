import assert from 'node:assert/strict';
import {previewOwnerFeeStatements} from './owner_fee_statement_bridge.mjs';
const receipt={bankTransactionId:'bankA',booksEvidenceId:'booksA',bankEvidenceId:'rbcA',leaseId:'L1',tenantId:'T1',propertyId:'P1',
 amountCents:250001,status:'CLEARED',pool:'RENT',bankVerified:true,booksVerified:true,bankMappingApproved:true,tenantLeaseIdentityVerified:true,
 ownershipApproved:true,booksBankAccountId:'rent',clearedAt:'2026-11-11'};
const ownership=[{ownerId:'A',propertyId:'P1',ownershipSnapshotId:'S1',basisPoints:6000,verified:true},
 {ownerId:'B',propertyId:'P1',ownershipSnapshotId:'S1',basisPoints:4000,verified:true}];
const agreements=ownership.map(o=>({ownerId:o.ownerId,propertyId:'P1',ownershipSnapshotId:'S1',signed:true,
 agreementId:'ag-'+o.ownerId,version:'4.0',effectiveFrom:'2026-01-01',type:'UNFURNISHED_V4',
 gstRateBps:500,gstApproved:true,nonresident:false}));
const accounting={reconciledCashEvidence:true,booksReceiptReadback:true,actualCollectedNotPreview:true,
 ownershipLegalIdentityVerified:true,taxRateApproved:true,statementPeriodApproved:true};
const input={receipt,ownership,agreements,approvedBankAccountId:'rent',accounting};
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++};
const r=previewOwnerFeeStatements(input);
eq(r.status,'INTERNAL_FEE_AND_STATEMENT_PREVIEW');eq(r.payoutCyclePeriod,'2026-12');
eq(r.owners.map(x=>x.collectedReceiptShareCents),[150001,100000]);
eq(r.owners.map(x=>x.managementFeeQuoteCents),[15000,10000]);
eq(r.owners.map(x=>x.feeGstQuoteCents),[750,500]);
eq(r.totals.collectedReceiptCents,250001);eq(r.postingAllowed,false);eq(r.publishAllowed,false);
eq(previewOwnerFeeStatements({...input,receipt:{...receipt,clearedAt:'2026-11-10'}}).payoutCyclePeriod,'2026-11');
eq(previewOwnerFeeStatements({...input,receipt:{...receipt,amountCents:120000}}).totals.managementFeeQuoteCents,12000);
eq(previewOwnerFeeStatements({...input,accounting:{...accounting,actualCollectedNotPreview:false}}).status,'HOLD');
eq(previewOwnerFeeStatements({...input,agreements:[agreements[0]]}).status,'HOLD');
eq(previewOwnerFeeStatements({...input,agreements:[agreements[0],{...agreements[1],signed:false}]}).status,'HOLD');
eq(previewOwnerFeeStatements({...input,agreements:[agreements[0],{...agreements[1],type:'LEGACY'}]}).status,'HOLD');
eq(previewOwnerFeeStatements({...input,agreements:[agreements[0],{...agreements[1],type:'PLACEMENT_V1'}]}).owners[1].managementFeeQuoteCents,0);
eq(previewOwnerFeeStatements({...input,agreements:[agreements[0],{...agreements[1],nonresident:true,craWithholdingApproved:true}]}).owners[1].nonresidentWithholdingQuoteCents,25000);
eq(previewOwnerFeeStatements({...input,agreements:[agreements[0],{...agreements[1],nonresident:true}]}).status,'HOLD');
eq(previewOwnerFeeStatements({...input,agreements:[agreements[0],{...agreements[1],gstApproved:false}]}).status,'HOLD');
eq(previewOwnerFeeStatements({...input,ownership:[ownership[0],{...ownership[1],basisPoints:5000}]}).status,'HOLD');
eq(previewOwnerFeeStatements({...input,receipt:{...receipt,status:'PENDING'}}).status,'HOLD');
eq(previewOwnerFeeStatements({...input,receipt:{...receipt,clearedAt:'2026-12-01'}}).payoutCyclePeriod,'2026-12');
console.log('Owner fee and statement bridge assertions passed: '+n+'; no financial transactions');
