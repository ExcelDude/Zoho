import assert from 'node:assert/strict';
import {proposeOwnerCrosswalk,buildAgreementRegistry} from './owner_registry.mjs';
const books=[{contact_id:'B1',contact_name:'Alex Smith',email:'alex@example.org'},{contact_id:'B2',contact_name:'Jane Example',email:'jane@example.org'},{contact_id:'B3',contact_name:'Conflict Name',email:'p@example.org'}];
const owners=[{id:'O1',name:'Alex Smith',email:'alex@example.org'},{id:'O2',name:'Jane E',email:'jane@example.org'},{id:'O3',name:'Nobody',email:'none@example.org'},
{id:'O4',name:'Conflict Name',email:'different@example.org'},{id:'O5',name:'Other Name',email:'p@example.org'}];
let x=proposeOwnerCrosswalk({irisOwners:owners,booksContacts:books});
assert.equal(x.count,5);assert.equal(x.summary.exactNameEmail,1);assert.equal(x.summary.emailOnlyReview,2);assert.equal(x.summary.nameOnlyReview,1);assert.equal(x.summary.unmatched,1);
assert.equal(x.autoApplied,0);assert.equal(x.results[0].status,'HIGH_CONFIDENCE_REVIEW');
assert.equal(proposeOwnerCrosswalk({irisOwners:[owners[0]],booksContacts:books,approvedLinks:[{irisOwnerId:'O1',booksContactId:'B1',sourceEvidenceId:'E1',reviewedBy:'MJ',approvedAt:'2026-11-18'}]}).summary.approved,1);
assert.throws(()=>proposeOwnerCrosswalk({irisOwners:[owners[0],owners[0]],booksContacts:books}),/DUPLICATE/);
const duplicated=proposeOwnerCrosswalk({irisOwners:[owners[0],{id:'O6',name:'Alex Smith',email:'alex@example.org'}],booksContacts:books});
assert.equal(duplicated.results[0].status,'COLLISION_REVIEW');
const agr=buildAgreementRegistry({owners,properties:[{id:'P1'}],propertyOwnership:[{property_id:'P1',owner_id:'O1'}],
 managementAgreements:[{id:'A1',property_id:'P1',owner_id:null,agreement_type:'Management',file_name:'signed.pdf'}],
 workdriveAgreements:[{file_id:'F1',owner_name:'Alex Smith',property_folder:'P1',file_name:'agreement.pdf'}]});
assert.equal(agr.count,2);assert.equal(agr.registry[0].ownerId,'O1');assert.equal(agr.registry[1].ownerId,'O1');assert.equal(agr.feeRatesExtracted,0);
assert.equal(agr.registry[0].signedVerified,false);assert.equal(agr.registry[1].feeRateApproved,false);
const ambiguous=buildAgreementRegistry({owners,properties:[{id:'P1'}],propertyOwnership:[{property_id:'P1',owner_id:'O1'},{property_id:'P1',owner_id:'O2'}],managementAgreements:[{id:'A',property_id:'P1'}],workdriveAgreements:[]});
assert.equal(ambiguous.registry[0].status,'REVIEW');
console.log('Owner crosswalk and agreement reference checks passed — no writes');
