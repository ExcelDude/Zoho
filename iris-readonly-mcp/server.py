import hmac, json, os, re
import httpx, uvicorn
from mcp.server.fastmcp import FastMCP

BASE = "https://properties-crud-backend.onrender.com/api/ash/v1"
RESOURCES = {"properties","leases","tenants","owners","property_ownership","property_vacancies","property_events","tenant_history","property_tenant_waitlist","maintenance_requests","crm_leads","rent_metrics_snapshots","mls_listings"}
mcp = FastMCP("Iris Properties Read-only", stateless_http=True, json_response=True)

async def fetch(path, params=None):
    key = os.environ.get("IRIS_API_KEY")
    if not key: raise ValueError("Iris API key is not configured")
    async with httpx.AsyncClient(timeout=22, follow_redirects=False) as client:
        response = await client.get(BASE+path, params=params, headers={"Authorization":"Bearer "+key})
    if response.status_code != 200:
        try:
            body=response.json()
            code=body.get("error","upstream_error")
            request_id=body.get("request_id","none")
        except (ValueError,AttributeError):
            code="upstream_error";request_id="none"
        raise ValueError(f"Iris API HTTP {response.status_code}: {code}; request_id={request_id}")
    return response.json()

@mcp.tool()
async def discover_schema() -> dict:
    """Read the Iris API resource catalog, fields, and allowed sort fields."""
    return await fetch("")

@mcp.tool()
async def list_records(resource: str, limit: int=50, offset: int=0, filters_json: str="{}", order: str="") -> dict:
    """Retrieve a page of Iris records using documented equality or range filters, with no write access."""
    if resource not in RESOURCES: raise ValueError("Unknown resource")
    if not 1<=limit<=500 or offset<0: raise ValueError("Bad pagination")
    try: filters=json.loads(filters_json)
    except ValueError: raise ValueError("filters_json must be JSON")
    if not isinstance(filters,dict) or len(filters)>20: raise ValueError("Invalid filters")
    for k,v in filters.items():
        if not re.fullmatch(r"[a-z][a-z0-9_]*(?:__(?:gt|gte|lt|lte))?",k) or not isinstance(v,(str,int,float,bool)):
            raise ValueError("Invalid filter")
    params={**filters,"limit":limit,"offset":offset}
    if order:
        if not re.fullmatch(r"[a-z][a-z0-9_]*(?:\.(?:asc|desc))?",order): raise ValueError("Invalid sort")
        params["order"]=order
    return await fetch("/"+resource,params)

@mcp.tool()
async def get_record(resource: str, record_id: str) -> dict:
    """Retrieve an Iris record by its UUID; rent_metrics_snapshots has no detail endpoint."""
    if resource not in RESOURCES or resource=="rent_metrics_snapshots": raise ValueError("Unsupported detail resource")
    if not re.fullmatch(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}",record_id): raise ValueError("Expected UUID")
    return await fetch("/"+resource+"/"+record_id)

class BearerAuth:
    def __init__(self,app): self.app=app
    async def __call__(self,scope,receive,send):
        if scope["type"]=="http":
            token=os.environ.get("MCP_ACCESS_TOKEN","")
            got=dict(scope.get("headers",[])).get(b"authorization",b"").decode("ascii",errors="ignore")
            if not token or not hmac.compare_digest(got,"Bearer "+token):
                body=b'{"error":"unauthorized"}'
                await send({"type":"http.response.start","status":401,"headers":[(b"content-type",b"application/json"),(b"content-length",str(len(body)).encode())]})
                await send({"type":"http.response.body","body":body})
                return
        await self.app(scope,receive,send)

app=BearerAuth(mcp.streamable_http_app())
if __name__=="__main__":
    if not os.environ.get("IRIS_API_KEY") or not os.environ.get("MCP_ACCESS_TOKEN"):
        raise SystemExit("Missing required secret environment variables")
    uvicorn.run(app,host="0.0.0.0",port=int(os.getenv("PORT","10000")),proxy_headers=True)
