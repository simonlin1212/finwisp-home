# Finwisp Home

An English, Alexa+-style research coach backend that teaches how to read companies with SEC filings. Educational use only, not investment advice. Voice, learning memory, and Home Hub UI are planned.

`CLI coach → official MCP client → Streamable HTTP /mcp → SEC EDGAR + compute/cards/quiz`

Requires Node 20.19+ and uses `tsx`. No LLM or Python worker is started.

```sh
npm ci
# Supply your organization's real contact through the environment:
export SEC_CONTACT_EMAIL='<your SEC contact email>'
npm run mcp
```

Default endpoint: `http://127.0.0.1:8787/mcp`; `PORT` changes the port. `.env.example` contains placeholders only; environment variables must be exported (the app does not automatically load .env files). `SEC_APP_NAME` defaults to `FinwispHome/0.1`. `SEC_USER_AGENT` overrides the entire User-Agent. Without a contact, the app warns and uses `contact@example.com`.

```sh
npm test
npm run smoke
npm run demo -- COST
npm run demo -- NVDA growth
npm run live-check
npx --no-install tsc
```

Tests are offline and serial. Smoke starts a temporary loopback server, uses the official SDK client, lists tools, performs a fresh live AAPL lookup, checks raw protocol negotiation, and shuts down. Demo runs six real HTTP MCP steps and prints JSON step events and results, closing its session and server. Live-check uses four fresh requests for COST/NVDA/AAPL and writes accession provenance to `docs/LIVE_CHECK.md`.

| Tool | Input | Result |
|---|---|---|
| lookup_company | query | Up to five companies with ticker, CIK, title |
| get_filings | ticker_or_cik, optional form and limit (1–20) | Recent filings, accession numbers, primary document URLs |
| get_financials | ticker_or_cik, optional metrics and years (1–10) | Annual US GAAP facts with fiscal year, period end, unit, filed date, concept, accession |
| compute_metrics | financials array from get_financials | Seven named metrics with null reasons and input provenance |
| make_card | type (metric/concept/trend), glossary metric, computed | Structured card and text, optional trend chart series |
| make_quiz | computed | Three deterministic questions; answer_keys in a separate instructor field |
| grade_quiz | quiz_id, three zero-based answers | Correctness and score; quiz expires after one hour |

Default financial metrics: Revenue, NetIncomeLoss, GrossProfit, Assets, Liabilities, OperatingIncomeLoss, CostOfRevenue, NetCashProvidedByUsedInOperatingActivities. Revenue aliases are RevenueFromContractWithCustomerExcludingAssessedTax, Revenues, SalesRevenueNet, and RevenueFromContractWithCustomerIncludingAssessedTax. CostOfRevenue also uses CostOfGoodsAndServicesSold. Concept names and slash-separated aliases remain accepted.

Aliases merge across periods rather than selecting one concept for all years. Only 10-K/FY flow facts spanning 350–380 days and instant balance facts are retained. Deduplication is by unit and period end, preferring latest filed, then by fiscal year. Comparative fiscal years are calculated from the fact period's relationship to the current fiscal period within its accession, since SEC `fy` labels the filing. Latest N years are descending; each selected value identifies its concept. Equal filing dates favor alias order. Missing concepts produce empty arrays. These aliases can differ in accounting scope; this is not full accounting normalization.

HTTP sessions own an SDK server and transport and share one SEC client. Initialize with POST, send `Mcp-Session-Id`, and DELETE to end a session. Host and supplied Origin must be loopback; native clients without Origin are accepted. Tool responses have text and structured content. SEC and validation failures return explicit tool errors.

SEC requests are serialized at least 210 ms apart (under five per second). Run one process to retain the shared limit. Tickers cache for 24 hours; submissions and facts for six hours under gitignored `data/cache/`. Failed responses are not cached; requests time out after 15 seconds.

See [compute design](docs/COMPUTE.md), [live verification](docs/LIVE_CHECK.md), [Codex HTTP configuration](docs/CODEX_HTTP_MCP.md), [before/after](docs/BEFORE_AFTER.md), and [friction log](FRICTION_LOG.md).

SEC data may be delayed, revised, incomplete, or difficult to compare. Read original filings for context. This project provides education, never buy/sell advice.
