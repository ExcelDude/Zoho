import assert from 'node:assert/strict';
import pg from 'pg';
import {readFile,writeFile} from 'node:fs/promises';
import {RentArrearsPreviewStore} from './rent_arrears_store.mjs';
import {exportRentPreviewEvidence} from './reconciliation_preview_export.mjs';
if(process.env.IRIS_TEST_DB_DISPOSABLE!=='true'||!process.env.IRIS_TEST_DATABASE_URL)throw Error('DISPOSABLE_DATABASE_REQUIRED');
const pool=new pg.Pool({connectionString:process.env.IRIS_TEST_DATABASE_URL,max:8});
const owner=[{ownerId:'ownerA',propertyId:'propertyP',ownershipSnapshotId:'snapshot1',basisPoints:6000,verified:true},
 {ownerId:'ownerB',propertyId:'propertyP',ownershipSnapshotId:'snapshot1',basisPoints:4000,verified:true}];
const receipt={bankTransactionId:'txn-handoff',booksEvidenceId:'books-handoff',bankEvidenceId:'rbc-handoff',leaseId:'lease1',tenantId:'tenant1',propertyId:'propertyP',
 pool:'RENT',status:'CLEARED',bankVerified:true,booksVerified:true,bankMappingApproved:true,tenantLeaseIdentityVerified:true,
 ownershipApproved:true,booksBankAccountId:'approved-test-books-bank',amountCents:250001,clearedAt:'2026-12-12'};
const obligation={obligationKey:'lease1|2026-12',leaseId:'lease1',tenantId:'tenant1',propertyId:'propertyP',
 period:'2026-12',invoiceOrRentPlanRef:'rent-plan-1',snapshotRef:'approved-test-snapshot',
 verified:true,balanceApproved:true,snapshotFinalized:true,previousReceiptIdsVerified:true,priorCreditsCents:0,
 previousReceiptIds:[],rentDueCents:300000,priorClearedCents:0};
try{
 const current=await pool.query('SELECT current_database() db');
 assert.equal(current.rows[0].db,'iris_trust_ephemeral_test');
 await pool.query(await readFile(new URL('./rent_arrears_schema.sql',import.meta.url),'utf8'));
 const store=new RentArrearsPreviewStore({pool,actorId:'integration-tester'});
 assert.equal((await store.registerObligation(obligation)).status,'OBLIGATION_PREVIEW_REGISTERED');
 const accepted=await store.reserveReceipt({receipt,ownership:owner,approvedBankAccountId:'approved-test-books-bank',obligation});
 assert.equal(accepted.status,'PREVIEW_STORED');
 const data=await exportRentPreviewEvidence({db:pool,cutoff:'2026-12-31'});
 assert(data.events.length>=1);
 const own=data.events.filter(e=>e.bank_transaction_id==='txn-handoff');
 assert.equal(own.length,1);
 assert.equal(own[0].amount_cents,250001);
 assert.equal(own[0].allocation_total_cents,250001);
 assert.equal(own[0].allocation_count,2);
 assert.equal(data.source_kind,'UNPOSTED_PREVIEW');
 assert.equal(data.reconciliation_certified,false);
 const excluded=await exportRentPreviewEvidence({db:pool,cutoff:'2026-12-01'});
 assert.equal(excluded.events.some(e=>e.bank_transaction_id==='txn-handoff'),false);
 await assert.rejects(()=>exportRentPreviewEvidence({db:pool,cutoff:'2026-13-31'}));
 await assert.rejects(()=>exportRentPreviewEvidence({db:pool,cutoff:'2026-12-31',organizationId:'other'}));
 if(process.env.IRIS_TEST_EXPORT_PATH)await writeFile(process.env.IRIS_TEST_EXPORT_PATH,JSON.stringify(data),'utf8');
 console.log('Read-only PostgreSQL preview evidence export verified (one allocated, unposted receipt).');
}finally{await pool.end()}
