# Before and after

| Area | September 2026 reference | Finwisp Home now |
|---|---|---|
| Product | Chinese desktop Tauri app | English Alexa+-style home coach backend and CLI demonstration |
| Sources | A-share data adapters and web scraping | Paced, cached SEC EDGAR ticker directory, submissions, companyfacts |
| MCP | stdio servers | Loopback Streamable HTTP with official SDK client/server |
| Compute | Arbitrary Python experiments with worker sandbox infrastructure | Seven fixed TypeScript financial metrics with input provenance |
| Learning | Desktop research workflows | Structured metric/concept/trend cards; deterministic quizzes and grading |
| Orchestration | Codex realtime voice and research tools | Six-step lookup → filings → financials → compute → cards → quiz; events via a real HTTP MCP client, no LLM |
| Language | Chinese | English glossary and teaching outputs |

The home-coach identity is implemented as a deterministic backend workflow. This repository does not yet provide Alexa integration, voice interaction, a household device experience, or a graphical Home Hub. Learning memory, personalized progress, Home Hub UI, and voice are **planned**. Quiz grading currently uses a bounded one-hour process-local map, not learning memory.

Reference files remain unchanged. Live SEC checks with accession provenance are in [LIVE_CHECK.md](LIVE_CHECK.md); compute limitations are in [COMPUTE.md](COMPUTE.md).
