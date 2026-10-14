# Finwisp Home

Finwisp Home — a voice-first, Alexa+-style research coach that teaches your family how to read companies with real SEC filings — education, never advice.

## Architecture

`Simulator <-> Streamable HTTP /mcp <-> SEC EDGAR`

Day 1 implements the TypeScript MCP server and SEC client. The simulator and voice experience are future work. Each HTTP session owns an official SDK MCP server and transport; sessions share a paced, cached SEC client.

## Quick start

Requires Node 20.19 or newer. TypeScript runs through `tsx`; Node 24 is unnecessary.

```sh
npm ci
export SEC_USER_AGENT='FinwispHome your-real-contact@example.com'
npm run mcp
```

Default bind: `127.0.0.1:8787`. Set `PORT` to change the port.

```sh
npm test
npm run smoke
npx --no-install tsc
```

Tests use mocked fetch and no external network. Smoke starts on a random loopback port, initializes the official SDK client, lists tools, performs a live AAPL lookup, probes raw protocol negotiation, and shuts down. A network failure is reported explicitly; protocol or tool-list failures fail the script. Smoke uses a temporary cache to ensure the lookup is live.

## MCP endpoint & tools

The single endpoint is `http://127.0.0.1:8787/mcp` (Streamable HTTP). Initialize with POST, send the returned `Mcp-Session-Id` on subsequent requests, and DELETE to end the session. The SDK also handles GET streaming. Missing Origin is accepted for native clients; supplied origins must be HTTP(S) localhost, 127.0.0.1, or ::1. Host is also restricted to loopback names.

| Tool | Input | Result |
|---|---|---|
| `lookup_company` | `query` ticker or company name | Up to five matches: padded CIK, ticker, title |
| `get_filings` | `ticker_or_cik`, optional `form`, `limit` (default 10, maximum 20) | Recent filings and primary document URLs |
| `get_financials` | `ticker_or_cik`, optional `metrics`, `years` (default 5, maximum 10) | Annual 10-K/FY US GAAP facts, units, fiscal years, source accessions |

Default financial concepts: Revenues (fallback RevenueFromContractWithCustomerExcludingAssessedTax), NetIncomeLoss, GrossProfit, Assets, Liabilities. Slash-separated metric names select the first available concept. Duration facts must span 300–400 days; instantaneous balance-sheet facts are retained. Each unit is deduplicated by fiscal year, preferring the latest filing and period end. Missing concepts return empty values. SEC taxonomy and fiscal-year labels vary; this is a teaching aid, not normalized accounting analysis.

Every tool returns matching text and `structuredContent`, a `source`, and the educational disclaimer. SEC failures become explicit tool errors.

## SEC fair access

Set `SEC_USER_AGENT` to `AppName contact@example.com` with a real contact. When unset, the server warns and uses `FinwispHome/0.1 (hackathon demo) set-SEC_USER_AGENT@example.com`.

Requests are serialized with at least 210 ms between starts (under five requests per second, below SEC's ten-request ceiling). Run one server process to retain this shared limit. Responses are cached under gitignored `data/cache/`: tickers 24 hours, submissions and companyfacts six hours. Failed responses are not cached. No credentials are required.

## Disclaimer

Educational use only, not investment advice. SEC data can be delayed, revised, incomplete, or difficult to compare. Read the original filings and consult qualified professionals for financial decisions.

## What's new since Aug 31

The Day 1 MCP server, SEC adapter, tests, smoke script, and protocol report are new hackathon work. The unchanged September prototype in `reference/` is reference-only and is neither built nor run. See [provenance](docs/PROVENANCE.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
