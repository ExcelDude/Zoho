/** PostgreSQL-backed durable adapter. Inject a preconfigured pg.Pool; no DB credentials here.
 * SQL schema: ./schema.sql. This file is not connected or deployed.
 */
export class PostgresEventStore {
 constructor({pool,workerId}){if(!pool?.connect||!workerId)throw Error('POOL_AND_WORKER_REQUIRED');this.pool=pool;this.workerId=workerId}
 async transaction(fn){
  const conn=await this.pool.connect();
  try{await conn.query('BEGIN');const result=await fn(conn);await conn.query('COMMIT');return result}
  catch(e){await conn.query('ROLLBACK');throw e}
  finally{conn.release()}
 }
 async insertOrGet(e){
  return this.transaction(async db=>{
   const result=await db.query(`INSERT INTO iris_finance_events
    (event_key,source_system,source_id,source_version,event_type,organization_id,occurred_at,payload_hash,payload_json)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
    ON CONFLICT (event_key) DO NOTHING RETURNING event_key`,
    [e.eventKey,e.sourceSystem,e.sourceId,e.sourceVersion,e.type,e.organizationId,e.occurredAt,e.payloadHash,JSON.stringify(e.payload)]);
   const existing=result.rowCount===0;
   const row=await db.query('SELECT event_key,payload_hash,status FROM iris_finance_events WHERE event_key=$1 FOR UPDATE',[e.eventKey]);
   if(row.rowCount!==1)throw Error('INSERT_GET_RACE');
   if(!existing)await db.query(`INSERT INTO iris_finance_event_audit(event_key,action,actor_id,details) VALUES($1,'INGEST',$2,$3::jsonb)`,
     [e.eventKey,this.workerId,JSON.stringify({sourceVersion:e.sourceVersion})]);
   return {payloadHash:row.rows[0].payload_hash,status:row.rows[0].status,wasExisting:existing};
  })
 }
 async claim(eventKey,time){
  return this.transaction(async db=>{
   const result=await db.query(`UPDATE iris_finance_events
      SET status='PROCESSING',claim_token=gen_random_uuid(),claimed_at=$2::timestamptz,attempts=attempts+1,updated_at=$2::timestamptz
      WHERE event_key=$1 AND status='RECEIVED'
      RETURNING event_key,source_system,source_id,source_version,event_type,organization_id,occurred_at,payload_hash,payload_json,claim_token`,
      [eventKey,time]);
   if(result.rowCount!==1)return {acquired:false,reason:'ALREADY_CLAIMED_OR_HANDLED'};
   const row=result.rows[0];
   await db.query(`INSERT INTO iris_finance_event_audit(event_key,action,actor_id,details) VALUES($1,'CLAIM',$2,$3::jsonb)`,
    [eventKey,this.workerId,JSON.stringify({claimToken:row.claim_token})]);
   return {acquired:true,token:row.claim_token,event:{
    eventKey:row.event_key,sourceSystem:row.source_system,sourceId:row.source_id,sourceVersion:row.source_version,
    type:row.event_type,organizationId:row.organization_id,occurredAt:row.occurred_at,
    payloadHash:row.payload_hash,payload:row.payload_json,
    plannedAction:({LEASE_ACTIVATED:'PREPARE_RENT_PLAN',LEASE_RENT_CHANGED:'REVALIDATE_RENT_PLAN',
    RENT_CYCLE_DUE:'PREPARE_RENT_DRAFT',RENT_PAYMENT_SETTLED:'RECONCILE_RECEIPT',
    OWNER_AGREEMENT_APPROVED:'REVALIDATE_FEE_RULES',OWNER_FEE_ELIGIBLE:'PREPARE_FEE_DRAFT',
    MAINTENANCE_APPROVED:'PREPARE_AP_DRAFT',BANK_RECEIPT_UNMATCHED:'OPEN_EXCEPTION',
    OWNER_STATEMENT_PREPARE:'GENERATE_STATEMENT_PREVIEW'})[row.event_type]
   }};
  })
 }
 async complete(eventKey,token,status,projection,time){
  if(!['PREVIEW_READY','HOLD'].includes(status))throw Error('INVALID_COMPLETION');
  return this.transaction(async db=>{
   const result=await db.query(`UPDATE iris_finance_events SET status=$3,result_json=$4::jsonb,
       claim_token=NULL,claimed_at=NULL,updated_at=$5::timestamptz
       WHERE event_key=$1 AND status='PROCESSING' AND claim_token=$2::uuid RETURNING event_key`,
       [eventKey,token,status,JSON.stringify(projection),time]);
   if(result.rowCount!==1)throw Error('LOST_EVENT_CLAIM');
   await db.query(`INSERT INTO iris_finance_event_audit(event_key,action,actor_id,details) VALUES($1,'COMPLETE',$2,$3::jsonb)`,
     [eventKey,this.workerId,JSON.stringify({status,payloadHash:projection.payloadHash})]);
   return {status};
  });
 }
 async quarantine(eventKey,reason){
  return this.transaction(async db=>{
   const result=await db.query(`UPDATE iris_finance_events SET status='QUARANTINED',claim_token=NULL,
       claimed_at=NULL,updated_at=now(),result_json=jsonb_build_object('reason',$2::text)
       WHERE event_key=$1 RETURNING event_key`,[eventKey,reason]);
   if(result.rowCount!==1)throw Error('EVENT_NOT_FOUND');
   await db.query(`INSERT INTO iris_finance_event_audit(event_key,action,reason_code,actor_id)
      VALUES($1,'QUARANTINE',$2,$3)`,[eventKey,reason,this.workerId]);
  });
 }
}
