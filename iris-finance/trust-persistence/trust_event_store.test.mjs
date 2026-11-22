import assert from 'node:assert/strict';
import {normalizeTrustEvent,TrustEventStore} from './trust_event_store.mjs';
const base={organizationId:'110003520057',pool:'RENT',eventType:'RENT_RECEIPT',sourceSystem:'IRIS',sourceId:'lease:1',sourceVersion:'1',eventDate:'2026-11-21',amountCents:200000,principalId:'owner1',propertyId:'P1'};
class FakeDB {
 constructor(){this.rows=new Map();this.cases=[];this.audit=[];this.next=1;this.inTx=false;}
 async connect(){return {query:(s,p)=>this.query(s,p),release:()=>{}}}
 async query(s,p=[]){
  if(s==='BEGIN'){this.inTx=true;return{}}if(s==='COMMIT'||s==='ROLLBACK'){this.inTx=false;return{}}
  if(s.startsWith('INSERT INTO iris_trust_event_previews')){
   if(this.rows.has(p[0]))return{rowCount:0,rows:[]};
   this.rows.set(p[0],{event_key:p[0],payload_hash:p[12]});return{rowCount:1,rows:[{event_key:p[0]}]}
  }
  if(s.startsWith('SELECT event_key,payload_hash')){const x=this.rows.get(p[0]);return{rowCount:x?1:0,rows:x?[x]:[]}}
  if(s.startsWith('SELECT event_key FROM iris_trust_event_previews')){const x=this.rows.get(p[0]);return{rowCount:x?1:0,rows:x?[x]:[]}}
  if(s.startsWith('INSERT INTO iris_trust_exception_cases')){
   const conflict=s.includes('DUPLICATE_SOURCE_CONFLICT'),reason=conflict?'DUPLICATE_SOURCE_CONFLICT':p[1],fingerprint=conflict?p[1]:p[2];
   let x=this.cases.find(x=>x.event_key===p[0]&&x.reason_code===reason&&x.source_fingerprint===fingerprint);
   if(!x){x={case_id:this.next++,event_key:p[0],reason_code:reason,source_fingerprint:fingerprint,status:'OPEN'};this.cases.push(x)}
   return{rowCount:1,rows:[x]};
  }
  if(s.startsWith('UPDATE iris_trust_exception_cases')){
   const x=this.cases.find(x=>x.case_id===p[0]&&x.status==='OPEN');
   if(!x)return{rowCount:0,rows:[]};x.status=p[1];return{rowCount:1,rows:[x]};
  }
  if(s.startsWith('INSERT INTO iris_trust_review_audit')){this.audit.push(p);return{rowCount:1,rows:[]}}
  if(s.startsWith('SELECT case_id,event_key,reason_code'))return{rowCount:this.cases.length,rows:this.cases.filter(x=>x.status==='OPEN')};
  throw Error('UNMOCKED_SQL '+s.slice(0,70));
 }
}
let count=0;const check=f=>{f();count++};
check(()=>assert.equal(normalizeTrustEvent(base).payloadHash.length,64));
check(()=>assert(normalizeTrustEvent(base).eventKey.includes('lease%3A1')));
check(()=>assert.notEqual(normalizeTrustEvent(base).payloadHash,normalizeTrustEvent({...base,amountCents:200001}).payloadHash));
check(()=>assert.notEqual(normalizeTrustEvent(base).eventKey,normalizeTrustEvent({...base,sourceVersion:'2'}).eventKey));
for(const invalid of [{amountCents:1.2},{amountCents:0},{organizationId:'bad'},{pool:'OPERATING'},{eventType:'DEPOSIT_RECEIPT'},{eventDate:'2026-02-30'},{sourceId:''},{eventType:'REVERSAL'},{eventType:'UNIDENTIFIED_RECEIPT',principalId:'owner1'}])check(()=>assert.throws(()=>normalizeTrustEvent({...base,...invalid})));
check(()=>assert.equal(normalizeTrustEvent({...base,eventType:'UNIDENTIFIED_RECEIPT',principalId:null}).principalId,null));
const db=new FakeDB(),store=new TrustEventStore({pool:db,actorId:'worker1'});
const first=await store.ingest(base);check(()=>assert.equal(first.status,'PREVIEW_STORED'));
check(()=>assert.equal(db.rows.size,1));
const twice=await store.ingest(base);check(()=>assert.equal(twice.duplicate,true));
const conflict=await store.ingest({...base,amountCents:200001});check(()=>assert.equal(conflict.status,'QUARANTINED'));
check(()=>assert.equal(db.cases[0].reason_code,'DUPLICATE_SOURCE_CONFLICT'));
const flagged=await store.openException({eventKey:first.eventKey,reasonCode:'BANK_MAPPING_MISSING',sourceFingerprint:'scan1'});check(()=>assert.equal(flagged.status,'OPEN'));
const again=await store.openException({eventKey:first.eventKey,reasonCode:'BANK_MAPPING_MISSING',sourceFingerprint:'scan1'});check(()=>assert.equal(flagged.caseId,again.caseId));
check(()=>assert.equal(db.cases.filter(x=>x.status==='OPEN').length,2));
await assert.rejects(()=>store.reviewException({caseId:flagged.caseId,reviewerId:'worker1',evidenceReference:'e1',decision:'REVIEWED'}));count++;
const reviewed=await store.reviewException({caseId:flagged.caseId,reviewerId:'reviewer2',evidenceReference:'e1',decision:'REVIEWED'});check(()=>assert.equal(reviewed.status,'REVIEWED'));
check(()=>assert.equal(db.cases.filter(x=>x.status==='OPEN').length,1));
await assert.rejects(()=>store.reviewException({caseId:flagged.caseId,reviewerId:'reviewer2',evidenceReference:'e1',decision:'REVIEWED'}));count++;
await assert.rejects(()=>store.openException({eventKey:'missing',reasonCode:'BANK_MAPPING_MISSING'}));count++;
await assert.rejects(()=>store.openException({eventKey:first.eventKey,reasonCode:'FAKE'}));count++;
check(()=>assert.equal(first.postingAllowed,false));
check(()=>assert.equal(reviewed.payoutAllowed,false));
check(()=>assert.equal(db.inTx,false));
console.log('Passed '+count+' trust review persistence test scenarios; financial writes disabled');
