# Token Counting & Overflow Demo — Design

## Goal

Add cumulative token counting, cost tracking, and context window overflow demonstration to the chat agent for educational purposes.

## New Models

### Gemma 3n 2B (OpenRouter)
- ID: `google/gemma-3n-e2b-it:free`
- Provider: OpenRouter
- Context window: 8,192 tokens
- Max output: 2,048 tokens
- Pricing: Free
- Purpose: Overflow demo — reachable in ~15-25 exchanges

### DeepSeek Chat (DeepSeek API)
- ID: `deepseek-chat`
- Provider: DeepSeek (direct API via `@ai-sdk/deepseek`)
- Context window: 128,000 tokens
- Max output: 8,000 tokens
- Pricing: $0.28 input / $0.42 output per 1M tokens
- Purpose: Real cost accumulation demo

Existing 3 models remain unchanged. Model selector grows from 3 to 5 options.

## Cumulative Session Stats

Extend `MetricsDisplay` to show two sections:

### Per-message metrics (existing)
- Response time, tokens (in/out), cost for the last response

### Session totals (new, below per-message)
- Total input tokens across all exchanges
- Total output tokens across all exchanges
- Total tokens (sum)
- Total cost (sum)
- Number of exchanges
- Context usage bar: `totalInputTokens / modelContextWindow` as percentage
  - Yellow at 80%, red at 95%

Stats accumulate on the `ChatAgent` instance. Streamed to client via data-metrics chunk alongside per-message metrics.

## Overflow Handling

No truncation, no prevention. When history exceeds model context window:
1. API call fails with an error
2. Raw API error displayed in chat as error message
3. Context usage bar shows 100%+ (visually red/overflowed)

## Data Flow

```
User sends message
  -> Agent adds to history, calls streamText()
  -> On completion: capture per-message metrics from usage object
  -> Add to cumulative session totals (stored on ChatAgent instance)
  -> Stream both per-message + session metrics via data chunk
  -> Client MetricsDisplay renders both sections
  -> If API error (overflow): catch, display raw error in chat
```

## Files Changed

| File | Change |
|------|--------|
| `lib/models.ts` | Add Gemma 3n 2B + DeepSeek Chat definitions with context window sizes |
| `lib/agent.ts` | Add cumulative stats accumulation, stream session totals, handle overflow errors |
| `app/components/MetricsDisplay.tsx` | Add session totals section + context usage indicator |
| `app/page.tsx` | Parse and pass session metrics to MetricsDisplay |

No new files, no new dependencies.
