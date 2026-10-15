# Cloudflare Workers deployment

Requires Node 20.19+ and a Cloudflare account. The Worker is designed for the free plan; no KV, Durable Objects, or filesystem is required. The existing Node server (`npm run mcp`) retains its file cache, profiles, and session transport.

1. Install dependencies with `npm ci`.
2. Run `npm run typecheck`, `npm test`, and `npm run worker:build`.
3. With Wrangler available, run `wrangler secret put SEC_CONTACT_EMAIL` and enter your SEC contact email. Use `contact@example.com` only as a documentation placeholder. Without the secret, SEC tools return a clear error; initialization and education tools still work.
4. Optionally set `ALLOWED_ORIGINS` to comma-separated exact browser origins in Worker variables. Absent Origin is accepted; the default allows no browser origins. `SEC_APP_NAME` defaults to `FinwispHome/0.1`.
5. Run `wrangler deploy`. No deployment is performed by the build script. The configured entry is `worker/index.ts`; the package's `workerd` import condition selects filesystem-free storage guards. The same condition selects the SDK's Worker-safe defaults, and the server explicitly uses `CfWorkerJsonSchemaValidator`. `npm run worker:build` independently checks the bundle for filesystem imports and dynamic evaluation.
6. Run `npm run remote-check -- https://finwisp-home-mcp.<your-subdomain>.workers.dev/mcp` (or set `FINWISP_MCP_URL`). The check prints the negotiated protocol, tools, Wells Fargo financials, a bank-appropriate net margin card, and accession numbers.

`GET /` and `GET /health` return discovery JSON. `/mcp` uses stateless Streamable HTTP with JSON responses, one server per request, and SDK protocol-version validation. `GET /mcp` returns 405; there is no SSE stream. Browser preflights are supported for allowed origins. Requests are capped at 256 KiB, including streamed bodies. The `MCP_RATE_LIMITER` binding limits each `CF-Connecting-IP` to 60 requests per 60 seconds; absent bindings are skipped for local tests. Cloudflare rate limiting is approximate and local to Cloudflare locations, not a global quota.

SEC request starts are serialized at least 210 ms apart per isolate/client. This is not a global account-wide rate limiter across isolates. Financials never fetch companyfacts in Worker mode: only requested metrics' alias concepts plus Assets are fetched through companyconcept, with 404 treated as missing. Unknown raw concept names must match `^[A-Za-z][A-Za-z0-9]{0,149}$`. The committed Costco fixture produces identical default financials from the concept subset and full facts. For other datasets, annual period anchoring can differ if an unrequested concept is the sole evidence of a later filing period; Assets is included to reduce this possibility.

The cache uses an in-isolate LRU (200 entries, approximately 20 MiB based on serialized UTF-16 size) and `caches.default`, keyed by SEC URL. The ticker directory stays parsed in memory until its 24-hour TTL refresh; submissions and concepts use six-hour TTLs. Cache API failures fall back to memory/network. Object overhead is not included in the estimate.

Quiz state and profiles are per-isolate memory: they are not durable, shared across isolates, or guaranteed to survive another request. Profiles are bounded to 200 IDs per isolate. Use the Node deployment when durable local profiles are required. No secrets belong in `wrangler.toml` or source control.

The small concept responses avoid parsing the 4–8 MiB companyfacts payload within the free plan's approximately 10 ms request CPU budget. Actual CPU usage, especially cold initialization and the unavoidable ticker-directory parse, must be measured in Cloudflare after deployment; this repository's Node tests do not simulate Cloudflare CPU enforcement.
