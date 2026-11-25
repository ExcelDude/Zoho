"""Iris Propra read-only MCP. Propra v1 GET endpoints only.

Documented API: https://propra.app/api/v1
Runtime secrets: PROPRA_API_KEY, PROPRA_API_SECRET, MCP_ACCESS_TOKEN.
No tenant data or upstream response details are logged.
"""
import asyncio
import base64
import hashlib
import hmac
import html
import json
import os
import re
import secrets
import time
from urllib.parse import urlencode, urlparse

import httpx
import jwt
import uvicorn
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse
from starlette.routing import Mount, Route

UPSTREAM = "https://propra.app/api/v1"
ORIGIN = "https://iris-propra-mcp.onrender.com"
RESOURCE = ORIGIN + "/mcp"
SCOPES = "propra:read"
RESOURCES = frozenset({
    "properties", "units", "owners", "tenants", "residencies",
    "gl-accounts", "journals", "clearables", "suppliers"
})
MCP_SECRET = os.environ.get("MCP_ACCESS_TOKEN", "")
PROPRA_KEY = os.environ.get("PROPRA_API_KEY", "")
PROPRA_SECRET = os.environ.get("PROPRA_API_SECRET", "")
if not (len(MCP_SECRET) >= 32 and PROPRA_KEY.startswith("pn_") and PROPRA_SECRET.startswith("pz_")):
    raise SystemExit("Configure MCP_ACCESS_TOKEN (32+ chars), PROPRA_API_KEY and PROPRA_API_SECRET in Render")
SIGNING_KEY = hmac.new(MCP_SECRET.encode(), b"propra-mcp-oauth-signing-v1", hashlib.sha256).digest()
used_codes = set()
recent_failed = {}

def issue(payload, seconds):
    now = int(time.time())
    return jwt.encode({**payload, "iss": ORIGIN, "iat": now, "exp": now + seconds,
                       "jti": secrets.token_urlsafe(20)}, SIGNING_KEY, algorithm="HS256")

def verify(token, kind):
    try:
        claims = jwt.decode(token, SIGNING_KEY, algorithms=["HS256"],
                            issuer=ORIGIN, options={"require": ["exp", "iat", "iss", "jti"], "verify_aud": False})
        return claims if claims.get("kind") == kind else None
    except jwt.PyJWTError:
        return None

def safe_redirect(value):
    try:
        u=urlparse(value)
        return (u.scheme=="https" and not u.username and not u.password and not u.fragment
                and u.hostname in {"chatgpt.com", "auth.openai.com", "chat.openai.com", "platform.openai.com"}
                and u.port in (None,443))
    except (ValueError,TypeError):
        return False

def valid_client(client):
    if not isinstance(client,str): return False
    if re.fullmatch(r"https://chatgpt\\.com/oauth/(?:[A-Za-z0-9_-]+/)?client\\.json",client):
        return True
    if client.startswith("propra_dcr_"):
        claims=verify(client[len("propra_dcr_"):], "client")
        return claims is not None
    return False

def client_redirect_allowed(client,redirect):
    if not (valid_client(client) and safe_redirect(redirect)):return False
    if client.startswith("propra_dcr_"):
        claims=verify(client[len("propra_dcr_"):], "client")
        return redirect in claims.get("redirect_uris",[]) if claims else False
    return True

def json_error(msg,status=400):
    return JSONResponse({"error":msg},status_code=status,headers={"Cache-Control":"no-store"})

def valid_id(value):
    return isinstance(value,str) and bool(re.fullmatch(r"[A-Za-z0-9_-]{1,128}",value))

async def upstream(path,params=None):
    if path not in {"/account","/ping/auth"} and not any(
            path=="/"+r or (path.startswith("/"+r+"/") and valid_id(path[len(r)+2:]))
            for r in RESOURCES):
        raise ValueError("Endpoint not allowlisted")
    headers={"x-api-key":PROPRA_KEY,"Authorization":PROPRA_SECRET,"Accept":"application/json"}
    try:
        async with httpx.AsyncClient(timeout=15,follow_redirects=False) as client:
            result=await client.get(UPSTREAM+path,params=params,headers=headers)
    except (httpx.RequestError,httpx.TimeoutException):
        raise ValueError("Propra upstream network error") from None
    if result.status_code != 200:
        # Never include upstream body/URLs, which could contain sensitive values.
        raise ValueError("Propra upstream rejected read request (HTTP %s)" % result.status_code)
    try:
        return result.json()
    except ValueError:
        raise ValueError("Propra returned invalid JSON") from None

mcp=FastMCP("Iris Propra Read-only",stateless_http=True,json_response=True,
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=["iris-propra-mcp.onrender.com","iris-propra-mcp.onrender.com:*"],
        allowed_origins=["https://chatgpt.com","https://chat.openai.com"],
    ))

@mcp.tool()
async def verify_propra_access() -> dict:
    """Test documented Propra API authentication (GET /ping/auth only)."""
    payload=await upstream("/ping/auth")
    return {"api_reachable":True,"response_kind":type(payload).__name__}

@mcp.tool()
async def read_propra_account() -> dict:
    """Read the Propra account's basic profile (GET /account)."""
    return await upstream("/account")

@mcp.tool()
async def list_propra_records(resource:str,first:int=10,after:str="") -> dict:
    """Read a single page of Propra owners, properties, units, tenants,
    residencies, GL accounts, journals, clearables, or suppliers. Never writes.
    """
    if resource not in RESOURCES:raise ValueError("Resource not allowed")
    if not isinstance(first,int) or isinstance(first,bool) or not 1<=first<=20:
        raise ValueError("first must be 1-20")
    if after and (not isinstance(after,str) or len(after)>1024 or any(ord(c)<32 for c in after)):
        raise ValueError("Invalid cursor")
    params={"first":first}
    if after:params["after"]=after
    return await upstream("/"+resource,params)

@mcp.tool()
async def get_propra_record(resource:str,record_id:str) -> dict:
    """Read one Propra resource by its existing ID. GET only; no modifications."""
    if resource not in RESOURCES or not valid_id(record_id):
        raise ValueError("Invalid resource or ID")
    return await upstream("/"+resource+"/"+record_id)

async def protected_resource(request):
    return JSONResponse({"resource":RESOURCE,"authorization_servers":[ORIGIN],
                         "scopes_supported":[SCOPES],
                         "bearer_methods_supported":["header"]},
                        headers={"Cache-Control":"no-store"})

async def authorization_metadata(request):
    return JSONResponse({
        "issuer":ORIGIN,
        "authorization_endpoint":ORIGIN+"/authorize",
        "token_endpoint":ORIGIN+"/token",
        "registration_endpoint":ORIGIN+"/register",
        "response_types_supported":["code"],
        "grant_types_supported":["authorization_code","refresh_token"],
        "token_endpoint_auth_methods_supported":["none"],
        "code_challenge_methods_supported":["S256"],
        "scopes_supported":[SCOPES],
        "client_id_metadata_document_supported":True
    },headers={"Cache-Control":"no-store"})

async def register(request):
    try: payload=await request.json()
    except (ValueError,TypeError): return json_error("invalid_client_metadata")
    redirect_uris=payload.get("redirect_uris",[])
    if (not isinstance(redirect_uris,list) or not 1 <= len(redirect_uris) <= 8
            or not all(isinstance(u,str) and safe_redirect(u) for u in redirect_uris)
            or payload.get("token_endpoint_auth_method","none")!="none"):
        return json_error("invalid_redirect_uri")
    client="propra_dcr_"+issue({"kind":"client","redirect_uris":redirect_uris}, 365*24*3600)
    return JSONResponse({"client_id":client,"client_id_issued_at":int(time.time()),
                         "client_secret_expires_at":0,"redirect_uris":redirect_uris,
                         "token_endpoint_auth_method":"none",
                         "grant_types":["authorization_code","refresh_token"],
                         "response_types":["code"]},status_code=201,
                        headers={"Cache-Control":"no-store"})

def validated_oauth_params(params):
    client=params.get("client_id","")
    redirect=params.get("redirect_uri","")
    challenge=params.get("code_challenge","")
    resource=params.get("resource",RESOURCE)
    if params.get("response_type") != "code": return None
    if not client_redirect_allowed(client,redirect): return None
    if not re.fullmatch(r"[A-Za-z0-9_-]{43,128}",challenge): return None
    if params.get("code_challenge_method") != "S256": return None
    if resource != RESOURCE: return None
    if params.get("scope",SCOPES) != SCOPES: return None
    return {"client_id":client,"redirect_uri":redirect,"challenge":challenge,
            "resource":resource,"scope":SCOPES,"state":params.get("state","")}

async def authorize_get(request):
    p=validated_oauth_params(request.query_params)
    if p is None: return json_error("invalid_request")
    fields="".join('<input type="hidden" name="%s" value="%s">' % (html.escape(k),html.escape(v,quote=True))
                   for k,v in p.items())
    body="""<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Connect Propra read-only API</title>
    <style>body{font:16px system-ui;max-width:430px;margin:7vh auto;padding:20px}
    input{box-sizing:border-box;width:100%;padding:14px;margin:14px 0}
    button{background:#1765ae;color:white;border:0;padding:12px 20px;border-radius:6px}
    p{line-height:1.5;color:#444}</style></head><body>
    <h2>Connect Iris Propra</h2><p>Authorize ChatGPT to read Iris Propra data through the existing read-only API.
    This does not grant permission to change any records.</p>
    <form method="post" action="/authorize">"""+fields+"""<label>Enter your MCP_ACCESS_TOKEN from Render
    <input name="password" type="password" required autocomplete="off"></label>
    <button type="submit">Authorize read-only access</button></form></body></html>"""
    return HTMLResponse(body,headers={"Cache-Control":"no-store","Referrer-Policy":"no-referrer"})

async def authorize_post(request):
    form=await request.form()
    p=validated_oauth_params({**dict(form),"response_type":"code",
                              "code_challenge":form.get("challenge",""),
                              "code_challenge_method":"S256"})
    if p is None: return json_error("invalid_request")
    ip=request.client.host if request.client else "unknown"
    count,blocked=recent_failed.get(ip,(0,0))
    if blocked>time.time(): return PlainTextResponse("Too many attempts; try again later.",status_code=429)
    password=form.get("password","")
    if not isinstance(password,str) or not hmac.compare_digest(password,MCP_SECRET):
        count+=1
        recent_failed[ip]=(count,time.time()+900 if count>=5 else 0)
        return PlainTextResponse("Incorrect access password.",status_code=401)
    recent_failed.pop(ip,None)
    code=issue({"kind":"code","client_id":p["client_id"],"redirect_uri":p["redirect_uri"],
                "challenge":p["challenge"],"resource":p["resource"]}, 180)
    params={"code":code}
    if p["state"]:params["state"]=p["state"]
    separator="&" if "?" in p["redirect_uri"] else "?"
    return RedirectResponse(p["redirect_uri"]+separator+urlencode(params),status_code=303,
                            headers={"Cache-Control":"no-store","Referrer-Policy":"no-referrer"})

async def token(request):
    form=await request.form()
    grant=form.get("grant_type","")
    client=form.get("client_id","")
    if not valid_client(client): return json_error("invalid_client",401)
    if grant=="authorization_code":
        code=form.get("code","")
        claims=verify(code,"code")
        verifier=form.get("code_verifier","")
        if not claims or not isinstance(verifier,str) or not re.fullmatch(r"[A-Za-z0-9._~-]{43,128}",verifier):
            return json_error("invalid_grant")
        challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
        if (claims["client_id"]!=client
            or claims["redirect_uri"]!=form.get("redirect_uri")
            or claims["challenge"]!=challenge
            or form.get("resource",RESOURCE)!=claims["resource"]
            or claims["jti"] in used_codes):
            return json_error("invalid_grant")
        used_codes.add(claims["jti"])
        if len(used_codes)>10000: used_codes.clear()
    elif grant=="refresh_token":
        claims=verify(form.get("refresh_token",""),"refresh")
        if not claims or claims.get("client_id")!=client: return json_error("invalid_grant")
        if form.get("resource",RESOURCE)!=RESOURCE:return json_error("invalid_target")
    else:
        return json_error("unsupported_grant_type")
    access=issue({"kind":"access","aud":RESOURCE,"client_id":client,"scope":SCOPES},3600)
    refresh=issue({"kind":"refresh","client_id":client},14*24*3600)
    return JSONResponse({"access_token":access,"token_type":"Bearer","expires_in":3600,
                         "scope":SCOPES,"refresh_token":refresh},
                        headers={"Cache-Control":"no-store"})

async def health(request):
    return JSONResponse({"status":"ok"},headers={"Cache-Control":"no-store"})

class ProtectedMCP:
    def __init__(self,other):self.other=other
    async def __call__(self,scope,receive,send):
        if scope["type"]=="http":
            headers=dict(scope.get("headers",[]))
            value=headers.get(b"authorization",b"").decode("ascii",errors="ignore")
            claims=verify(value[7:],"access") if value.startswith("Bearer ") else None
            if not claims or claims.get("aud")!=RESOURCE or claims.get("scope")!=SCOPES:
                body=b'{"error":"unauthorized"}'
                await send({"type":"http.response.start","status":401,
                            "headers":[(b"content-type",b"application/json"),
                                       (b"content-length",str(len(body)).encode()),
                                       (b"www-authenticate",('Bearer resource_metadata="'+ORIGIN+'/.well-known/oauth-protected-resource", scope="'+SCOPES+'"').encode())]})
                await send({"type":"http.response.body","body":body})
                return
        await self.other(scope,receive,send)

mcp_app=mcp.streamable_http_app()
app=Starlette(routes=[
    Route("/health",health),
    Route("/.well-known/oauth-protected-resource",protected_resource),
    Route("/.well-known/oauth-protected-resource/mcp",protected_resource),
    Route("/.well-known/oauth-authorization-server",authorization_metadata),
    Route("/.well-known/openid-configuration",authorization_metadata),
    Route("/register",register,methods=["POST"]),
    Route("/authorize",authorize_get,methods=["GET"]),
    Route("/authorize",authorize_post,methods=["POST"]),
    Route("/token",token,methods=["POST"]),
    Mount("/",app=ProtectedMCP(mcp_app))
],lifespan=mcp_app.router.lifespan_context)
if __name__=="__main__":
    uvicorn.run(app,host="0.0.0.0",port=int(os.getenv("PORT","10000")),proxy_headers=True)
