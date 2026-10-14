# Friction Log

Format: date (SGT) · task · expected vs actual · severity · workaround · suggestion

| # | Date | Task | Expected | Actual | Severity | Workaround | Suggestion |
|---|---|---|---|---|---|---|---|
| 1 | 2026-10-15 | Copy prior-work files from the dev Mac to the build box | Copy a tarball from /tmp | The remote-file bridge refused paths outside the user's home | Low | Staged the tarball in $HOME, copied, deleted it | (tooling, not Amazon) |
| 2 | 2026-10-15 | Run TypeScript directly | Prototype ran `.ts` natively on Node 24 | Build box has Node 20, no native type stripping | Low | Use `tsx` for dev/tests | README should state the Node version |
| 3 | 2026-10-15 | Query and install published SDK packages | npm's default cache would be writable | /home/box/.npm failed with EROFS before npm view completed | Low | Used npm --cache /tmp/finwisp-npm for registry queries and installs | Provide a writable npm cache in the build environment |
| 4 | 2026-10-15 | Type-check with current TypeScript | Installed @types/node would be discovered automatically | TypeScript 7 reported missing Node globals and node: modules | Low | Added explicit compilerOptions.types: ["node"] | Keep explicit runtime types in tsconfig |
| 5 | 2026-10-15 | Let the coding agent commit its own work | Agent commits in its sandbox | Coding-agent workspace-write sandbox mounts .git read-only (index.lock EROFS) | Low | Human/orchestrator reviews and commits | (tooling, not Amazon) |
| 6 | 2026-10-15 | get_financials revenue for Costco | Latest FY revenue | XBRL `Revenues` concept stops at FY2025 while FY2026 is filed under another concept; GrossProfit not reported by COST | Medium | Resolved: merge alias periods, retain per-year concept and latest filing | SEC: document concept aliases per filer |

| 7 | 2026-10-15 | Label annual comparative facts | SEC fy would identify each fact year | fy labels the filing, including prior-year comparisons | Medium | Infer FY offsets from period-end distance to the accession current end; add regression fixtures | Preserve period ends and accessions in teaching outputs |
| 8 | 2026-10-15 | Read Codex HTTP config support | Help/read commands run quietly | CLI warns it cannot create PATH aliases on a read-only filesystem, but get/list succeed | Low | Use command-line URL overrides and read-only commands; no config write or model turn | Separate config parsing checks from transport checks |
| 9 | 2026-10-15 | Type-check compute schema | Result array could reuse schema variable name | TypeScript reported a self-referential type annotation after local computed shadowed schema computed | Low | Rename schema to computedSchema; type-check passed | Use distinct schema and result names |
| 10 | 2026-10-15 | Include placeholder environment example | .env.example would be visible as a new file | Existing .env* ignore rule also excluded the example | Low | Add !.env.example exception without touching Git metadata | Ignore secrets while retaining placeholder templates |
| 7 | 2026-10-15 | Codex exec calling HTTP MCP tools | Tools callable once URL configured | Calls failed: "require approval, approval policy is never" | Medium | `-c mcp_servers.finwisp.default_tools_approval_mode="approve"` | Annotate tools readOnlyHint; Codex: clearer error pointing to the setting |
| 8 | 2026-10-15 | Non-interactive codex exec | Runs with prompt arg | Hung "Reading additional input from stdin" until timeout | Low | Redirect `< /dev/null` | Don't block on stdin when a prompt arg is given |
