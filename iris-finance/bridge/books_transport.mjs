import {ORG_ID} from './contract.mjs';
const HOSTS=new Set(['www.zohoapis.com','zohoapis.com','www.zohoapis.ca','zohoapis.ca']);
function baseUrl(value){const url=new URL(value);if(url.protocol!=='https:'||!HOSTS.has(url.hostname)||url.pathname!=='/'||url.username||url.password)throw Error('UNAPPROVED_BOOKS_API_HOST');return url.origin;}
export function makeBooksClient({apiBaseUrl,accessToken,fetchImpl,pilotWriteEnabled=false,approvedTestCustomerId,approvedTestItemId}){
 const base=baseUrl(apiBaseUrl);
 if(!accessToken||typeof fetchImpl!=='function')throw Error('BOOKS_AUTH_REQUIRED');
 const request=async(method,path,body)=>{
  const url=new URL('/books/v3/'+path,base);
  url.searchParams.set('organization_id',ORG_ID);
  if(method==='POST')url.searchParams.set('send','false');
  const response=await fetchImpl(url.href,{method,headers:{Authorization:'Zoho-oauthtoken '+accessToken,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!response?.ok)throw Error('BOOKS_REQUEST_FAILED_'+(response?.status||'UNKNOWN'));
  const json=await response.json();
  if(json.code!==0)throw Error('BOOKS_API_REJECTED');
  return json;
 };
 return Object.freeze({
  getInvoice:async id=>{
   if(!/^\d+$/.test(String(id)))throw Error('INVALID_INVOICE_ID');
   return (await request('GET','invoices/'+id)).invoice;
  },
  // Search is NOT proof of unique identity; compare actual reference and customer after a GET.
  findByReference:async reference=>{
   if(!/^IRIS-TEST-[0-9a-f-]{36}-\d{4}-\d{2}$/i.test(reference))throw Error('INVALID_REFERENCE');
   const url=new URL('/books/v3/invoices',base);
   url.searchParams.set('organization_id',ORG_ID);url.searchParams.set('search_text',reference);
   const r=await fetchImpl(url.href,{headers:{Authorization:'Zoho-oauthtoken '+accessToken}});
   if(!r.ok)throw Error('BOOKS_SEARCH_FAILED');
   const json=await r.json();if(json.code!==0||!Array.isArray(json.invoices))throw Error('BOOKS_SEARCH_INVALID');
   const exact=json.invoices.filter(x=>x.reference_number===reference);
   // Pagination / uncertain search coverage must be independently confirmed before creating.
   return {exact,searchComplete:json.page_context?.has_more_page===false,writeSafe:false};
  },
  createDraftDisabledByDefault:async({draft,writeMode,operatorApproval,verifiedNoExistingReference})=>{
   if(pilotWriteEnabled!==true||writeMode!=='EXPLICIT_ONE_TIME_TEST'||operatorApproval!==true||verifiedNoExistingReference!==true)
     throw Error('BOOKS_DRAFT_WRITE_NOT_APPROVED');
   if(!approvedTestCustomerId||!approvedTestItemId||draft?.customer_id!==approvedTestCustomerId||draft?.line_items?.length!==1||draft.line_items[0].item_id!==approvedTestItemId)throw Error('BOOKS_TEST_ALLOWLIST_REQUIRED');
   if(!draft||draft.send!==false||!String(draft.reference_number||'').startsWith('IRIS-TEST-'))
     throw Error('NOT_A_TEST_DRAFT');
   // Caller must enforce durable once-only reservation in Iris before invoking this method.
   return (await request('POST','invoices',draft)).invoice;
  }
 });
}
