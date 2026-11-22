import assert from 'node:assert/strict';
import pg from 'pg';
import {readFile,writeFile} from 'node:fs/promises';
import {exportDepositPreviewEvidence} from './deposit_preview_export.mjs';
if(process.env.IRIS_TEST_DB_DISPOSABLE!=='true'||!process.env.IRIS_TEST_DATABASE_URL)throw Error('EPHEMERAL_DB_REQUIRED');
const pool=new pg.Pool({connectionString:process.env.IRIS_TEST_DATABASE_URL});
try{
 const d=await pool.query('select current_database() as name');assert.equal(d.rows[0].name,'iris_trust_ephemeral_test');
 // The prior job loads the schema; source events here are synthetic only.
 await pool.query(`INSERT INTO iris_trust_event_previews(event_key,organization_id,pool,event_type,source_system,
 source_id,source_version,event_date,amount_cents,principal_id,property_id,payload_hash)
 VALUES($1,'110003520057','DEPOSIT','DEPOSIT_RECEIPT','CI','deposit-1','1','2026-12-10',45000,'tenant-A','property-A',$2)`,
 ['deposit-ci-1','a'.repeat(64)]);
 const s=await exportDepositPreviewEvidence({db:pool,cutoff:'2026-12-31'});
 assert.equal(s.pool,'DEPOSIT');assert.equal(s.events.length,1);
 assert.equal(s.events[0].amount_cents,45000);
 assert.equal(s.events[0].deposit_classification,'UNVERIFIED');
 assert.equal(s.events[0].posted_liability_cents,null);
 assert.equal(s.tenant_subledger_verified,false);
 assert.equal(s.reconciliation_certified,false);
 assert.equal((await exportDepositPreviewEvidence({db:pool,cutoff:'2026-12-01'})).events.length,0);
 await assert.rejects(()=>exportDepositPreviewEvidence({db:pool,cutoff:'2026-02-30'}));
 await assert.rejects(()=>exportDepositPreviewEvidence({db:pool,organizationId:'other',cutoff:'2026-12-31'}));
 if(process.env.IRIS_TEST_DEPOSIT_EXPORT_PATH)await writeFile(process.env.IRIS_TEST_DEPOSIT_EXPORT_PATH,JSON.stringify(s),'utf8');
 console.log('Deposit preview SELECT-only export passed, no tenant liability certification');
}finally{await pool.end()}
