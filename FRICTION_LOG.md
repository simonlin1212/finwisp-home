# Friction Log

Format: date (SGT) · task · expected vs actual · severity · workaround · suggestion

| # | Date | Task | Expected | Actual | Severity | Workaround | Suggestion |
|---|---|---|---|---|---|---|---|
| 1 | 2026-10-15 | Copy prior-work files from the dev Mac to the build box | Copy a tarball from /tmp | The remote-file bridge refused paths outside the user's home | Low | Staged the tarball in $HOME, copied, deleted it | (tooling, not Amazon) |
| 2 | 2026-10-15 | Run TypeScript directly | Prototype ran `.ts` natively on Node 24 | Build box has Node 20, no native type stripping | Low | Use `tsx` for dev/tests | README should state the Node version |
| 3 | 2026-10-15 | Query and install published SDK packages | npm's default cache would be writable | /home/box/.npm failed with EROFS before npm view completed | Low | Used npm --cache /tmp/finwisp-npm for registry queries and installs | Provide a writable npm cache in the build environment |
| 4 | 2026-10-15 | Type-check with current TypeScript | Installed @types/node would be discovered automatically | TypeScript 7 reported missing Node globals and node: modules | Low | Added explicit compilerOptions.types: ["node"] | Keep explicit runtime types in tsconfig |
| 5 | 2026-10-15 | Let the coding agent commit its own work | Agent commits in its sandbox | Coding-agent workspace-write sandbox mounts .git read-only (index.lock EROFS) | Low | Human/orchestrator reviews and commits | (tooling, not Amazon) |
| 6 | 2026-10-15 | get_financials revenue for Costco | Latest FY revenue | XBRL `Revenues` concept stops at FY2025 while FY2026 is filed under another concept; GrossProfit not reported by COST | Medium | TODO: merge alternative concepts per fiscal year, pick latest | SEC: document concept aliases per filer |
