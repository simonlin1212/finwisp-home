# Education policy

Finwisp Home teaches financial concepts in English using SEC filings. It does not give personalized trading or allocation advice, price targets, or stock-price predictions.

The rule-based orchestrator checks the complete request before any research or memory tools run. Buy, sell, hold, allocation, portfolio, investment recommendation, price-target and forward-price phrasings (including “will it go up?”, “could it double?” and “is it worth buying?”) trigger a refusal followed by **3 questions you can check yourself**:

1. How have revenue and margins changed in the filings?
2. How do operating cash flow and profit compare?
3. What risks and liabilities does the company report?

Every reframe includes “Educational use only, not investment advice.” Concept explanations come from the fixed glossary through `explain_concept`; figures describe historical fiscal periods. There is no LLM, personalized suitability model, or forecasting model.

This is a conservative English pattern detector, not a semantic safety guarantee. Some educational questions containing trading vocabulary will receive the reframe; unusual paraphrases may be missed. Tests include indirect and tricky phrasing. The product never has a trade-execution tool.

MCP initialize instructions (under 512 characters) describe the workflow, policy and SEC pacing. Read-only annotations apply to lookup, filings, financials, computation, cards, concept explanation and profile reads. Quiz generation, grading and profile updates are not marked read-only because they change server state.
