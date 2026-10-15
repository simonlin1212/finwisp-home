---
inclusion: always
---
# Product: Finwisp Home

Finwisp Home is an English, family-friendly "home hub" (a simulated Alexa+ experience) that teaches how to read US companies through their SEC filings. A parent or teen asks by voice or text ("COST net margin", "continue where we left off"); the hub runs a visible multi-step plan over a self-hosted MCP server and shows learning cards, a short quiz and family learning memory.

- Audience: families and beginners learning business basics. Not traders.
- **Education only, never investment advice.** Requests to buy/sell/hold, allocate money, set price targets or predict prices are refused and reframed into three filing questions (see `docs/POLICY.md`). Never weaken this to make a feature work.
- Data: SEC EDGAR only (companyfacts / submissions), attributed to the SEC. No SEC logo, no "EDGAR" in product names.
- Hackathon: Amazon "Build, Ship, Shape" — Alexa+ track (self-hosted MCP, spec 2025-11-25, Streamable HTTP) plus AWS Builder and Open Source mini challenges. Feature freeze 2026-10-20.
