import assert from 'node:assert/strict';
import test from 'node:test';
import {assessOwnershipForFinance} from './ownership_finance_gate.mjs';
const id='iris-1';
const good=()=>({
 property:{id,management_status:'active',is_active:false},
 unitCrosswalks:[{iris_property_id:id,propra_property_id:'building-1',propra_unit_id:'unit-1',propra_owner_id:'owner-p',unit_number:'310',approval:'APPROVED',evidence_ref:'signed-unit-proof'}],
 ownership:[{property_id:id,owner_id:'owner-i',basis_points:10000,approval:'APPROVED',evidence_ref:'signed-title'}],
 ownerCrosswalks:[{iris_owner_id:'owner-i',propra_owner_id:'owner-p',approval:'APPROVED',evidence_ref:'verified-crosswalk'}]
});
test('approved identity is only a preview, never permission to post',()=>{
 const result=assessOwnershipForFinance(good());
 assert.equal(result.status,'IDENTITY_REVIEW_PASSED');
 assert.equal(result.postingAllowed,false);
 assert.equal(result.payoutAllowed,false);
});
test('website is_active=false does not override management_status',()=>{
 assert.deepEqual(assessOwnershipForFinance(good()).issues,[]);
});
test('unapproved unit and owner candidates are held',()=>{
 const x=good();x.unitCrosswalks[0].approval='NOT APPROVED';x.ownerCrosswalks[0].approval='NOT APPROVED';
 const result=assessOwnershipForFinance(x);
 assert.equal(result.status,'HOLD');
 assert.ok(result.issues.includes('UNIT_MAPPING_UNAPPROVED'));
 assert.ok(result.issues.includes('OWNER_IDENTITY_NOT_APPROVED'));
});
test('missing unit identity is held even when building address matches',()=>{
 const x=good();x.unitCrosswalks=[];
 assert.ok(assessOwnershipForFinance(x).issues.includes('MISSING_UNIT_MAPPING'));
});
test('wrong Propra owner is a conflict, not an automatic overwrite',()=>{
 const x=good();x.unitCrosswalks[0].propra_owner_id='different';
 assert.ok(assessOwnershipForFinance(x).issues.includes('UNIT_OWNER_IDENTITY_CONFLICT'));
});
test('two units for one Iris property are ambiguous',()=>{
 const x=good();x.unitCrosswalks.push({...x.unitCrosswalks[0],propra_unit_id:'unit-2'});
 assert.ok(assessOwnershipForFinance(x).issues.includes('AMBIGUOUS_UNIT_MAPPING'));
});
test('60/40 approved joint ownership is valid for identity preview',()=>{
 const x=good();x.ownership=[{...x.ownership[0],basis_points:6000},{property_id:id,owner_id:'owner-i-2',basis_points:4000,approval:'APPROVED',evidence_ref:'signed-title'}];
 x.ownerCrosswalks.push({iris_owner_id:'owner-i-2',propra_owner_id:'owner-p',approval:'APPROVED',evidence_ref:'verified-crosswalk'});
 assert.equal(assessOwnershipForFinance(x).status,'IDENTITY_REVIEW_PASSED');
});
test('incomplete joint ownership holds finance',()=>{
 const x=good();x.ownership[0].basis_points=6000;
 assert.ok(assessOwnershipForFinance(x).issues.includes('OWNERSHIP_NOT_100_PERCENT'));
});
test('archived management is held even when website is public',()=>{
 const x=good();x.property.management_status='archived';x.property.is_active=true;
 assert.ok(assessOwnershipForFinance(x).issues.includes('NOT_ACTIVE_MANAGEMENT'));
});
