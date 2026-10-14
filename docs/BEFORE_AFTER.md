# Before and after

| Area | September 2026 reference | Finwisp Home now |
|---|---|---|
| Product | Chinese desktop Tauri app | English Finwisp Home touch/voice Hub and CLI demonstration |
| Sources | A-share data adapters and web scraping | Paced, cached SEC EDGAR ticker directory, submissions, companyfacts |
| MCP | stdio servers | Loopback Streamable HTTP with official SDK client/server |
| Compute | Arbitrary Python experiments with worker sandbox infrastructure | Seven fixed TypeScript financial metrics with input provenance |
| Learning | Desktop research workflows | Title Case metric/concept/trend cards; formatted values; shuffled quizzes with server-only keys, explanations, and persistent household memory |
| Orchestration | Codex realtime voice and research tools | Rule-based intents, advice policy, missed-concept reviews; six research steps via official HTTP MCP, SSE progress, no LLM |
| Language | Chinese | English glossary and teaching outputs |

Implemented: Vite/React Home Hub, Web Speech API microphone and opt-in speech output, permanent text input, step indicators, card carousel, SVG trend chart, touch quiz answers and grading feedback, family memory panel, and education disclaimer. The Node host builds/serves the UI and validates API Host/Origin; it owns or connects to a Streamable HTTP MCP server. JSON profiles use atomic writes and bounded history. Quiz keys remain in a bounded one-hour in-memory map and are lost on restart by design.

Remaining: device-specific integration, authenticated multi-household profiles, broader browser voice support, and production deployment. These are not required for the local Hub starter.
Reference files remain unchanged. Live SEC checks with accession provenance are in [LIVE_CHECK.md](LIVE_CHECK.md); compute limitations are in [COMPUTE.md](COMPUTE.md).
