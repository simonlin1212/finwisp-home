---
inclusion: always
---
# Project structure

- `mcp-server/` — MCP tools. `tools.ts` (lookup_company, get_filings, get_financials), `financials.ts` (XBRL concept ALIASES + annual selection), `education.ts` (compute_metrics, make_card, make_quiz, grading, CONCEPT_LABELS, card eyebrows), `policy.ts` (advice detector), `memory.ts` (family profiles), `sources/sec-edgar.ts` (rate-limited, cached SEC client), `companies.ts` (names/tickers).
- `orchestrator/index.ts` — rule-based multi-step plan; emits step/tool events; policy check runs before any tool.
- `host/` — Home Hub HTTP host (SSE `/api/ask`), optional Codex voice in `host/voice/`.
- `web/src/` — React UI (`main.tsx`), speech helpers.
- `tests/` — node:test files `*.test.ts`; fixtures in `tests/fixtures/`. Held-out policy sets report a pass rate and must never be tuned against.
- `docs/` — POLICY, COMPUTE, CODEX_HTTP_MCP, demo assets in `docs/demo/`. `FRICTION_LOG.md` at root: append rows, numbered sequentially.

Conventions: small pure functions, explicit provenance (concept, accession, fiscal year) on every figure, English user-facing text, "Educational use only, not investment advice." on outputs.
