---
inclusion: always
---
# Tech stack and constraints

- TypeScript, ESM, Node 20.19+ (run with `tsx`; no native type stripping). React 19 + Vite for `web/`.
- MCP: official `@modelcontextprotocol/server` / `@modelcontextprotocol/client` 2.3.x, protocol 2025-11-25, Streamable HTTP at `/mcp` (127.0.0.1:8787 by default). Keep ONE shared `SecEdgar` client: requests are serialized ≥210 ms apart (<5 req/s) with a User-Agent containing `SEC_CONTACT_EMAIL`.
- Validation with `zod` 4. No LLM inside the app; the orchestrator is rule-based.
- Commands: `npm test` (node:test via tsx, must stay green), `npm run typecheck`, `npm run web:build`, `npm run hub` (UI + host on 8796).
- Never run `npm run live-check` or other live SEC calls in tests; use fixtures under `tests/`.
- Never commit secrets: `.env` is gitignored; `.env.example` holds placeholders only.
