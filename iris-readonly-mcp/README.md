# Iris Properties read-only MCP bridge (OAuth)

This bridge exposes only GET operations against Iris's existing documented read-only API at `https://properties-crud-backend.onrender.com/api/ash/v1`. No Iris API credentials are committed to the repository.

## Deploy

Render service `iris-readonly-mcp` uses `python iris-readonly-mcp/server.py` and `pip install -r iris-readonly-mcp/requirements.txt`. Set these two Render environment variables, only via secure secret fields:

- `IRIS_API_KEY`: read-only Iris API key
- `MCP_ACCESS_TOKEN`: independent 32+ character random authorization password, known only to the owner

**OAuth:** The server publishes authorization server and protected resource metadata, dynamic client registration, and an authorization-code + PKCE (`S256`) flow. ChatGPT connects at `https://iris-readonly-mcp.onrender.com/mcp`, discovers OAuth automatically, and opens a one-time authorization page. Enter the **MCP_ACCESS_TOKEN** on the Render-hosted authorization page, never the Iris API key. Access tokens are valid one hour and refresh tokens 14 days. If the independent MCP password is rotated, existing login sessions become invalid and must reauthorize.

**Scope:** `iris:read` only. Available tools: `discover_schema`, `list_records`, `get_record`. All tools query the upstream Iris service by GET. The source API still filters sensitive fields and logs requests.

**Security notes:** OAuth client redirect URI hosts are restricted to recognized OpenAI domains. Tokens and authorization codes are signed; the authorization code is time limited and checked against PKCE. No secrets are embedded in logs, links, code or Google Sheets. DCR client registrations use signed metadata; known ChatGPT client metadata IDs are also accepted. The simple password page is meant for a single authorized user, not a public SaaS audience. For organizational deployment, a managed identity provider is preferable.

Health endpoint: `GET /health` (does not expose data); MCP endpoint: `/mcp`.
