# Codex calling the Finwisp HTTP MCP server (live, 2026-10-15 00:5x SGT)

codex-cli 0.162.1, server started with `npm run mcp` (127.0.0.1:8787).

```sh
codex exec --skip-git-repo-check -s read-only \
  -c 'mcp_servers.finwisp.url="http://127.0.0.1:8787/mcp"' \
  -c 'mcp_servers.finwisp.default_tools_approval_mode="approve"' \
  "Use the finwisp MCP tools: call lookup_company with query COST, then get_financials for COST with years 2. ..." < /dev/null
```

Trace:
```
mcp: finwisp/lookup_company started
mcp: finwisp/lookup_company (completed)
mcp: finwisp/get_financials started
mcp: finwisp/get_financials (completed)
Finwisp reported Costco (COST) FY2026 revenue of $303.154 billion USD, for the fiscal year ended August 30, 2026.
```

Findings (also in FRICTION_LOG): (1) without `< /dev/null` `codex exec` waits on stdin; (2) outside a git repo needs `--skip-git-repo-check`;
(3) in non-interactive mode MCP tool calls fail ("require approval, approval policy is never") unless
`default_tools_approval_mode="approve"` is set for the server (or tools are annotated read-only and mode `writes` is used).
