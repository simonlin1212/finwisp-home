# Finwisp Home

An English home learning screen that teaches how to read companies with SEC filings. Voice and text input, learning cards, quizzes, and family memory are implemented. Educational use only, not investment advice.

`Home Hub / CLI → rule-based orchestrator → official MCP client → Streamable HTTP /mcp → SEC EDGAR + education + memory`

## Public MCP endpoint (for judges)

**`https://finwisp-home-mcp.linsizhen.workers.dev/mcp`** — Streamable HTTP (MCP spec 2025-11-25), stateless JSON mode, no auth, hosted on Cloudflare Workers (free plan). `GET https://finwisp-home-mcp.linsizhen.workers.dev/health` returns a discovery JSON.

Connect any MCP client that speaks Streamable HTTP:

```toml
# Codex CLI (~/.codex/config.toml) — verified 2026-10-15, see docs/demo/public-codex-transcript.txt
[mcp_servers.finwisp]
url = "https://finwisp-home-mcp.linsizhen.workers.dev/mcp"
default_tools_approval_mode = "approve"
```

```bash
# Claude Code (standard remote-HTTP syntax; not tested by us)
claude mcp add --transport http finwisp https://finwisp-home-mcp.linsizhen.workers.dev/mcp

# SDK check script in this repo (verified): initialize, tools/list, WFC financials -> metrics -> card
npm run remote-check -- https://finwisp-home-mcp.linsizhen.workers.dev/mcp
```

Public-endpoint limits: 60 requests/min per IP, 256 KiB request bodies, at most 20 SEC concepts per `get_financials` call, SEC calls cached (6–24 h) and paced ≤ ~4.8 req/s per Worker isolate. Quiz state and learning profiles on the public endpoint are ephemeral, per-isolate memory; profiles are also partitioned per caller using a hashed IP. Deployment details: [docs/DEPLOY.md](docs/DEPLOY.md). Educational use only, not investment advice.

## Run the Home Hub

```sh
npm ci --cache /tmp/finwisp-npm
export SEC_CONTACT_EMAIL='<your SEC contact email>'
npm run hub
```

Open **http://127.0.0.1:8796**. `npm run hub` builds the Vite/React UI and serves it with the Node/tsx host. It starts a loopback MCP server in the same process by default. Set `MCP_URL=http://127.0.0.1:8787/mcp` to connect to an existing server instead. `HOST` defaults to `127.0.0.1`; `HUB_PORT` defaults to `8796`. API Host and supplied Origin must name localhost, a loopback address, or the configured HOST. Keep one MCP process for shared SEC pacing and profile writes.

Try “COST net margin”, “AAPL revenue growth”, or “continue where we left off”. The last request reads family memory and reviews concepts missed in the last three quizzes. Advice requests receive a refusal, three research questions, and a disclaimer before any tool runs. See [policy](docs/POLICY.md).

The large microphone button uses browser SpeechRecognition with a webkit fallback. Read aloud uses speechSynthesis and is opt-in. Browser support and microphone permission vary; text input always works. Browser speech services may process audio remotely. There is no LLM in the app. Microphone input normally needs localhost or HTTPS.

Build or preview separately:

```sh
npm run web:build
npm run web:preview
# UI-only preview: http://127.0.0.1:4173 (API requires the Hub)
# For development with API proxy, run the Hub and then in a second terminal:
npx --no-install vite --config web/vite.config.ts web
```

Stop Hub/preview/development with Ctrl+C. The host closes requests, official MCP client sessions and its owned MCP server on shutdown.

`POST /api/ask` accepts `{text, profile_id?}` and streams SSE `step`, `result`, and `error` events. Step status is started/completed/failed. Separate `tool` events include every coach MCP invocation with `call_id`, `tool`, status and `duration_ms`; repeated card and profile calls are retained. `POST /api/quiz/grade` accepts `{quiz_id, answers, profile_id?}`; `GET /api/profile?profile_id=family` reads memory. JSON requests are capped at 16 KiB. The web screen uses the default family profile.

Quiz IDs derive from question content; a seeded Fisher–Yates shuffle makes options stable per ID. Definition distractors use other glossary meanings; numeric distractors use unique percentages separated after rounding. Every question type shuffles all options, including the correct one; an optional unsigned `seed` supports reproducible checks. Keys and explanations stay in a server-side map (one hour, at most 1,000 quizzes). **No HMAC token is issued.** After restart or expiry, generate the quiz again; keys are never returned by `make_quiz`. Grading returns the correct text and explanation only after submission.

Profiles are gitignored JSON under `data/profiles/` (`PROFILE_DIR` can override it). IDs allow 1–64 letters, digits, underscores or hyphens. Fields are `conceptsLearned` (count/lastSeen), `quizHistory` (score/missedConcepts/time), `companiesFollowed`, and `lastSession`. Writes serialize within one process and use a private temporary file followed by atomic rename. Files are capped at 64 KiB; history, companies and concepts at 100 each; summaries at 1,000 characters. Use one writer process per directory. Concepts explored are recorded when a lesson completes; counts indicate exposure, not proof of mastery. Quiz results are saved only when `profile_id` is supplied. Use **Reset demo profile** in the UI to reset only `family` via `POST /api/profile/reset`; no MCP reset tool is exposed. Profiles are local shared household memory, not authenticated accounts.

Requires Node 20.19+ and uses `tsx`. No LLM or Python worker is started.

```sh
npm ci
# Supply your organization's real contact through the environment:
export SEC_CONTACT_EMAIL='<your SEC contact email>'
npm run mcp
```

Default endpoint: `http://127.0.0.1:8787/mcp`; `PORT` changes the port. `.env.example` contains placeholders only; environment variables must be exported (the app does not automatically load .env files). `SEC_APP_NAME` defaults to `FinwispHome/0.1`. `SEC_USER_AGENT` overrides the entire User-Agent. Without a contact, the app warns and uses `contact@example.com`.

```sh
npm test
npm run smoke
npm run demo -- COST
npm run demo -- NVDA growth
npm run live-check
npm run hub:check
npx --no-install tsc
```

Tests are offline and serial. Smoke starts a temporary loopback server, uses the official SDK client, lists tools, performs a fresh live AAPL lookup, checks raw protocol negotiation, and shuts down. Demo runs six real HTTP MCP steps and prints JSON step events and results, closing its session and server. Live-check uses four fresh requests for COST/NVDA/AAPL and writes accession provenance to `docs/LIVE_CHECK.md`.

| Tool | Input | Result |
|---|---|---|
| lookup_company | query | Up to five companies with ticker, CIK, title |
| get_filings | ticker_or_cik, optional form and limit (1–20) | Recent filings, accession numbers, primary document URLs |
| get_financials | ticker_or_cik, optional metrics and years (1–10) | Annual US GAAP facts with fiscal year, period end, unit, filed date, concept, accession |
| compute_metrics | financials array from get_financials | Seven named metrics with null reasons and input provenance |
| make_card | type (metric/concept/trend), glossary metric, computed | Structured card and text, optional trend chart series |
| make_quiz | computed, optional seed / concepts | Three deterministic questions with 3–4 shuffled options; no answer keys |
| grade_quiz | quiz_id, three zero-based answers, optional profile_id | Per-question correctness, correct option text, explanation and score; optional profile_id saves results |
| explain_concept | concept (glossary key) | English definition and disclaimer |
| get_learning_profile | optional profile_id (default family) | Concepts, quizzes, followed companies, last session |
| update_learning_profile | optional profile_id, event | Updated profile; events: concept, quiz, company, session |

Default financial metrics: Revenue, NetIncomeLoss, GrossProfit, Assets, Liabilities, OperatingIncomeLoss, CostOfRevenue, NetCashProvidedByUsedInOperatingActivities. Revenue aliases are Revenues, RevenueFromContractWithCustomerExcludingAssessedTax, SalesRevenueNet, and RevenueFromContractWithCustomerIncludingAssessedTax. CostOfRevenue also uses CostOfGoodsAndServicesSold. Concept names and slash-separated aliases remain accepted.

Aliases merge across periods rather than selecting one concept for all years. Only 10-K/FY flow facts spanning 350–380 days and instant balance facts are retained. Deduplication is by unit and period end, preferring latest filed, then by fiscal year. Comparative fiscal years are calculated from the fact period's relationship to the current fiscal period within its accession, since SEC `fy` labels the filing. Facts dated after their filing date are forward-looking and ignored. The N years count back from the company's latest annual report, so a concept it stopped tagging returns no figures rather than old ones; values are descending and each identifies its concept. Within one filing `Revenues` (total) is preferred over contract revenue, which can be a subset. Equal filing dates favor alias order. Missing concepts produce empty arrays. These aliases can differ in accounting scope; this is not full accounting normalization.

HTTP sessions own an SDK server and transport and share one SEC client. Initialize with POST, send `Mcp-Session-Id`, and DELETE to end a session. Host and supplied Origin must be loopback; native clients without Origin are accepted. Tool responses have text and structured content. SEC and validation failures return explicit tool errors.

SEC requests are serialized at least 210 ms apart (under five per second). Run one process to retain the shared limit. Tickers cache for 24 hours; submissions and facts for six hours under gitignored `data/cache/`. Failed responses are not cached; requests time out after 15 seconds.

See [compute design](docs/COMPUTE.md), [live verification](docs/LIVE_CHECK.md), [Codex HTTP configuration](docs/CODEX_HTTP_MCP.md), [before/after](docs/BEFORE_AFTER.md), and [friction log](FRICTION_LOG.md).

SEC data may be delayed, revised, incomplete, or difficult to compare. Read original filings for context. This project provides education, never buy/sell advice.

### Readable lessons, recording view, and voice preview

Cards now explain results in plain English (for example, “In FY2026 Costco kept 3.0% of revenue as net income ($9.2B of $303.2B).”). This sentence is illustrative, not a new verified SEC claim. Raw SEC concept identifiers stay in card `sources`; cards show a small accession line. Numeric quiz options are unique and separated after rounding by at least 1.5 percentage points and 30% relative to the larger displayed magnitude.

The Hub has larger responsive typography, an animated horizontal learning rail with friendly step names and MCP tool chips, card transitions, labelled trend axes, and coloured quiz feedback. Append `?demo=1` for a recording; the tool-call row stays visible, including repeated calls, running/done/error status and duration in ms. Focus states, live announcements, and reduced-motion support remain available.

`VOICE_ENGINE=browser` is the default. The UI Voice engine selector can choose a Codex preview; the host must also be enabled with `VOICE_ENGINE=codex`. Selecting the engine starts nothing. Only pressing the voice button starts app-server. Unavailable Codex voice falls back to Web Speech with a notice. Codex voice uses WebRTC, which works with a ChatGPT Codex login. See [VOICE.md](docs/VOICE.md) for the port, tests, the live check and Simon's Mac login/run instructions. The ordinary lesson pipeline and validation scripts start no model sessions.

The rule-based continue flow retrieves missed concepts, shows review cards, and generates a three-question re-quiz restricted to those concepts. Grading refreshes the memory panel. Named-company refusals retrieve actual SEC facts for revenue growth, net margin and liabilities/assets; unavailable data is labelled explicitly. Spoken refusal text is brief.

Recording: [2:45 demo script](docs/DEMO_SCRIPT.md). Mac setup: [中文语音指南](docs/MAC_VOICE_RUNBOOK.md). Codex voice is an experimental preview that answers by voice; the card/quiz flows are shown with Browser voice or text.

`node_modules/.bin/tsx scripts/demo-flow-check.ts` verifies live SEC refusal cards and the complete lesson → grade → memory → re-quiz → reset flow on a random port, using a temporary profile directory and no model session.

### Bank-aware cards

Banks such as Wells Fargo and JPMorgan do not report gross profit, cost of revenue or operating income. For them, Finwisp Home detects the bank from the filing data: the company reports net interest income, or has a bank SIC code, and has none of the industrial lines. It then explains why gross margin and operating margin do not apply, instead of saying "insufficient data", and adds a **Net Interest Share** card (net interest income ÷ revenue, group "HOW BANKS EARN"). Other companies, such as Caterpillar, keep the existing behaviour. `scripts/live-bank-check.ts` checks this against live SEC data and writes `docs/LIVE_BANK_CHECK.md`.

### Kiro and the AWS Builder mini-challenge (honest status)

- The `.kiro/steering/` files and the `.kiro/specs/bank-aware-cards/` spec (requirements, design, tasks) were written for Kiro.
- Kiro CLI 2.31.1 and Kiro Crew 0.8.0 were installed and signed in with an AWS Builder ID on the build box. Kiro Crew ran on this spec three times on 2026-10-15 (about 28 credits), but **produced no code**:
  - Headless `kirocrew run` had every file write rejected. This was true even with `dangerously_skip_permissions` on, because kiro-cli still refused writes with `headless_no_authorization`.
  - One run failed at spec decomposition because of free-tier Bedrock throttling.
- **The feature was then implemented manually.** Kiro did not write the code. See `docs/KIRO_LOG.md` and `FRICTION_LOG.md` #22–26.
- It is **uncertain** whether this counts for the AWS Builder mini-challenge. The rules say Kiro Crew qualifies as a development tool, but here Crew was used for planning attempts only.
