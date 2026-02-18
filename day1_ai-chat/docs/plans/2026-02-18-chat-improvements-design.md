# Chat Improvements Design

Three improvements to the Day1 AI Chat app: auto-scroll fix, server logging, and stop sequences UI.

## 1. Auto-scroll bug fix

**Problem:** `ChatContainer` useEffect depends on `[messages, status]`, but during streaming the `messages` array reference stays the same — only the text inside the last message mutates. The effect doesn't re-fire during streaming, so the chat doesn't scroll as new tokens arrive.

**Fix:** Derive `lastMessageText` from the last message's parts and add it as a useEffect dependency. This triggers scroll on every streamed chunk.

**Files:** `app/components/ChatContainer.tsx`

## 2. Pretty server logging

**What:** Formatted console.log block in `route.ts` before the `streamText()` call showing model name, system prompt, stop sequences, and message count breakdown.

**Format:**
```
[Chat API] ─────────────────────────
  Model:          deepseek-chat
  System prompt:  Always reply in the same language...
  Stop sequences: ["oh no", "stop"]
  Messages:       3 (2 user, 1 assistant)
────────────────────────────────────
```

No new dependencies — plain template literals with box-drawing characters.

**Files:** `app/api/chat/route.ts`

## 3. Stop sequences UI

**What:** A text input in the header area where the user types comma-separated stop sequences. These are sent with each chat request and passed to the LLM.

**UI:** Header becomes taller with a second row. Input is ~30 chars wide with a "Stop sequences" label. New component `StopSequencesInput.tsx`.

**Data flow:**
1. `page.tsx` holds `stopSequences` string state
2. On each chat request, the comma-separated string is split into an array
3. Sent via `useChat`'s `body` option: `{ stopSequences: ["oh no", "stop"] }`
4. `route.ts` reads `stopSequences` from `req.json()` and passes to `streamText()`

**Files:**
- `app/page.tsx` — add state, pass to header and useChat
- `app/components/StopSequencesInput.tsx` — new input component
- `app/api/chat/route.ts` — read stopSequences from request body

## Files changed (summary)

| File | Change |
|------|--------|
| `app/components/ChatContainer.tsx` | Fix scroll dependency |
| `app/api/chat/route.ts` | Add logging + read stopSequences from body |
| `app/page.tsx` | Add stopSequences state, pass to header and useChat |
| `app/components/StopSequencesInput.tsx` | New component |
