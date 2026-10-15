# Requirements: Bank-aware learning cards

## Introduction
Banks (e.g. Wells Fargo, WFC) do not report gross profit, cost of revenue or operating income. Today their gross-margin and operating-margin cards say "insufficient comparable data", which reads like a bug and teaches nothing. Net interest income is already fetched (`NetInterestIncome` → `InterestIncomeExpenseNet`, added 2026-10-15). This feature teaches banks with bank-appropriate measures and explains why industrial metrics do not apply. Education only; no advice.

## Requirement 1: Detect bank-style filers
**User story:** As a learner, I want the hub to recognise when a company is a bank, so that it shows metrics that make sense for that business.
1. WHEN `get_financials` returns `NetInterestIncome` values AND no `GrossProfit`, `CostOfRevenue` or `OperatingIncomeLoss` values for the selected years THEN the system SHALL classify the company as `bank` for that lesson.
2. WHEN the classification is ambiguous (some industrial concepts present) THEN the system SHALL keep the existing behaviour.
3. The classification SHALL be derived from filing data only (no hard-coded ticker list), and SHALL be covered by fixture tests for WFC-like and CAT-like data.

## Requirement 2: Bank metrics
**User story:** As a learner, I want to see how a bank earns money, so that I understand interest income versus fees.
1. WHEN a company is classified as `bank` THEN `compute_metrics` SHALL compute `net_interest_share` = NetInterestIncome / Revenue (RevenuesNetOfInterestExpense) per fiscal year, with sources and accession numbers like other metrics.
2. The glossary SHALL define `net_interest_share` in one plain-English sentence suitable for a teen.
3. IF either figure is missing or periods mismatch THEN the value SHALL be null with the existing reason text.

## Requirement 3: Not-applicable cards instead of "insufficient data"
**User story:** As a learner, I want to know why a metric is missing for a bank, so that the gap teaches me something.
1. WHEN a company is classified as `bank` AND the requested card is `gross_margin` or `operating_margin` THEN `make_card` SHALL return a body that says the metric does not apply to banks and why (banks earn interest and fees rather than selling goods), instead of "insufficient comparable data".
2. The card SHALL keep its eyebrow and title and SHALL carry no figures.
3. Non-bank companies (e.g. CAT, whose gross profit is genuinely untagged since FY2021) SHALL keep the current "insufficient comparable data" wording.

## Requirement 4: Orchestrator and UI
1. WHEN the learner asks "WFC net margin" THEN the lesson SHALL include the net-margin card and a `net_interest_share` card.
2. Quiz generation SHALL not ask about not-applicable metrics.
3. All existing tests SHALL keep passing; policy refusals are unchanged.
