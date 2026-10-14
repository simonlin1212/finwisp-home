# Finwisp Home recording script — 2:45

Use the Browser voice engine for this rule-based recording. Exact utterances below can also be typed and submitted with **Explore →**. Do not start a model session for the technical segment: show an existing client configuration or architecture slide.

## Pre-recording checklist

- Set an organization SEC contact in the terminal; no personal address in recordings.
- Warm the SEC cache with `npm run demo -- COST net_margin` and `npm run demo -- NVDA growth`. Both close their temporary servers.
- Open the running Hub with `?demo=1`; use a 1920×1080 capture, browser zoom 100%. Rehearse the quiz scroll; 90% zoom is an optional fallback if the display is smaller.
- Select **Browser**, leave **Read aloud** off for clean narration, and click **Reset demo profile**. Verify “No quizzes yet” and “No companies yet”. This deletes only household profile `family`, through the host API.
- Rehearse once to identify the definition and numeric answers: shuffle varies with question content. For this take deliberately choose a wrong Net Margin answer so next-day review has something to teach. Reset again after rehearsal.
- Keep cards, SEC accession lines, tool chips and memory panel readable. Cache warmth reduces network delays; pause the take if SEC is unavailable. Never narrate a cached fiscal year as today's earnings.

## Route 1 — Costco learning (0:00–1:15)

| Time | Exact utterance / clicks | Expected screen | Narration |
|---|---|---|---|
| 0:00–0:10 | Type “COST net margin”; click **Explore →** (or tap mic and say exactly that). | Progress rail; chips show `lookup_company`, `get_filings`, `get_financials`, computation and card calls running, then done with milliseconds. | “Let's understand a business, one idea at a time.” |
| 0:10–0:28 | Wait for completion. | Costco Net Margin trend, fiscal years, percentages, SEC accession line; chips persist. | “These figures come from SEC filings. Net margin tells us how much revenue remains as net income.” |
| 0:28–0:42 | Click **Next card** once, then once again. | Definition card, then metric card with dollar amounts. | “A definition connects the chart to the actual reported amounts.” |
| 0:42–1:00 | Scroll to **A quick quiz**. Select one option for each of the three questions; deliberately choose an incorrect Net Margin option. Click **Check answers**. | Correct/Incorrect feedback and explanations; saved score. | “The answers are shuffled. A mistake becomes a learning prompt, rather than disappearing.” |
| 1:00–1:15 | Point to **Family memory**; scroll slightly if needed. | COST followed, net margin explored, latest score and missed concepts. | “Our household memory keeps the concepts we explored and the ones to review.” |

## Route 2 — refusal / Nvidia (1:15–2:00)

| Time | Exact utterance / clicks | Expected screen | Narration |
|---|---|---|---|
| 1:15–1:25 | Type “Should I buy Nvidia?”; click **Explore →**. | Policy refusal card: “I can't tell you whether to buy”; three self-check questions and disclaimer. | “It won't decide whether I should buy a stock.” |
| 1:25–1:40 | Click **Next card**. | “1. How fast did revenue grow?” with NVDA fiscal-year percentages and SEC sources. | “Instead, it asks what changed in revenue, using Nvidia's real filing numbers.” |
| 1:40–1:50 | Click **Next card**. | “2. How much revenue became profit?” with net margin and dollar amounts. | “Then, how much revenue became profit?” |
| 1:50–2:00 | Click **Next card**. | “3. How large are liabilities relative to assets?”; accession sources, disclaimer in footer. | “And how do liabilities compare with assets? This is education, not investment advice.” |

## Route 3 — next-day memory (2:00–2:30)

| Time | Exact utterance / clicks | Expected screen | Narration |
|---|---|---|---|
| 2:00–2:10 | Return to top; type “continue where we left off”; click **Explore →**. Do not reset. | Last-session summary, review cards for missed concepts; memory tool chips. | “Imagine coming back tomorrow: continue where we left off.” |
| 2:10–2:20 | Click **Next card** if more than one missed concept; scroll to quiz. | Review definition and a three-question re-quiz drawn only from missed concepts. | “It recalls our mistakes and gives us a short, focused review.” |
| 2:20–2:30 | Answer all three; click **Check answers**; point to latest memory score. | New saved score and feedback; memory panel updates. | “The next result is saved too, so learning carries forward.” |

## Technical segment (2:30–2:45)

Show this static architecture; no live model turn required:

```text
Browser → Hub /api/ask → rule-based coach → HTTP /mcp → SEC cache + education + profile
Codex  ─────────────────────────────────────→ same HTTP /mcp tools
Claude ─────────────────────────────────────→ same HTTP /mcp tools
```

Narrate exactly: “The browser uses a rule-based coach. Codex and Claude can call the same HTTP MCP endpoint and the same tools. SEC data, calculations, cards, quizzes, and local learning memory live behind that shared interface.” Show the configured `/mcp` URL, not credentials. External-client interoperability is an architecture statement; use previously captured evidence if showing actual calls.
