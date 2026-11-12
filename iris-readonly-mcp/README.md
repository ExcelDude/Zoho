# Iris Properties read-only MCP adapter

Source API: https://properties-crud-backend.onrender.com/api/ash/v1

**Security:** Source code contains no credentials. Configure `IRIS_API_KEY` and independent `MCP_ACCESS_TOKEN` exclusively as Render environment secrets. All tools call the upstream GET endpoints only. The bridge requires bearer authentication on every request.

Start: `python iris-readonly-mcp/server.py`. MCP endpoint: `/mcp`. Tools: `discover_schema`, `list_records`, `get_record`.

Do not log tokens or commit keys. Rotate any key disclosed in messages.
