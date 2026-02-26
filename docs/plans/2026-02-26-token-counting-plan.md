# Token Counting & Overflow Demo — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add cumulative token/cost tracking across conversation sessions, two new models (Gemma 3n 2B for overflow demo, DeepSeek Chat for real costs), and raw error display on context window overflow.

**Architecture:** The `ChatAgent` class accumulates session-level stats in a new `sessionMetrics` object. On each response, both per-message and cumulative metrics are streamed to the client via the existing `data-metrics` event. `MetricsDisplay` gains a second row showing session totals and a context usage percentage indicator with color thresholds.

**Tech Stack:** Next.js 15, Vercel AI SDK v6, TypeScript, Tailwind CSS, `@ai-sdk/deepseek`, `@openrouter/ai-sdk-provider`

---

### Task 1: Add `contextWindow` to ModelConfig and register new models

**Files:**
- Modify: `day1_ai-chat/lib/models.ts`

**Step 1: Add `contextWindow` field to `ModelConfig` interface**

In `lib/models.ts`, add `contextWindow` to the interface:

```typescript
export interface ModelConfig {
  id: string;
  label: string;
  tier: 'weak' | 'medium' | 'strong';
  provider: 'deepseek' | 'openrouter';
  pricing: { input: number; output: number }; // per 1M tokens
  contextWindow: number; // max tokens the model accepts
}
```

**Step 2: Add `contextWindow` to existing 3 models**

Add `contextWindow` to each existing entry:
- Arcee Trinity Mini 3B: `contextWindow: 131_072`
- NVIDIA Nemotron Nano 3B: `contextWindow: 262_144`
- StepFun Step 3.5 Flash: `contextWindow: 262_144`

**Step 3: Add Gemma 3n 2B model**

Add as the first entry in the array (it's the weakest/smallest):

```typescript
{
  id: 'google/gemma-3n-e2b-it:free',
  label: 'Gemma 3n 2B (Overflow Demo)',
  tier: 'weak',
  provider: 'openrouter',
  pricing: { input: 0, output: 0 },
  contextWindow: 8_192,
},
```

**Step 4: Add DeepSeek Chat model**

Add at the end of the array (strong tier, real costs):

```typescript
{
  id: 'deepseek-chat',
  label: 'DeepSeek Chat (Paid)',
  tier: 'strong',
  provider: 'deepseek',
  pricing: { input: 0.28, output: 0.42 },
  contextWindow: 128_000,
},
```

**Step 5: Update DEFAULT_MODEL index**

The NVIDIA Nemotron model shifts from index 1 to index 2 due to the new Gemma entry at position 0. Update:

```typescript
export const DEFAULT_MODEL = MODELS[2].id; // NVIDIA Nemotron Nano
```

**Step 6: Verify — run build**

Run: `cd day1_ai-chat && pnpm build`
Expected: Build succeeds (TypeScript will catch any missing `contextWindow` fields)

**Step 7: Commit**

```bash
git add day1_ai-chat/lib/models.ts
git commit -m "feat: add Gemma 3n 2B and DeepSeek Chat models with context window sizes"
```

---

### Task 2: Add cumulative session metrics to ChatAgent

**Files:**
- Modify: `day1_ai-chat/lib/agent.ts`

**Step 1: Add `SessionMetrics` type and instance field**

After the `Message` type (line 6), add:

```typescript
export interface SessionMetrics {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  exchanges: number;
  contextWindow: number;
}
```

In the `ChatAgent` class, add a private field after `onMessagePersist`:

```typescript
private sessionMetrics: SessionMetrics;
```

Initialize it at the end of the constructor:

```typescript
this.sessionMetrics = {
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalTokens: 0,
  totalCost: 0,
  exchanges: 0,
  contextWindow: this.modelConfig.contextWindow,
};
```

**Step 2: Accumulate metrics in `onFinish` callback**

Inside the `onFinish` callback (after line 68, cost calculation), add accumulation:

```typescript
this.sessionMetrics.totalInputTokens += inputTokens;
this.sessionMetrics.totalOutputTokens += outputTokens;
this.sessionMetrics.totalTokens += inputTokens + outputTokens;
this.sessionMetrics.totalCost += cost;
this.sessionMetrics.exchanges += 1;
this.sessionMetrics.contextWindow = modelConfig.contextWindow;
```

**Step 3: Stream session metrics alongside per-message metrics**

In the `writer.write` call (lines 76-87), add `sessionMetrics` to the data payload:

```typescript
writer.write({
  type: 'data-metrics',
  data: {
    responseTime: elapsed,
    inputTokens,
    outputTokens,
    totalTokens,
    cost,
    model: modelConfig.id,
    tier: modelConfig.tier,
    session: { ...this.sessionMetrics },
  },
});
```

**Step 4: Update `setModel` to sync context window**

In `setModel` method, after `this.modelConfig = config`, add:

```typescript
this.sessionMetrics.contextWindow = config.contextWindow;
```

**Step 5: Verify — run build**

Run: `cd day1_ai-chat && pnpm build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add day1_ai-chat/lib/agent.ts
git commit -m "feat: accumulate and stream cumulative session token metrics"
```

---

### Task 3: Handle overflow errors in the API route

**Files:**
- Modify: `day1_ai-chat/app/api/chat/route.ts`

**Step 1: Wrap agent.chat in try/catch and return error as streamed message**

Replace the current route handler body with error handling:

```typescript
import { createUIMessageStreamResponse, createUIMessageStream } from 'ai';
import { getOrCreateAgent } from '@/lib/sessions';

export async function POST(req: Request) {
  const { message, sessionId, model } = await req.json();

  const { agent, sessionId: sid } = getOrCreateAgent(sessionId, model);

  try {
    const stream = agent.chat(message);
    return createUIMessageStreamResponse({
      stream,
      headers: { 'x-session-id': sid },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({
          type: 'error',
          error: errorMessage,
        });
      },
    });
    return createUIMessageStreamResponse({
      stream,
      status: 500,
      headers: { 'x-session-id': sid },
    });
  }
}
```

Note: Streaming errors (thrown during `streamText`) will be caught by the client's stream reader as an incomplete/errored stream. The try/catch here handles synchronous errors. For streaming errors the Vercel AI SDK sends an `error` event automatically. The client in `page.tsx` already catches fetch/stream errors and displays them via `ErrorMessage`.

**Step 2: Verify — run build**

Run: `cd day1_ai-chat && pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add day1_ai-chat/app/api/chat/route.ts
git commit -m "feat: handle overflow errors in chat API route"
```

---

### Task 4: Update MetricsDisplay with session totals and context usage bar

**Files:**
- Modify: `day1_ai-chat/app/components/MetricsDisplay.tsx`

**Step 1: Add SessionMetrics interface and update props**

```typescript
'use client';

export interface Metrics {
  responseTime: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  model: string;
  tier: string;
  session?: SessionMetrics;
}

export interface SessionMetrics {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  exchanges: number;
  contextWindow: number;
}
```

Props stay the same (`metrics: Metrics | null`).

**Step 2: Add helper for context usage color**

```typescript
function contextColor(pct: number): string {
  if (pct >= 95) return 'text-red-600';
  if (pct >= 80) return 'text-yellow-600';
  return 'text-green-600';
}

function barColor(pct: number): string {
  if (pct >= 95) return 'bg-red-500';
  if (pct >= 80) return 'bg-yellow-500';
  return 'bg-green-500';
}
```

**Step 3: Rewrite component to show both sections**

Replace the return for the non-null case:

```tsx
export default function MetricsDisplay({ metrics }: MetricsDisplayProps) {
  if (!metrics) {
    return (
      <div className="flex items-center gap-4 text-sm text-gray-400">
        <span>Time: —</span>
        <span>Tokens: —</span>
        <span>Cost: —</span>
      </div>
    );
  }

  const session = metrics.session;
  const contextPct = session
    ? Math.round((session.totalInputTokens / session.contextWindow) * 100)
    : 0;

  return (
    <div className="space-y-2">
      {/* Per-message metrics */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-600">
          Time: <span className="font-medium text-gray-800">{formatTime(metrics.responseTime)}</span>
        </span>
        <span className="text-gray-600">
          Tokens: <span className="font-medium text-gray-800">{metrics.totalTokens}</span>
          <span className="text-gray-400 text-xs ml-1">({metrics.inputTokens}↑ {metrics.outputTokens}↓)</span>
        </span>
        <span className="text-gray-600">
          Cost: <span className="font-medium text-gray-800">{formatCost(metrics.cost)}</span>
        </span>
      </div>

      {/* Session totals */}
      {session && (
        <div className="flex items-center gap-4 text-sm border-t border-gray-100 pt-2">
          <span className="text-gray-500">
            Session: <span className="font-medium text-gray-700">{session.exchanges} exchanges</span>
          </span>
          <span className="text-gray-500">
            Total: <span className="font-medium text-gray-700">{session.totalTokens.toLocaleString()}</span>
            <span className="text-gray-400 text-xs ml-1">({session.totalInputTokens.toLocaleString()}↑ {session.totalOutputTokens.toLocaleString()}↓)</span>
          </span>
          <span className="text-gray-500">
            Cost: <span className="font-medium text-gray-700">{formatCost(session.totalCost)}</span>
          </span>
          <span className={`font-medium ${contextColor(contextPct)}`}>
            Context: {contextPct}%
          </span>
          {/* Mini progress bar */}
          <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor(contextPct)}`}
              style={{ width: `${Math.min(contextPct, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 4: Verify — run build**

Run: `cd day1_ai-chat && pnpm build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add day1_ai-chat/app/components/MetricsDisplay.tsx
git commit -m "feat: display cumulative session token stats with context usage bar"
```

---

### Task 5: Wire session metrics through page.tsx

**Files:**
- Modify: `day1_ai-chat/app/page.tsx`

**Step 1: No code changes needed**

The existing code at line 137-138 already does:

```typescript
} else if (event.type === 'data-metrics') {
  setMetrics(event.data as Metrics);
}
```

Since we added `session` to the data payload in Task 2 and updated the `Metrics` interface in Task 4 to include `session?: SessionMetrics`, the session data flows through automatically. The `MetricsDisplay` component receives it via the existing `metrics` prop.

**Step 2: Verify — run dev server and test**

Run: `cd day1_ai-chat && pnpm dev`

Test manually:
1. Open `http://localhost:3030`
2. Select "Gemma 3n 2B (Overflow Demo)" model
3. Send a short message — verify per-message AND session totals appear
4. Send 2-3 more messages — verify session totals accumulate, context % grows
5. Select "DeepSeek Chat (Paid)" — verify cost shows real values
6. Keep chatting with Gemma 3n — eventually context should hit 100% and API should error

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: wire cumulative session metrics end-to-end"
```

---

### Task 6: Manual overflow test with Gemma 3n 2B

**Files:** None (manual testing only)

**Step 1: Start dev server**

Run: `cd day1_ai-chat && pnpm dev`

**Step 2: Test overflow scenario**

1. Open `http://localhost:3030`
2. Select "Gemma 3n 2B (Overflow Demo)"
3. Send progressively longer messages or paste large text blocks to fill the 8K context window quickly
4. Watch the context % bar grow in MetricsDisplay
5. When context exceeds 8,192 tokens, the API should return an error
6. Verify the raw error message appears in the chat via the ErrorMessage component
7. Verify the context bar shows 95%+ in red before the error

**Step 3: Document observations**

Note in server console output:
- Token counts growing with each exchange
- The exact error message returned when context overflows
- Whether the error is from OpenRouter or the underlying model

No commit for this task — it's verification only.
