/** SELECT-only, UNPOSTED deposit preview manifest. No security/pet classifications can
 * be inferred from generic preview events; tenant balances MUST NOT be invented.
 */
const safe=x=>typeof x==='string'&&x.trim().length>0;
export async function exportDepositPreviewEvidence({db,cutoff,organizationId='110003520057'}={}){
 if(!db?.query)throw Error('READ_ONLY_DB_REQUIRED');
 if(typeof cutoff!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(cutoff)||
   Number.isNaN(Date.parse(cutoff))||new Date(cutoff+'T00:00:00Z').toISOString().slice(0,10)!==cutoff)throw Error('INVALID_CUTOFF');
 if(organizationId!=='110003520057')throw Error('WRONG_ORGANIZATION');
 const data=await db.query(`SELECT event_key,source_id,principal_id AS tenant_id,property_id,
    event_type,event_date::text AS event_date,amount_cents::text AS amount_cents
   FROM iris_trust_event_previews
   WHERE organization_id=$1 AND pool='DEPOSIT' AND event_date<=$2::date
   ORDER BY event_date,event_key`,[organizationId,cutoff]);
 const open=await db.query(`SELECT COUNT(*)::int AS n FROM iris_trust_exception_cases
    WHERE status='OPEN' AND event_key IN
      (SELECT event_key FROM iris_trust_event_previews WHERE organization_id=$1
       AND pool='DEPOSIT' AND event_date<=$2::date)`,[organizationId,cutoff]);
 const seen=new Set(),events=[];
 for(const v of data.rows){
   const amount=Number(v.amount_cents);
   if(!safe(v.event_key)||!safe(v.source_id)||seen.has(v.event_key)||!Number.isSafeInteger(amount)||amount<=0)
      throw Error('INVALID_OR_DUPLICATE_DEPOSIT_PREVIEW');
   seen.add(v.event_key);
   if(!['DEPOSIT_RECEIPT','DEPOSIT_REFUND','REVERSAL'].includes(v.event_type))throw Error('FOREIGN_DEPOSIT_EVENT');
   events.push({event_key:v.event_key,source_id:v.source_id,tenant_id:v.tenant_id||null,
      property_id:v.property_id||null,event_type:v.event_type,
      event_date:v.event_date,amount_cents:amount,
      deposit_classification:'UNVERIFIED',posted_liability_cents:null});
 }
 const unresolved=Number(open.rows[0]?.n);
 if(!Number.isSafeInteger(unresolved)||unresolved<0)throw Error('INVALID_EXCEPTION_COUNT');
 return {schema_version:'iris-deposit-preview-v1',organization_id:organizationId,
   pool:'DEPOSIT',cutoff,source_kind:'UNPOSTED_PREVIEW',events,
   unresolved_case_count:unresolved,tenant_subledger_verified:false,
   component_codes_verified:false,reconciliation_certified:false,
   posting_allowed:false};
}
