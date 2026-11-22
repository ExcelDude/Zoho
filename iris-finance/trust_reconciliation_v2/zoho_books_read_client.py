"""Read-only Zoho Books Canada account inventory client.

GET only. OAuth token is injected by the runtime; never persisted in source.
Not a historical account-balance or trust transaction feed.
"""
import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from books_evidence_adapter import EvidenceError

class ZohoBooksReadClient:
    def __init__(self, organization_id, access_token, *, opener=urlopen, max_pages=20):
        if not str(organization_id).isdigit():
            raise ValueError("organization_id must be numeric")
        if not access_token or not isinstance(access_token,str):
            raise ValueError("read-only OAuth token required")
        self._org = str(organization_id)
        self._token = access_token
        self._opener = opener
        self._max_pages = max_pages
        self._base = "https://www.zohoapis.ca/books/v3"

    def _get(self, path, params):
        # Caller cannot use arbitrary paths or hosts.
        if path not in ("/chartofaccounts",) and not (
            path.startswith("/chartofaccounts/") and
            path[len("/chartofaccounts/"):].isdigit()):
            raise EvidenceError("Unsupported read-only Books endpoint")
        qs=urlencode({"organization_id":self._org,**params})
        req=Request(self._base+path+"?"+qs,
                    headers={"Authorization":"Zoho-oauthtoken "+self._token,
                             "Accept":"application/json"},
                    method="GET")
        try:
            with self._opener(req,timeout=15) as response:
                payload=json.load(response)
        except Exception as exc:
            # Do not expose request URLs, headers or token-bearing exceptions.
            raise EvidenceError("Zoho Books GET failed") from None
        if not isinstance(payload,dict) or payload.get("code")!=0:
            raise EvidenceError("Zoho Books returned invalid/error payload")
        return payload

    def list_accounts(self):
        found=[]
        seen=set()
        for page in range(1,self._max_pages+1):
            payload=self._get("/chartofaccounts",
                              {"page":page,"per_page":200})
            items=payload.get("chartofaccounts")
            if not isinstance(items,list):
                raise EvidenceError("Books chart-of-accounts list missing")
            for item in items:
                account_id=str(item.get("account_id",""))
                if not account_id or account_id in seen:
                    raise EvidenceError("Missing or duplicate Books account ID")
                seen.add(account_id)
                found.append(item)
            context=payload.get("page_context")
            if not isinstance(context,dict):
                raise EvidenceError("Books pagination context not verified")
            if context.get("has_more_page") is False:
                return found
            if context.get("has_more_page") is not True:
                raise EvidenceError("Unknown Books pagination status")
        raise EvidenceError("Books account inventory exceeded page limit")

    def get_account(self, account_id):
        aid=str(account_id)
        if not aid.isdigit():
            raise EvidenceError("Invalid Books account ID")
        payload=self._get("/chartofaccounts/"+aid,{})
        account=payload.get("chart_of_account")
        if account is None:
            account=payload.get("chartofaccount")
        if not isinstance(account,dict) or str(account.get("account_id"))!=aid:
            raise EvidenceError("Books account detail missing or mismatched")
        return account
