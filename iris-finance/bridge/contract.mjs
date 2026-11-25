import {createHmac,timingSafeEqual,createHash} from 'node:crypto';
export const ORG_ID='110003520057';
export const TYPES=new Set(['LEASE_ACTIVATED','LEASE_RENT_CHANGED','RENT_CYCLE_DUE','TEST_INVOICE_REQUEST']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export function parsePortalEvent(event){
 if(!event||typeof event!=='object'||Array.isArray(event))throw Error('INVALID_EVENT');
 if(event.organization_id!==ORG_ID)throw Error('WRONG_BOOKS_ORG');
 if(!TYPES.has(event.type))throw Error('EVENT_TYPE_DENIED');
 if(!uuid.test(event.source_event_id)||!uuid.test(event.lease_id)||!uuid.test(event.property_id))throw Error('INVALID_SOURCE_UUID');
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(event.accounting_period))throw Error('INVALID_PERIOD');
 if(!Number.isSafeInteger(event.source_version)||event.source_version<1)throw Error('INVALID_VERSION');
 if(!Number.isFinite(Date.parse(event.occurred_at)))throw Error('INVALID_EVENT_TIMESTAMP');
 // No rent amount, owner names, tenants, payment credentials, or arbitrary payloads accepted.
 const allowed=['organization_id','type','source_event_id','lease_id','property_id','accounting_period','source_version','occurred_at'];
 if(Object.keys(event).some(k=>!allowed.includes(k)))throw Error('UNEXPECTED_DATA_FIELD');
 return Object.freeze(Object.fromEntries(allowed.map(k=>[k,event[k]])));
}
export function requestKey(e){return [e.organization_id,e.type,e.lease_id,e.accounting_period,e.source_version].join(':')}
function equal(a,b){const A=Buffer.from(String(a||'')),B=Buffer.from(String(b||''));return A.length===B.length&&timingSafeEqual(A,B)}
export function verifySignedPortalRequest({rawBody,timestamp,signature,secret,now=Date.now()}){
 if(typeof secret!=='string'||secret.length<32)throw Error('PORTAL_SECRET_NOT_CONFIGURED');
 if(!/^\d{10}$/.test(String(timestamp))||Math.abs(now-Number(timestamp)*1000)>300000)throw Error('STALE_PORTAL_REQUEST');
 if(!equal(createHmac('sha256',secret).update(String(timestamp)+'.'+rawBody).digest('hex'),signature))throw Error('INVALID_PORTAL_SIGNATURE');
 return parsePortalEvent(JSON.parse(rawBody));
}
export function verifyCallbackBearer({authorization,secret}){
 if(typeof secret!=='string'||secret.length<32)throw Error('BOOKS_CALLBACK_SECRET_NOT_CONFIGURED');
 if(!/^Bearer [\w-]+$/.test(authorization||'')||!equal((authorization||'').slice(7),secret))throw Error('CALLBACK_UNAUTHORIZED');
}
export function parseBooksCallback(payload){
 if(!payload||payload.organization_id!==ORG_ID||payload.module!=='invoice')throw Error('INVALID_BOOKS_CALLBACK');
 if(typeof payload.books_invoice_id!=='string'||!/^\d+$/.test(payload.books_invoice_id))throw Error('INVALID_BOOKS_INVOICE_ID');
 if(typeof payload.external_reference!=='string'||!/^IRIS-TEST-[0-9a-f-]{36}-\d{4}-\d{2}$/i.test(payload.external_reference))throw Error('INVALID_EXTERNAL_REFERENCE');
 if(!['created','updated','voided'].includes(payload.event))throw Error('UNSUPPORTED_BOOKS_EVENT');
 return {organization_id:ORG_ID,module:'invoice',books_invoice_id:payload.books_invoice_id,external_reference:payload.external_reference,event:payload.event};
}
