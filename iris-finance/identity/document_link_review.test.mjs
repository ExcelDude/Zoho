import assert from 'node:assert/strict';
import {assessDocumentReferences,normalizedStreet} from './document_link_review.mjs';
assert.equal(normalizedStreet('102-595 Pandora Ave'),'595 pandora ave');
assert.equal(normalizedStreet('201 - 1975 Lee Avenue'),'1975 lee ave');
const owners=[{id:'O1',name:'Amy Chan'},{id:'O2',name:'Ben Smith'}];
const properties=[{id:'P1',address_line1:'595 Pandora Avenue'},{id:'P2',address_line1:'595 Pandora Avenue'},{id:'P3',address_line1:'123 Yates Street'}];
const ownershipLinks=[{property_id:'P1',owner_id:'O1'},{property_id:'P2',owner_id:'O2'},{property_id:'P3',owner_id:'O1'}];
const docs=[{file_id:'F1',owner_name:'Amy Chan',property_folder:'102-595 Pandora Ave',agreement_type:'Management'},
{file_id:'F2',owner_name:'Nobody',property_folder:'595 Pandora Ave'},
{file_id:'F3',owner_name:'Amy Chan',property_folder:'999 Yates Street'},
{file_id:'F4',owner_name:'Amy Chan',property_folder:'123 Yates St'}];
const r=assessDocumentReferences({owners,properties,ownershipLinks,documents:docs});
assert.equal(r.total,4);
assert.equal(r.results[0].classification,'PROPERTY_ADDRESS_AMBIGUOUS_REVIEW');
assert.equal(r.results[0].propertyId,'P1');
assert.equal(r.results[1].classification,'OWNER_NAME_UNRESOLVED');
assert.equal(r.results[2].classification,'PROPERTY_FOLDER_UNRESOLVED');
assert.equal(r.results[3].classification,'OWNER_AND_PROPERTY_UNIQUE_REFERENCE');
assert.equal(r.results[3].feeTermsApproved,false);
assert.equal(r.booksWrites,0);
assert.throws(()=>assessDocumentReferences({owners,properties,ownershipLinks,documents:[docs[0],docs[0]]}),/INVALID_DOCUMENT_REFERENCES/);
assert.throws(()=>assessDocumentReferences({owners,properties,ownershipLinks:[{property_id:'P8',owner_id:'O1'}],documents:[]}),/BROKEN_PROPERTY/);
console.log('Document reference safety checks passed');
