# Unified Report (2026-04-17-1123)

## Level 1 summary
- **17/17 unit tests passed** across 3 files (ChatMessage, CopyButton, MetricsDisplay)
- New test file: `app/components/__tests__/ChatMessage.test.tsx` (8 tests covering user/assistant rendering, empty content, copy button, RAG sources, file attachments, pending writes)
- 3 consecutive green runs, stable

## Level 2 summary
- **3/3 smoke scenarios passed** across 3 consecutive runs
- Scenarios: chat send/receive, copy button feedback, metrics display
- All stable with session isolation

## Cross-level diagnosis
- No Level 1 failures detected — no cross-level suspects.
- Level 2 initial failures (model timeout) were environmental, not code bugs — resolved by adding session reset before each scenario.
- All changed components (`ChatMessage.tsx`, `CopyButton.tsx`, `MetricsDisplay.tsx`) have both unit and smoke coverage.

## Promoted specs
- `chat-send-receive.spec.ts` → `e2e/smoke/chat-send-receive.spec.ts` (PROMOTED)
- `copy-button.spec.ts` → `e2e/smoke/copy-button.spec.ts` (PROMOTED)
- `metrics-display.spec.ts` → `e2e/smoke/metrics-display.spec.ts` (PROMOTED)
