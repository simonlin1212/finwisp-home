# Design: Bank-aware learning cards

## Overview
Add a small, data-driven "business model" classification to the education layer and use it in `compute_metrics`, `make_card` and the orchestrator. No new MCP tool; one optional field on existing payloads keeps the protocol surface stable.

## Components
- `mcp-server/education.ts`
  - `businessModel(financials): 'bank' | 'general'` — pure function; `bank` iff any USD `NetInterestIncome` value exists in the selected years and none of `GrossProfit`, `CostOfRevenue`, `OperatingIncomeLoss` do.
  - `compute_metrics`: when `bank`, add `net_interest_share` (a = NetInterestIncome, b = Revenue, same `end`), and return `businessModel` alongside `computed`.
  - `make_card`: new optional input `business_model`; for `bank` + (`gross_margin` | `operating_margin`) return the not-applicable body. `METRIC_GROUPS.net_interest_share = 'HOW BANKS EARN'`.
  - `CONCEPT_LABELS` already labels `InterestIncomeExpenseNet` and `RevenuesNetOfInterestExpense`.
- `mcp-server/glossary.ts`: add `net_interest_share`.
- `orchestrator/index.ts`: pass `business_model` through; for banks append a `net_interest_share` card; skip not-applicable metrics in `make_quiz` input.
- `web/src/main.tsx`: no change expected (cards render generically).

## Sequence
```
Hub → orchestrator → get_financials(WFC) → compute_metrics → {computed, businessModel:'bank'}
                   → make_card(trend, net_margin, business_model) → make_card(metric, net_interest_share)
                   → make_quiz(computed without N/A metrics)
```

## Error handling
Missing figures yield `value: null` with the existing reason. Classification never throws; unknown → `general`.

## Testing
- Fixture tests (no network) for WFC-like data (Revenue via RevenuesNetOfInterestExpense, NII, NetIncomeLoss, no GrossProfit) and CAT-like data (Revenues, CostOfRevenue, OperatingIncomeLoss, no GrossProfit after 2020).
- Snapshot of card bodies for bank N/A vs CAT insufficient-data.
- Existing suites (`npm test`), `npm run typecheck`, `npm run web:build` must pass.
