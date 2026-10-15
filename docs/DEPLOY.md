# Cloudflare Workers deployment

## Live deployment (2026-10-15)

- URL: `https://finwisp-home-mcp.linsizhen.workers.dev/mcp` (health: `/health`).
- Worker name `finwisp-home-mcp`, Workers **free plan**, `nodejs_compat`, compatibility date 2026-10-01.
- Bindings: secret `SEC_CONTACT_EMAIL` (set as a Worker secret, never committed), var `SEC_APP_NAME=FinwispHome/0.1`, rate-limit binding `MCP_RATE_LIMITER` (60 req / 60 s per `CF-Connecting-IP`). No `ALLOWED_ORIGINS` set, so browser-origin requests are refused (403) and native MCP clients (no `Origin` header) are accepted.
- How it was deployed: `npm run worker:build` produced `dist-worker/worker.mjs`; the bundle was uploaded as an ES module through the Cloudflare REST API (`PUT /accounts/{id}/workers/scripts/finwisp-home-mcp`, multipart with metadata `main_module`, `compatibility_flags`, bindings) and the `workers.dev` route was enabled (`POST .../subdomain`). Wrangler was not used because no Wrangler login/API token was available on the build box (see FRICTION_LOG #27). `wrangler deploy` with `wrangler.toml` is the equivalent path for anyone forking the repo.
- Redeployed 2026-10-15 14:34 SGT (same REST upload, existing secret kept via `keep_bindings`) with per-caller profile partitioning; re-verified with `npm run remote-check`.
- Live verification: [docs/demo/public-remote-check.txt](demo/public-remote-check.txt) (official SDK client: initialize → tools/list → lookup_company → get_financials WFC → compute_metrics → make_card) and [docs/demo/public-codex-transcript.txt](demo/public-codex-transcript.txt) (Codex CLI as an external MCP client, Costco net-margin trend card). The live WFC revenue/net income values were cross-checked against the full companyfacts path of the Node server (identical values and accession numbers for FY2023–FY2025).

## Build and deploy your own

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

Quiz state and profiles are per-isolate memory: they are not durable, shared across isolates, or guaranteed to survive another request. Profiles are partitioned per caller using the first 16 hex characters of a SHA-256 hash of `CF-Connecting-IP` (fallback `unknown`); raw IPs are not stored in profile storage. One shared memory map bounds profiles to 200 caller/profile pairs per isolate. Use the Node deployment when durable local profiles are required. No secrets belong in `wrangler.toml` or source control.

The small concept responses avoid parsing the 4–8 MiB companyfacts payload within the free plan's approximately 10 ms request CPU budget. Actual CPU usage, especially cold initialization and the unavoidable ticker-directory parse, must be measured in Cloudflare after deployment; this repository's Node tests do not simulate Cloudflare CPU enforcement.
