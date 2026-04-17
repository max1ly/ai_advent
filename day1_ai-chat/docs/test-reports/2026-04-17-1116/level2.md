# Level 2 — test-smoke report (2026-04-17-1116)

## App lifecycle
- Ownership: started by skill
- Boot time: 1s
- PID: 63080

## Scenarios
| # | Name | Result | Duration | Screenshot | Diagnosis |
|---|------|--------|----------|------------|-----------|
| 1 | Ask what model the chat is based on | PASS | 5.96s | — | — |

## Response content
The assistant replied: *"It is based on the GPT (Generative Pre-trained Transformer) language model."*

## Summary
- Passed: 1/1
- Flaky candidates: 0
- LLM shape-assertion notes: Response was non-empty and received within 6s (well under the 20s limit).
