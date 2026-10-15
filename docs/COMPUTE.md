# Compute and teaching contract

We read the September reference `compute_server.py`, `compute_worker.py`, `http_guard.py`, and `host/research-compute.ts`. That product accepted arbitrary Python, used disposable workers with CPU/file limits and wall-clock supervision, delegated OS sandboxing to its compute service, and applied a domain-based HTTP guard to data adapters.

This implementation chooses fixed TypeScript formulas. `compute_metrics` accepts the `financials` array from `get_financials`. It never evaluates code, creates subprocesses, reads user files, or accesses the network. A Python sandbox is not included: Python resource limits and HTTP monkey patches alone cannot establish filesystem and network isolation. A bounded set of formulas is sufficient for this beginner coach and keeps CPU low.

| Metric | Formula | Output |
|---|---|---|
| gross_margin | GrossProfit / Revenue | ratio |
| net_margin | NetIncomeLoss / Revenue | ratio |
| operating_margin | OperatingIncomeLoss / Revenue | ratio |
| revenue_growth_yoy | Revenue(year) / Revenue(year - 1) - 1 | growth ratio |
| cagr | (latest Revenue / earliest Revenue)^(1 / FY gap) - 1 | growth ratio |
| liabilities_to_assets | Liabilities / Assets | ratio |
| operating_cash_conversion | Operating cash flow / NetIncomeLoss | ratio |

Only USD facts are used. Same-year ratios require matching period ends. Missing inputs, zero denominators, nonpositive initial growth bases, or negative final growth values yield null with a reason, never zero-fill or infinity. Operating cash conversion is also null when net income is zero or negative, because the ratio is not meaningful; its card states the loss and the operating cash flow instead. CAGR uses actual fiscal-year distance; YoY requires the adjacent FY. Each result includes input facts and accession numbers. Values keep their precision; a UI may show ratios as percentages. Different revenue concepts can have different scope; this alias selection is not an accounting normalization service. Gross profit is not synthesized when it is missing, as it is for COST.

`make_card` accepts metric/concept/trend, one glossary metric, and computed results. It returns a structured card plus text; trends have a chart series. `make_quiz` deterministically creates three beginner multiple-choice questions from computed results and the plain-English glossary. `questions` contains no answers; `answer_keys` is a separate instructor field. A future UI must hide that field. IDs hash the questions. The bounded process-local grading map holds at most 1,000 quizzes for one hour; restarting loses them. `grade_quiz` accepts three zero-based option indices. This is learning feedback, not secure assessment.

`teach(url, company, topic, emit)` is deterministic orchestration without an LLM. It calls all six steps through the official MCP client over Streamable HTTP, and emits started/completed/failed step events. Supported topics are glossary metric keys and aliases revenue, growth, profitability, net income, liabilities, and cash. Requests the policy treats as advice (see POLICY.md) receive an education-mode disclaimer before opening a connection. The demo starts and closes its own loopback server and session.
