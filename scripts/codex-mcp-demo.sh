#!/usr/bin/env bash
# External MCP client demo: Codex CLI (not the Hub) calls Finwisp's /mcp over Streamable HTTP.
# Prerequisites: `npm run mcp` running (127.0.0.1:8787) and an already signed-in Codex CLI.
# Writes nothing to ~/.codex: all MCP settings are one-off -c overrides.
set -euo pipefail
URL="${FINWISP_MCP_URL:-http://127.0.0.1:8787/mcp}"
PROMPT="Use only the finwisp MCP tools, no shell commands. 1) lookup_company with query 'Costco'. 2) get_financials for that CIK with years 3. 3) compute_metrics with those financials. 4) make_card with type 'trend', metric 'net_margin', the computed results and company 'Costco (COST)'. Then reply in at most 6 lines: the eyebrow, title, the card body, and the SEC accession numbers. Educational use only."
cd "$(mktemp -d)"
exec codex exec --skip-git-repo-check --sandbox read-only \
  -c "mcp_servers.finwisp.url=\"$URL\"" \
  -c 'mcp_servers.finwisp.default_tools_approval_mode="approve"' \
  "$PROMPT" < /dev/null
