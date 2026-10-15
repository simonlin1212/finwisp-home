# Education policy

Finwisp Home teaches financial concepts in English using SEC filings. It does not give personalized trading or allocation advice, price targets, or stock-price predictions.

The rule-based orchestrator checks the complete request before any research or memory tools run. Any buy, sell or invest wording counts as a trade request unless it is clearly about the business (“What does Costco sell?”, “companies that buy back shares”, “how do we invest in inventory?”, “Teach me about Best Buy”). Holding or keeping a stock, allocation and portfolio questions, stock-picking and what professional investors are buying, valuation questions (“is Apple fairly valued?”, “a bargain?”), investment recommendations, price targets and stock-price predictions — including ones tied to earnings (“will Nvidia go up after earnings?”, “could it double?”, “should my daughter buy Tesla?”) — and the common Chinese equivalents trigger a refusal followed by **3 questions you can check yourself**. Questions about how a reported figure moves (“can profit rise while revenue falls?”) and about learning how investing works are education:

1. How have revenue and margins changed in the filings?
2. How do operating cash flow and profit compare?
3. What risks and liabilities does the company report?

Every reframe includes “Educational use only, not investment advice.” Concept explanations come from the fixed glossary through `explain_concept`; figures describe historical fiscal periods. There is no LLM, personalized suitability model, or forecasting model.

This is a conservative pattern detector, not a semantic safety guarantee. Some educational questions containing trading vocabulary will receive the reframe (for example “Do I need to own stock to learn this?” or “My kids sell lemonade, what is gross margin?”); unusual paraphrases may be missed (for example “Is Intel stock going to bounce next quarter?” or “What company should I put my bonus into?”). Tests include indirect and tricky phrasing, plus two held-out sets written before tuning (`tests/fixtures/policy-heldout*.json`) that report a pass rate instead of requiring 100%: 22/24 and 18/20 on 2026-10-15. Codex voice follows the same rules through its instructions only; the detector does not see what is said by voice. The product never has a trade-execution tool.

MCP initialize instructions (under 512 characters) describe the workflow, policy and SEC pacing. Read-only annotations apply to lookup, filings, financials, computation, cards, concept explanation and profile reads. Quiz generation, grading and profile updates are not marked read-only because they change server state.
