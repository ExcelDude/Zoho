import {createHash} from 'node:crypto';
const TYPES=new Set(['RENT_RECEIPT','OWNER_TOP_UP','OWNER_PAYOUT','OWNER_EXPENSE','FEE_TRANSFER','UNIDENTIFIED_RECEIPT','SUSPENSE_ALLOCATION','REVERSAL','DEPOSIT_RECEIPT','DEPOSIT_REFUND']);
const REASONS=new Set(['BANK_MAPPING_MISSING','OWNER_IDENTITY_UNVERIFIED','TENANT_IDENTITY_UNVERIFIED','MISSING_SETTLEMENT','UNIDENTIFIED_FUNDS','DUPLICATE_SOURCE_CONFLICT','NEGATIVE_BALANCE','MISSING_OPENING_BALANCE','ALLOCATION_MISMATCH','TRUST_POOL_MISMATCH','RECONCILIATION_VARIANCE','ACCOUNTING_APPROVAL_MISSING','SOURCE_EVIDENCE_MISSING','REQUIRES_MANUAL_REVIEW']);
const ID=/^[A-Za-z0-9][A-Za-z0-9:_./|%-]{0,1023}$/;
const requireId=(v,n)=>{if(typeof v!=='string'||!ID.test(v))throw Error('INVALID_'+n);return v};
const safe={postingAllowed:false,bankTransferAllowed:false,payoutAllowed:false,booksWriteAllowed:false};
export function normalizeTrustEvent(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('INVALID_EVENT');
 const organizationId=requireId(raw.organizationId,'ORG');
 if(organizationId!=='110003520057')throw Error('UNKNOWN_ORGANIZATION');
 const pool=raw.pool,eventType=raw.eventType;
 if(!['RENT','DEPOSIT'].includes(pool)||!TYPES.has(eventType))throw Error('INVALID_EVENT_KIND');
 if(pool==='RENT'&&eventType.startsWith('DEPOSIT_')||pool==='DEPOSIT'&&!['DEPOSIT_RECEIPT','DEPOSIT_REFUND','REVERSAL'].includes(eventType))throw Error('CROSS_TRUST_EVENT');
 const sourceSystem=requireId(raw.sourceSystem,'SOURCE_SYSTEM'),sourceId=requireId(raw.sourceId,'SOURCE_ID'),sourceVersion=requireId(raw.sourceVersion,'VERSION');
 const eventDate=raw.eventDate;
 if(typeof eventDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)||Number.isNaN(Date.parse(eventDate))||new Date(eventDate+'T00:00:00Z').toISOString().slice(0,10)!==eventDate)throw Error('INVALID_DATE');
 const amountCents=raw.amountCents;
 if(!Number.isSafeInteger(amountCents)||amountCents<=0)throw Error('INVALID_CENTS');
 const principalId=raw.principalId==null?null:requireId(raw.principalId,'PRINCIPAL'),propertyId=raw.propertyId==null?null:requireId(raw.propertyId,'PROPERTY'),reversalOf=raw.reversalOf==null?null:requireId(raw.reversalOf,'REVERSAL');
 if(eventType==='REVERSAL'&&!reversalOf)throw Error('REVERSAL_REFERENCE_REQUIRED');
 if(eventType==='UNIDENTIFIED_RECEIPT'&&principalId)throw Error('SUSPENSE_OWNER_FORBIDDEN');
 const payload={organizationId,pool,eventType,sourceSystem,sourceId,sourceVersion,eventDate,amountCents,principalId,propertyId,reversalOf};
 const eventKey=[organizationId,pool,sourceSystem,sourceId,eventType,sourceVersion].map(encodeURIComponent).join('|');
 const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
 return {...payload,eventKey,payloadHash:hash};
}
export class TrustEventStore{
 constructor({pool,actorId}){if(!pool?.connect)throw Error('DATABASE_POOL_REQUIRED');this.pool=pool;this.actorId=requireId(actorId,'ACTOR')}
 async tx(fn){const db=await this.pool.connect();try{await db.query('BEGIN');const out=await fn(db);await db.query('COMMIT');return out}catch(e){try{await db.query('ROLLBACK')}catch{}throw e}finally{db.release()}}
 async ingest(raw){const e=normalizeTrustEvent(raw);return this.tx(async db=>{
  const ins=await db.query(`INSERT INTO iris_trust_event_previews
   (event_key,organization_id,pool,event_type,source_system,source_id,source_version,event_date,amount_cents,principal_id,property_id,reversal_of,payload_hash)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
   ON CONFLICT(event_key) DO NOTHING RETURNING event_key`,
   [e.eventKey,e.organizationId,e.pool,e.eventType,e.sourceSystem,e.sourceId,e.sourceVersion,e.eventDate,e.amountCents,e.principalId,e.propertyId,e.reversalOf,e.payloadHash]);
  const found=await db.query('SELECT event_key,payload_hash FROM iris_trust_event_previews WHERE event_key=$1 FOR UPDATE',[e.eventKey]);
  if(found.rowCount!==1)throw Error('INSERT_GET_RACE');
  if(found.rows[0].payload_hash!==e.payloadHash){
   await db.query(`INSERT INTO iris_trust_exception_cases(event_key,reason_code,source_fingerprint,status)
    VALUES($1,'DUPLICATE_SOURCE_CONFLICT',$2,'OPEN') ON CONFLICT(event_key,reason_code,source_fingerprint) DO NOTHING`,[e.eventKey,e.payloadHash]);
   await db.query(`INSERT INTO iris_trust_review_audit(event_key,action,actor_id,reason_code)
    VALUES($1,'SOURCE_CONFLICT',$2,'DUPLICATE_SOURCE_CONFLICT')`,[e.eventKey,this.actorId]);
   return {status:'QUARANTINED',eventKey:e.eventKey,duplicate:true,...safe};
  }
  if(ins.rowCount===1)await db.query(`INSERT INTO iris_trust_review_audit(event_key,action,actor_id) VALUES($1,'INGEST',$2)`,[e.eventKey,this.actorId]);
  return {status:'PREVIEW_STORED',eventKey:e.eventKey,duplicate:ins.rowCount===0,...safe};
 })}
 async openException({eventKey,reasonCode,sourceFingerprint='source'}){
  requireId(eventKey,'EVENT_KEY');requireId(sourceFingerprint,'FINGERPRINT');
  if(!REASONS.has(reasonCode))throw Error('INVALID_REASON_CODE');
  return this.tx(async db=>{
   const event=await db.query('SELECT event_key FROM iris_trust_event_previews WHERE event_key=$1 FOR UPDATE',[eventKey]);
   if(event.rowCount!==1)throw Error('EVENT_NOT_FOUND');
   const found=await db.query(`INSERT INTO iris_trust_exception_cases(event_key,reason_code,source_fingerprint,status)
     VALUES($1,$2,$3,'OPEN') ON CONFLICT(event_key,reason_code,source_fingerprint)
     DO UPDATE SET source_fingerprint=iris_trust_exception_cases.source_fingerprint RETURNING case_id,status`,[eventKey,reasonCode,sourceFingerprint]);
   await db.query(`INSERT INTO iris_trust_review_audit(event_key,case_id,action,actor_id,reason_code)
    VALUES($1,$2,'FLAG',$3,$4)`,[eventKey,found.rows[0].case_id,this.actorId,reasonCode]);
   return {caseId:found.rows[0].case_id,status:found.rows[0].status,...safe};
  })
 }
 async reviewException({caseId,reviewerId,evidenceReference,decision}){
  requireId(reviewerId,'REVIEWER');requireId(evidenceReference,'EVIDENCE');
  if(!['REVIEWED','CLOSED_NO_ACTION'].includes(decision))throw Error('INVALID_DECISION');
  if(reviewerId===this.actorId)throw Error('SEPARATE_REVIEWER_REQUIRED');
  return this.tx(async db=>{
   const found=await db.query(`UPDATE iris_trust_exception_cases
    SET status=$2,reviewed_by=$3,evidence_reference=$4,reviewed_at=now()
    WHERE case_id=$1 AND status='OPEN' RETURNING case_id,event_key,reason_code`,[caseId,decision,reviewerId,evidenceReference]);
   if(found.rowCount!==1)throw Error('CASE_NOT_OPEN');
   await db.query(`INSERT INTO iris_trust_review_audit(event_key,case_id,action,actor_id,reason_code)
    VALUES($1,$2,$3,$4,$5)`,[found.rows[0].event_key,caseId,decision,reviewerId,found.rows[0].reason_code]);
   return {caseId,status:decision,...safe};
  })
 }
 async listOpenExceptions(limit=100){
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('INVALID_LIMIT');
  const x=await this.pool.query(`SELECT case_id,event_key,reason_code,source_fingerprint,status,created_at
    FROM iris_trust_exception_cases WHERE status='OPEN' ORDER BY created_at,case_id LIMIT $1`,[limit]);
  return {cases:x.rows,...safe};
 }
}