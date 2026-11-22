import assert from 'node:assert/strict';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {RentArrearsPreviewStore} from './rent_arrears_store.mjs';
if(process.env.IRIS_TEST_DB_DISPOSABLE!=='true'||!process.env.IRIS_TEST_DATABASE_URL)throw Error('DISPOSABLE_DATABASE_REQUIRED');
const pool=new pg.Pool({connectionString:process.env.IRIS_TEST_DATABASE_URL,max:16});
const obligation={obligationKey:'lease1|2027-01|invoice1',leaseId:'L_AR',tenantId:'T_AR',propertyId:'P_AR',
 period:'2027-01',invoiceOrRentPlanRef:'invoice1',snapshotRef:'approved-snapshot-1',
 verified:true,balanceApproved:true,snapshotFinalized:true,previousReceiptIdsVerified:true,
 priorCreditsCents:0,previousReceiptIds:[],rentDueCents:10000,priorClearedCents:0};
const receipt={bankTransactionId:'bank-ar-1',booksEvidenceId:'books-ar-1',bankEvidenceId:'RBC-ar-1',
 leaseId:'L_AR',tenantId:'T_AR',propertyId:'P_AR',pool:'RENT',status:'CLEARED',bankVerified:true,
 booksVerified:true,bankMappingApproved:true,tenantLeaseIdentityVerified:true,ownershipApproved:true,
 booksBankAccountId:'rent-id',amountCents:6000,clearedAt:'2026-11-21'};
const ownership=[{ownerId:'A',propertyId:'P_AR',ownershipSnapshotId:'S_AR',basisPoints:6000,verified:true},
 {ownerId:'B',propertyId:'P_AR',ownershipSnapshotId:'S_AR',basisPoints:4000,verified:true}];
const input=r=>({receipt:r,ownership,approvedBankAccountId:'rent-id',obligation});
try{
 const info=await pool.query('SELECT current_database() db');assert.equal(info.rows[0].db,'iris_trust_ephemeral_test');
 await pool.query(await readFile(new URL('./rent_arrears_schema.sql',import.meta.url),'utf8'));
 const store=new RentArrearsPreviewStore({pool,actorId:'test-worker'});
 assert.equal((await store.registerObligation(obligation)).status,'OBLIGATION_PREVIEW_REGISTERED');
 assert.equal((await store.registerObligation(obligation)).status,'OBLIGATION_PREVIEW_REGISTERED');
 assert.equal((await store.registerObligation({...obligation,snapshotRef:'changed'})).status,'HOLD');
 const outcomes=await Promise.all(Array.from({length:4},()=>store.reserveReceipt(input(receipt))));
 assert(outcomes.every(x=>x.status==='PREVIEW_STORED'));
 assert.equal(outcomes.filter(x=>!x.duplicate).length,1);
 const conflict=await store.reserveReceipt(input({...receipt,amountCents:6001}));
 assert.equal(conflict.status,'HELD_EXCEPTION');assert.equal(conflict.reason,'DUPLICATE_RECEIPT');
 const r2={...receipt,bankTransactionId:'bank-ar-2',booksEvidenceId:'books-ar-2',bankEvidenceId:'RBC-ar-2',amountCents:4000};
 const r3={...receipt,bankTransactionId:'bank-ar-3',booksEvidenceId:'books-ar-3',bankEvidenceId:'RBC-ar-3',amountCents:4000};
 const competing=await Promise.all([store.reserveReceipt(input(r2)),store.reserveReceipt(input(r3))]);
 assert.equal(competing.filter(x=>x.status==='PREVIEW_STORED').length,1);
 assert.equal(competing.filter(x=>x.status==='HELD_EXCEPTION').length,1);
 const current=await store.readArrearsPreview({obligationKey:obligation.obligationKey});
 assert.equal(current.status,'READ_ONLY_ARREARS_FORECAST');
 assert.equal(current.verifiedHistoricalOutstandingCents,10000); // previews DO NOT pay rent
 assert.equal(current.reservedPreviewCents,10000);
 assert.equal(current.forecastUnreservedCents,0);
 const res=await pool.query('SELECT COALESCE(SUM(amount_cents),0)::bigint amount FROM iris_rent_receipt_reservations WHERE obligation_key=$1',[obligation.obligationKey]);
 assert.equal(Number(res.rows[0].amount),10000);
 const fake=await store.reserveReceipt(input({...receipt,bankTransactionId:'bank-overpay-4',bankEvidenceId:'RBC-ar-4',booksEvidenceId:'books-ar-4',amountCents:1}));
 assert.equal(fake.status,'HELD_EXCEPTION');
 assert.equal(fake.reason,'OVERPAYMENT_UNAPPLIED');
 const none=await pool.query("SELECT COUNT(*)::int n FROM iris_trust_event_previews WHERE source_id='bank-overpay-4'");
 assert.equal(none.rows[0].n,0);
 const ex=await store.recordException({bankTransactionId:'NSF-ID',obligationKey:obligation.obligationKey,reasonCode:'NSF_REVIEW',evidenceReference:'verified-nsf-statement',sourceFingerprint:'a'.repeat(64)});
 assert.equal(ex.status,'HELD_EXCEPTION');
 const duplicate=await store.recordException({bankTransactionId:'NSF-ID',obligationKey:obligation.obligationKey,reasonCode:'NSF_REVIEW',evidenceReference:'verified-nsf-statement',sourceFingerprint:'a'.repeat(64)});
 assert.equal(duplicate.caseId,ex.caseId);
 await assert.rejects(()=>store.reviewException({caseId:ex.caseId,reviewerId:'test-worker',evidenceReference:'yes',decision:'REVIEWED'}));
 const done=await store.reviewException({caseId:ex.caseId,reviewerId:'finance-reviewer',evidenceReference:'yes',decision:'REVIEWED'});
 assert.equal(done.status,'REVIEWED');assert.equal(done.postingAllowed,false);
 const signed=await pool.query('SELECT review_evidence_reference FROM iris_rent_payment_exception_cases WHERE case_id=$1',[ex.caseId]);
 assert.equal(signed.rows[0].review_evidence_reference,'yes');
 await assert.rejects(()=>store.reviewException({caseId:ex.caseId,reviewerId:'finance-reviewer',evidenceReference:'yes',decision:'REVIEWED'}));
 const history=await pool.query("SELECT COUNT(*)::int n FROM iris_rent_payment_exception_audit WHERE case_id=$1",[ex.caseId]);
 assert.equal(history.rows[0].n,3);
 await assert.rejects(()=>pool.query('DELETE FROM iris_rent_receipt_reservations'));
 await assert.rejects(()=>pool.query('UPDATE iris_rent_payment_exception_audit SET actor_id=$1',['tampered']));
 const protectedTable=await pool.query("SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename IN ('iris_rent_obligation_previews','iris_rent_receipt_reservations','iris_rent_payment_exception_cases','iris_rent_payment_exception_audit')");
 assert.equal(protectedTable.rows.length,4);assert(protectedTable.rows.every(x=>x.rowsecurity));
 console.log('Rent arrears/exception PostgreSQL tests passed: concurrent distinct payments serialized, no stale over-allocation, NSF queue dedupe and independent audit; no posting');
}finally{await pool.end()}
