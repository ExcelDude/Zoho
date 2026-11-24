# Propra — provisional read-only client

Propra integration `propra_integration` was created for Iris Properties. The user screenshot shows `account.read.all` and a full API key/secret. **Those displayed credentials are considered exposed and must be rotated before live use.** The credentials are intentionally NOT in this repository or tests.

Third-party Aptly integration instructions verify the existence of Propra's two-part API key/secret integration flow, but do NOT provide a verified Propra API hostname, authentication header scheme, OpenAPI document or path inventory: https://aptly.helpkit.so/integrations/vVQpukZPcgx25GULuxrwjv/integrating-with-propra/5R3dm1zVyTpChUNh2JGQub

This module is transport-only, with **no guessed URLs or authentication scheme**. Before live use, the operator must obtain/verify official API host, authentication header format, a single harmless GET endpoint and minimal scope; deploy a server-side credentials provider backed by a secret manager, approve the exact hostname and resource paths, and validate consent/data handling. The first live request must be a supervised minimal read. Responses may contain tenant personal data: mask PII and avoid recording raw responses in logs.

Do not put integration keys, bearer tokens, endpoint URLs with secrets, or raw tenant records in CI, issues, prompts, spreadsheets or source code. Never call write endpoints, follow redirects, or enable webhooks. `npm` packages and deployment are not required for the synthetic tests.

Example injected runtime configuration (not production credentials):

```js
const client = new PropraReadOnlyClient({
  baseUrl: approvedApiBaseUrl, approvedHost: approvedApiHostname,
  paths: approvedReadOnlyPaths,
  authHeaders: () => secretManager.buildVerifiedPropraHeaders()
});
const account = await client.get(approvedAccountGetPath);
```

**Status: not connected, not deployed, no live Propra requests issued.**
