# MCP protocol check — 2026-10-15

Registry checks (`npm view … version dist-tags --json`) found:

- `@modelcontextprotocol/sdk`: stable/latest `1.32.1`.
- `@modelcontextprotocol/server`: stable/latest `2.3.1`.
- `@modelcontextprotocol/client`: stable/latest `2.3.1`.

Selected the newest stable split official TypeScript SDK packages. Both are locked at `2.3.1` in package-lock.json and support Node >=20. Tested on Node 20.19 using tsx. No LLM was started.

Exact final `npm run smoke` output (including the default User-Agent warning):

```text
> finwisp-home@0.1.0 smoke
> tsx scripts/smoke.ts

SDK: @modelcontextprotocol/server 2.3.1; @modelcontextprotocol/client 2.3.1
LATEST_PROTOCOL_VERSION: 2025-11-25
SUPPORTED_PROTOCOL_VERSIONS: ["2025-11-25","2025-06-18","2025-03-26","2024-11-05","2024-10-07"]
SEC_USER_AGENT is unset; using demo placeholder. Set AppName contact@example.com before regular use.
SDK negotiated protocolVersion: 2025-11-25
tools/list: lookup_company, get_filings, get_financials
LIVE lookup_company(AAPL): {"companies":[{"cik":"0000320193","ticker":"AAPL","title":"Apple Inc."}],"source":"https://www.sec.gov/files/company_tickers.json","note":"Educational use only, not investment advice."}
Raw initialize requested: 2025-11-25; returned: 2025-11-25
Server shut down.
```

The SDK client's initialize selected `2025-11-25`. The independent raw JSON-RPC initialize POST explicitly requested `2025-11-25` with `Accept: application/json, text/event-stream`; the server returned `2025-11-25`. Both sessions were terminated and the in-process HTTP listener closed. The live lookup used a fresh temporary cache; no network failure occurred.

Validation: nine mocked node:test tests passed, zero failed; `npx --no-install tsc` passed. Unit tests perform no external network requests.
