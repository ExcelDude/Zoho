/** Iris Finance event monitor reference prototype. No network, persistence or live posting.
 * NOT production-ready: replace Map with transactional durable storage and an outbox worker.
 * Event writes must be atomic with uniqueness constraints and audit trail.
 */
export class FinanceEventMonitor {
  constructor({maxAttempts=4,baseRetryMs=30000}={}) {
    this.maxAttempts=maxAttempts;
    this.baseRetryMs=baseRetryMs;
    this.events=new Map();
    this.audit=[];
  }
  key(e){return [e.org_id,e.event_kind,e.source_system,e.source_event_id,e.accounting_period].join("|")}
  assertValid(e){
    for(const k of ["org_id","event_kind","source_system","source_event_id","accounting_period","payload_sha256"])
      if(typeof e[k]!=="string"||!e[k].trim())throw Error("Missing "+k);
    if(!/^[a-f0-9]{64}$/i.test(e.payload_sha256))throw Error("payload_sha256 must be a SHA256 hex digest");
    if(!/^\d{4}-\d{2}$/.test(e.accounting_period))throw Error("Invalid accounting period");
    if(e.amount_cents!==undefined&&(!Number.isSafeInteger(e.amount_cents)||e.amount_cents<=0))throw Error("Invalid amount cents");
  }
  log(k,event,at,detail){this.audit.push({key:k,event,at,detail});}
  enqueue(e,at=Date.now()){
    this.assertValid(e); const k=this.key(e),existing=this.events.get(k);
    if(existing){
      if(existing.payload_sha256!==e.payload_sha256) {
        this.log(k,"PAYLOAD_CONFLICT",at,"Same event key with different payload digest");
        return {ok:false,conflict:true,status:existing.status,reason:"IDEMPOTENCY_CONFLICT"};
      }
      this.log(k,"IDEMPOTENT_REPLAY",at,existing.status);
      return {ok:true,replayed:true,status:existing.status,books_id:existing.books_id||null};
    }
    const row={...e,status:"PENDING",attempts:0,created_at:at,updated_at:at,books_id:null,next_retry_at:null,last_error:null};
    this.events.set(k,row);this.log(k,"QUEUED",at,"No Books action performed");
    return {ok:true,replayed:false,status:"PENDING"};
  }
  begin(k,at=Date.now()){
    const r=this.events.get(k);if(!r)throw Error("Unknown event");
    if(!["PENDING","RETRY_WAIT"].includes(r.status))throw Error("Cannot dispatch from "+r.status);
    if(r.status==="RETRY_WAIT"&&at<r.next_retry_at)throw Error("Backoff active");
    r.status="IN_FLIGHT";r.attempts++;r.updated_at=at;r.next_retry_at=null;
    this.log(k,"DISPATCH_STARTED",at,"Attempt "+r.attempts);return {...r};
  }
  succeeded(k,booksId,at=Date.now()){
    const r=this.events.get(k);if(!r||r.status!=="IN_FLIGHT")throw Error("Not in flight");
    if(typeof booksId!=="string"||!booksId.trim())throw Error("Books ID required");
    r.status="SUCCEEDED";r.books_id=booksId;r.updated_at=at;
    this.log(k,"SUCCESS",at,"Books ID stored");return {...r};
  }
  failed(k,{category,code="REDACTED",safeMessage=""},at=Date.now()){
    const r=this.events.get(k);if(!r||r.status!=="IN_FLIGHT")throw Error("Not in flight");
    const allowed=["TRANSIENT_PRE_SUBMIT","PERMANENT_VALIDATION","UNCERTAIN_AFTER_SUBMIT"];
    if(!allowed.includes(category))throw Error("Failure category required");
    // Never persist raw request bodies, headers, credentials, bank details or raw API errors.
    r.last_error={category,code:String(code).replace(/[^A-Z0-9_-]/gi,"").slice(0,45)};
    if(category==="UNCERTAIN_AFTER_SUBMIT")r.status="UNCERTAIN";
    else if(category==="PERMANENT_VALIDATION")r.status="BLOCKED";
    else if(r.attempts>=this.maxAttempts)r.status="DEAD_LETTER";
    else{
      r.status="RETRY_WAIT";
      r.next_retry_at=at+Math.min(3600000,this.baseRetryMs*Math.pow(2,r.attempts-1));
    }
    r.updated_at=at;this.log(k,r.status,at,r.last_error.code);return {...r};
  }
  reconcileUncertain(k,{foundBooksId=null,definitiveNoPost=false,approvedBy=null},at=Date.now()){
    const r=this.events.get(k);if(!r||r.status!=="UNCERTAIN")throw Error("Not uncertain");
    if(foundBooksId){
      if(typeof foundBooksId!=="string")throw Error("Invalid Books ID");
      r.status="SUCCEEDED";r.books_id=foundBooksId;
      this.log(k,"RECONCILED_EXISTING",at,"Existing Books ID verified");
    } else if(definitiveNoPost&&approvedBy){
      r.status="RETRY_WAIT";r.next_retry_at=at;
      this.log(k,"RECONCILED_NOT_POSTED",at,"Authorized verification; safe to retry");
    } else throw Error("Require existing Books ID or verified non-posting with approval");
    r.updated_at=at;return {...r};
  }
  snapshot(){
    const values=[...this.events.values()],summary={total:values.length,pending:0,in_flight:0,retry_wait:0,succeeded:0,uncertain:0,blocked:0,dead_letter:0};
    for(const v of values)summary[v.status.toLowerCase()]++;
    return summary;
  }
}
