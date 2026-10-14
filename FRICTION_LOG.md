# Friction Log

Format: date (SGT) · task · expected vs actual · severity · workaround · suggestion

| # | Date | Task | Expected | Actual | Severity | Workaround | Suggestion |
|---|---|---|---|---|---|---|---|
| 1 | 2026-10-15 | Copy prior-work files from the dev Mac to the build box | Copy a tarball from /tmp | The remote-file bridge refused paths outside the user's home | Low | Staged the tarball in $HOME, copied, deleted it | (tooling, not Amazon) |
| 2 | 2026-10-15 | Run TypeScript directly | Prototype ran `.ts` natively on Node 24 | Build box has Node 20, no native type stripping | Low | Use `tsx` for dev/tests | README should state the Node version |
