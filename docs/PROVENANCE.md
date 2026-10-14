# Provenance

`finwisp-home` is a new repository created on 2026-10-15 (SGT) for the Amazon Developer Hackathon (Alexa+ track).
Everything outside `reference/` is new work written during the hackathon window (after 2026-08-31).

## Reused prior work (reference only)
`reference/finwisp-2026-09/` holds a small whitelisted subset of the author's earlier private prototype
"Finwisp" (a Chinese-language desktop voice research assistant). That prototype was written in
September 2026 (git commits dated 2026-09-18 .. 2026-09-20, further uncommitted work through 2026-09-29).
These files are kept verbatim for porting; they are not built or run by this repo.

| Path | Purpose in finwisp-home |
|---|---|
| host/app-server.ts | Codex App Server JSON-RPC transport (to be ported) |
| host/native-voice.ts, shared/voice.ts, shared/spoken-text.ts | realtime voice session (to be ported, English policy) |
| host/research-compute.ts, data-sources/compute_server.py, compute_worker.py, http_guard.py | sandboxed Python compute -> future `compute_metrics` tool |
| host/semantic-memory.ts, shared/research-memory.ts, shared/presentation-memory.ts, shared/semantic-memory.ts | memory -> future learning profile |
| host/voice-research-policy.ts | to be rewritten as English "education, not advice" policy |
| host/market-data.ts, host/text-research.ts | reference for how MCP servers are wired into Codex (stdio, to be replaced by HTTP) |
| shared/protocol.ts, tests/app-server.test.ts | error type and node:test style |
| src/Sphere.tsx, src/visual/*, src/VoicePanel.tsx, src/voice-connection.ts, src/audio-devices.ts, src/style.css, src/main.tsx | UI pieces for the new Home Hub skin |
| package.json, tsconfig.json, vite.config.ts, index.html | toolchain reference |

## Deliberately excluded
Agent/process notes (CLAUDE.md, AGENTS.md, DEV-LOG.md, START_HERE.md, docs/), local state (.local/, .claude/,
.astra-director/, scratchpad/), personal data and media folders, archives (*.zip), build output (dist*), node_modules,
the Tauri desktop shell (src-tauri/), China A-share specific modules and scraping data adapters (data licensing unclear),
portfolio/report-library features. No credentials, tokens or .env files were copied.

## Secret scan
2026-10-15: grep for token/key/password/secret/email/phone/user paths over `reference/` found only code that
*handles* user-supplied keys at runtime and a test fixture path (`/Users/someone`). No real secrets present.
