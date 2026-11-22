/**
 * Real PostgreSQL staging tests. Runs ONLY against an isolated ephemeral database.
 * Refuses execution unless IRIS_TEST_DB_DISPOSABLE is explicitly true.
 * No Iris production database URLs or credentials are accessed.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {TrustEventStore} from './trust_event_store.mjs';

if(process.env.IRIS_TEST_DB_DISPOSABLE!=='true')throw Error('DISPOSABLE_TEST_DB_REQUIRED');
if(!process.env.IRIS_TEST_DATABASE_URL)throw Error('TEST_DATABASE_URL_REQUIRED');
const {Pool}=pg;
const pool=new Pool({connectionString:process.env.IRIS_TEST_DATABASE_URL,max:12});
let count=0;
const check=(value,expected)=>{assert.deepEqual(value,expected);count++};
const rejects=async(fn)=>{await assert.rejects(fn);count++};
const original={organizationId:'110003520057',pool:'RENT',eventType:'RENT_RECEIPT',
 sourceSystem:'IRIS_STAGING',sourceId:'lease-A',sourceVersion:'1',eventDate:'2026-11-21',
 amountCents:125000,principalId:'owner-A',propertyId:'property-A'};
try{
 const info=await pool.query('select current_database() as db, current_user as u');
 if(info.rows[0].db!=='iris_trust_ephemeral_test')throw Error('REFUSE_NON_EPHEMERAL_DATABASE');
 const schema=await readFile(new URL('./schema.sql',import.meta.url),'utf8');
 await pool.query(schema);
 let tables=await pool.query(`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'iris_trust_%' ORDER BY tablename`);
 check(tables.rowCount,3);
 check(tables.rows.every(x=>x.rowsecurity),true);
 const store=new TrustEventStore({pool,actorId:'ingest-worker'});
 const [a,b,c,d]=await Promise.all(Array.from({length:4},()=>store.ingest(original)));
 check([a,b,c,d].filter(x=>!x.duplicate).length,1);
 check([a,b,c,d].every(x=>x.status==='PREVIEW_STORED'),true);
 let db=await pool.query('SELECT event_key,amount_cents FROM iris_trust_event_previews');
 check(db.rowCount,1);
 check(String(db.rows[0].amount_cents),'125000');
 const [e1,e2]=await Promise.all([store.ingest({...original,amountCents:150000}),store.ingest({...original,amountCents:150000})]);
 check(e1.status,'QUARANTINED');check(e2.status,'QUARANTINED');
 let ex=await pool.query("SELECT * FROM iris_trust_exception_cases WHERE reason_code='DUPLICATE_SOURCE_CONFLICT'");
 check(ex.rowCount,1);
 let originalDb=await pool.query('SELECT amount_cents FROM iris_trust_event_previews');
 check(String(originalDb.rows[0].amount_cents),'125000');
 const id=a.eventKey;
 const [f1,f2,f3]=await Promise.all(Array.from({length:3},()=>store.openException({eventKey:id,reasonCode:'BANK_MAPPING_MISSING',sourceFingerprint:'scan-1'})));
 check(f1.caseId,f2.caseId);check(f1.caseId,f3.caseId);
 const cases=await store.listOpenExceptions();check(cases.cases.length,2);
 const outcome=await store.reviewException({caseId:f1.caseId,reviewerId:'finance-reviewer',evidenceReference:'verified-bank-mapping',decision:'REVIEWED'});
 check(outcome.status,'REVIEWED');check(outcome.postingAllowed,false);
 await rejects(()=>store.reviewException({caseId:f1.caseId,reviewerId:'finance-reviewer',evidenceReference:'review-2',decision:'REVIEWED'}));
 await rejects(()=>store.reviewException({caseId:999999,reviewerId:'reviewer',evidenceReference:'review',decision:'REVIEWED'}));
 await rejects(()=>store.openException({eventKey:'missing',reasonCode:'BANK_MAPPING_MISSING'}));
 await rejects(()=>store.ingest({...original,sourceId:'rollback-check',reversalOf:'does-not-exist',eventType:'REVERSAL'}));
 const rolled=await pool.query("SELECT event_key FROM iris_trust_event_previews WHERE source_id='rollback-check'");
 check(rolled.rowCount,0);
 await rejects(()=>pool.query("UPDATE iris_trust_event_previews SET amount_cents=1 WHERE event_key=$1",[id]));
 await rejects(()=>pool.query("DELETE FROM iris_trust_event_previews WHERE event_key=$1",[id]));
 await rejects(()=>pool.query("UPDATE iris_trust_review_audit SET actor_id='changed'"));
 const audit=await pool.query("SELECT action,actor_id FROM iris_trust_review_audit ORDER BY id");
 check(audit.rows.filter(x=>x.action==='INGEST').length,1);
 check(audit.rows.filter(x=>x.action==='REVIEWED').length,1);
 const view=await pool.query('SELECT COUNT(*)::int n FROM iris_trust_event_previews');
 check(view.rows[0].n,1);
 // A minimally privileged role cannot SELECT, INSERT or UPDATE sensitive tables.
 await pool.query("CREATE ROLE iris_trust_untrusted NOLOGIN");
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE iris_trust_untrusted');
  await rejects(()=>client.query('SELECT * FROM iris_trust_event_previews'));
  await client.query('ROLLBACK');
 }finally{client.release()}
 console.log('PostgreSQL integration scenarios passed: '+count+' checks; real transactional persistence, concurrency, RLS and immutability; zero financial posting');
}finally{await pool.end()}
