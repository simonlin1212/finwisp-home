# Implementation Plan

_All tasks were implemented manually on 2026-10-15, after the Kiro Crew attempts were blocked (see docs/KIRO_LOG.md). Kiro did not write this code. Classification also accepts a bank SIC code (6021/6022/6029/6035/6036) from `get_filings`, in addition to the XBRL-concept rule._

- [x] 1. Add `businessModel()` classifier and fixture tests
  - Pure function in `mcp-server/education.ts`; WFC-like → bank, CAT-like → general, mixed → general
  - _Requirements: 1.1, 1.2, 1.3_
- [x] 2. Add `net_interest_share` metric and glossary entry
  - Extend `compute_metrics` (bank only); add glossary sentence; add `METRIC_GROUPS` entry
  - Tests for value, sources, null on mismatched periods
  - _Requirements: 2.1, 2.2, 2.3_
- [x] 3. Not-applicable card wording for banks
  - `make_card` optional `business_model`; N/A body for gross/operating margin; CAT unchanged
  - _Requirements: 3.1, 3.2, 3.3_
- [x] 4. Orchestrator wiring
  - Pass business model; add `net_interest_share` card for banks; exclude N/A metrics from quiz input
  - Orchestrator test with mocked MCP calls for "WFC net margin"
  - _Requirements: 4.1, 4.2_
- [x] 5. Verify and document
  - `npm test`, `npm run typecheck`, `npm run web:build`; append a FRICTION_LOG row if Kiro hit friction; log the session in `docs/KIRO_LOG.md`
  - _Requirements: 4.3_
