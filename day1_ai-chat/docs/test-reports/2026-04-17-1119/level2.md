# Level 2 — test-smoke report (2026-04-17-1119)

## App lifecycle
- Ownership: started by skill
- Boot time: 1s
- PID: 64683

## Scenarios
| # | Name | Result | Duration | Screenshot | Diagnosis |
|---|------|--------|----------|------------|-----------|
| 1 | Select DeepSeek Chat (Paid) and ask what model | PASS | 4.0s | screenshots/deepseek-response.png | — |

## Response content
The assistant replied: *"I'll search for information about the underlying model of this chat system."*

## Summary
- Passed: 1/1
- Flaky candidates: 0
- LLM shape-assertion notes: Response was non-empty and received within 4s (well under the 20s limit). The model appeared to invoke a tool search rather than directly answering, which is valid agent behavior.
