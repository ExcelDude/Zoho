# Iris Propra MCP — read-only, separate Render service

This is a **separate** MCP endpoint from `iris-readonly-mcp`, based on its OAuth 2.1 + PKCE and token authorization structure. It accesses the documented Propra Public API v1 only with GET operations, using server-side credentials.

- Propra API: `https://propra.app/api/v1`
- Render public endpoint: `https://iris-propra-mcp.onrender.com/mcp`
- HTTP authentication to Propra: `x-api-key: pn_...`; `Authorization: pz_...` (raw values, no Bearer prefix)
- Exposed MCP tools: `verify_propra_access`, `read_propra_account`, `list_propra_records`, `get_propra_record`
- Approved record resources: properties, units, owners, tenants, residencies, gl-accounts, journals, clearables, suppliers.
- Constrained cursor pagination: `first` from 1-20 and `after` (single page per call).
- Allowed ID characters are `[A-Za-z0-9_-]`, no arbitrary paths, URL redirects disabled.
- Use a **private** ChatGPT app/plugin and OAuth 2.1 authorization. Don't disclose private tenant data through an unprotected endpoint.
- OAuth authorize form requires a dedicated 32+-character secret in Render; never share it in chat. Browser auth validates the client and PKCE.
- Existing screenshot exposed Propra credentials; **rotate them before setting up Render**.

## Render setup

Create a separate Python Web Service from `ExcelDude/Zoho`, branch `iris-propra-mcp-render-v1`.

Build: `pip install -r iris-propra-mcp/requirements.txt`
Start: `python iris-propra-mcp/server.py`
Port: `$PORT` (Render supplied).

Configure these in **Render's protected Environment** section before deployment:

1. `PROPRA_API_KEY` — freshly rotated key from Propra.
2. `PROPRA_API_SECRET` — freshly rotated secret.
3. `MCP_ACCESS_TOKEN` — separate random 32+ character secret for ChatGPT authorization.

The application deliberately refuses to start if any of these values are missing or malformed; this is a security gate, not a crash to be worked around.

Start with `https://iris-propra-mcp.onrender.com/health`; then connect the private app at `https://iris-propra-mcp.onrender.com/mcp` and authorize through OAuth. First tool: `verify_propra_access`. Second: `read_propra_account`. Avoid broad tenant/financial exports until the source-to-Books mapping and privacy requirements are reviewed.

## Limitations / blockers

No live Propra request has been performed by automated tests. The initial integration scope was `account.read.all`; Propra may deny some GET resource routes until proper scopes are granted. A successful GET does **not** mean a certified trust ledger or historical bank reconciliation is available. No Propra, Books, RBC or tenant records are modified by this service.

Do not add credentials to code, issues, deployment descriptions, logs or pull-request comments.
