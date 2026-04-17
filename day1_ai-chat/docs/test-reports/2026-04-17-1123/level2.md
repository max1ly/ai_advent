# Level 2 — Smoke Test Report (2026-04-17-1123)

## Summary
- **Result:** PASS (3/3 scenarios, 3 consecutive green runs)
- **Runner:** Playwright + Chromium, baseURL http://localhost:3030

## Scenarios

| # | Scenario | Run 1 | Run 2 | Run 3 | Status |
|---|----------|-------|-------|-------|--------|
| 1 | Chat send & receive | PASS (5.6s) | PASS (4.3s) | PASS (8.3s) | STABLE |
| 2 | Copy button feedback | PASS (3.4s) | PASS (3.4s) | PASS (3.3s) | STABLE |
| 3 | Metrics display | PASS (4.2s) | PASS (6.2s) | PASS (8.2s) | STABLE |

## Notes
- Initial runs failed due to accumulated session context causing model timeouts; fixed by adding "New Chat" reset at start of each spec.
- All specs include session isolation via "New Chat" button click.

## Issues found
None (after session isolation fix).
