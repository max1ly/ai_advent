# Language Matching Design

## Problem Statement

DeepSeek defaults to English regardless of the user's input language. Users expect the AI to reply in the same language they write in.

## Success Criteria

- When a user sends a message in any language, DeepSeek responds in that same language
- English input continues to produce English responses
- No UI changes or additional dependencies required

## Constraints / Out of Scope

- No language detection logic on the server (rely on the model's ability)
- No user-facing language selector
- No i18n for the UI itself (only AI responses)
- No persona or role beyond language instruction

## Approach

Add a `system` parameter to the `streamText` call in `app/api/chat/route.ts`:

```ts
system: 'Always reply in the same language the user writes in.'
```

Single-line change. The model infers language from the user's message and mirrors it.

## Open Questions

None - approach is straightforward and approved.
