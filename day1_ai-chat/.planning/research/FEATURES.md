# Feature Research

**Domain:** Minimal LLM Chat Web Application
**Researched:** 2026-02-17
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Streaming responses | Users expect ChatGPT-like token-by-token display, not batch responses | MEDIUM | Requires SSE or fetch with ReadableStream. DeepSeek API supports streaming |
| Markdown rendering | LLMs return formatted text; users expect proper rendering | LOW | Libraries like react-markdown handle this. Sanitize for security |
| Code block syntax highlighting | LLMs frequently generate code; unformatted code looks broken | LOW | Use Shiki or Prism. Must include copy button |
| Copy button for code blocks | Users need to extract code from responses | LOW | One-click copy with visual feedback (checkmark) |
| Message input field | Basic requirement for any chat interface | LOW | Textarea, not input, for multi-line support |
| Auto-resizing input | Users expect input to grow as they type multi-line messages | LOW | CSS grid technique or react-textarea-autosize |
| Loading state during response | Users need feedback that system is processing | LOW | Typing indicator or spinner while waiting |
| Stop generation button | Users expect ability to abort long/incorrect responses | MEDIUM | Cancel fetch request, clear streaming buffer |
| Error handling with retry | Network failures happen; users expect recovery path | MEDIUM | Show error message, retry button, don't lose context |
| Basic message history display | Users need to see conversation context | LOW | Scrollable container, latest message visible |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Instant load time | Zero-config simplicity beats feature-rich complexity | LOW | No auth, no DB = sub-100ms first paint |
| Regenerate last response | Let users retry without retyping prompt | MEDIUM | Store last user message, resend to API |
| One-click clear conversation | Fast reset for new topic without page refresh | LOW | Clear state, focus input, maintain scroll position |
| DeepSeek model display | Transparency about which model is answering | LOW | Show "Powered by DeepSeek-V3" or similar in UI |
| Keyboard shortcuts | Power users appreciate Cmd+Enter to send, Escape to stop | LOW | Simple event listeners, document shortcuts |
| Mobile-responsive design | Many users chat on phones; desktop-only feels dated | MEDIUM | Responsive textarea, proper viewport sizing |
| Dark mode | Reduces eye strain for coding/long sessions | LOW | CSS variables, system preference detection |
| Privacy-first messaging | Explicit "no data stored" promise builds trust | LOW | Clear UI messaging, no cookies/tracking |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for a minimal MVP.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Message persistence/history | "I want to save conversations" | Adds DB, auth, privacy concerns, deployment complexity | Defer to v2. Users can copy/paste to save locally |
| Multi-conversation threads | "Like ChatGPT's sidebar" | Requires DB, session management, complex UI state | Single conversation cleared on refresh keeps it simple |
| User accounts/authentication | "To save my chats" | Massive scope increase, security surface, compliance | Not needed for MVP. Focus on chat quality first |
| Advanced model selection | "Let me pick DeepSeek-Coder vs V3" | Decision paralysis, API complexity, more UI | Use best general model (cheapest). Add later if needed |
| Message editing | "Let me fix my typo" | Complex state management, unclear UX (edit history?) | Users can send new message or regenerate |
| File/image upload | "I want to share screenshots" | Multimodal increases API cost, storage, processing | Defer to v2. Text-only is simpler and cheaper |
| Rate limiting/quotas | "Prevent abuse" | No auth = can't track users; adds complexity | VPS firewall handles DDoS. Feature flag if needed |
| Real-time collaboration | "Share chat with teammate" | Requires WebSocket, DB, presence tracking | Use screen share or copy/paste. Too complex for MVP |

## Feature Dependencies

```
Streaming responses
    └──requires──> Error handling with retry (must handle stream failures)
    └──requires──> Stop generation button (must cancel streams)

Markdown rendering
    └──requires──> Code block syntax highlighting (code blocks are markdown)
    └──requires──> Copy button for code blocks (users expect this pairing)

Auto-resizing input
    └──enhances──> Message input field (better UX, not blocking)

Regenerate last response
    └──requires──> Message history display (need to know what to regenerate)

Dark mode
    └──conflicts──> Syntax highlighting (themes must match)
```

### Dependency Notes

- **Streaming requires error handling:** Stream failures are different from request failures. Need abort handling
- **Markdown requires code blocks:** Users will paste code in prompts, LLM will return code. Both need highlighting
- **Stop button is critical for streaming:** Long responses must be abortable without page refresh
- **Dark mode conflicts with syntax highlighting:** Code highlight themes must support both light/dark modes

## MVP Definition

### Launch With (v1)

Minimum viable product for validating the concept.

- [x] **Message input field with auto-resize** — Core interaction. Textarea that grows to multi-line
- [x] **Streaming response display** — Table stakes for modern LLM chat. Token-by-token rendering
- [x] **Markdown rendering with sanitization** — LLMs output formatted text. Must render safely
- [x] **Code block syntax highlighting** — LLMs generate code frequently. Unformatted = broken
- [x] **Copy button for code blocks** — Users need to extract code. One-click copy is expected
- [x] **Loading state** — Show typing indicator or spinner while waiting for first token
- [x] **Stop generation button** — Users must be able to abort long/bad responses mid-stream
- [x] **Error handling with retry** — Network issues happen. Show message, allow retry
- [x] **Basic message history** — Display conversation in scrollable container
- [x] **Mobile-responsive layout** — Many users will access from phones

### Add After Validation (v1.x)

Features to add once core is working and users provide feedback.

- [ ] **Regenerate last response** — Users will want to retry without retyping (wait for request)
- [ ] **One-click clear conversation** — Better than page refresh (add when users ask)
- [ ] **Keyboard shortcuts** — Power users will request Cmd+Enter, Esc (nice quality-of-life)
- [ ] **Dark mode** — Reduces eye strain for long sessions (wait for user feedback)
- [ ] **DeepSeek model attribution** — Transparency about which model powers responses

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Message persistence** — Requires DB, auth, major architecture change
- [ ] **Multi-conversation threads** — Needs session management, sidebar UI
- [ ] **User authentication** — Only add if persistence/multi-user becomes critical
- [ ] **File/image upload** — Multimodal support increases cost and complexity
- [ ] **Message editing** — Complex state management, unclear UX patterns
- [ ] **Advanced model selection** — Let users pick model (adds decision fatigue)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Streaming responses | HIGH | MEDIUM | P1 |
| Markdown rendering | HIGH | LOW | P1 |
| Code syntax highlighting | HIGH | LOW | P1 |
| Copy button for code | HIGH | LOW | P1 |
| Message input | HIGH | LOW | P1 |
| Auto-resize input | MEDIUM | LOW | P1 |
| Loading state | HIGH | LOW | P1 |
| Stop generation | HIGH | MEDIUM | P1 |
| Error handling/retry | HIGH | MEDIUM | P1 |
| Message history display | HIGH | LOW | P1 |
| Mobile responsive | MEDIUM | MEDIUM | P1 |
| Regenerate response | MEDIUM | MEDIUM | P2 |
| Clear conversation | MEDIUM | LOW | P2 |
| Keyboard shortcuts | LOW | LOW | P2 |
| Dark mode | MEDIUM | LOW | P2 |
| Model attribution | LOW | LOW | P2 |
| Message persistence | MEDIUM | HIGH | P3 |
| Multi-conversations | MEDIUM | HIGH | P3 |
| User authentication | LOW | HIGH | P3 |
| File upload | MEDIUM | HIGH | P3 |
| Message editing | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch — core functionality and user expectations
- P2: Should have when possible — quality-of-life improvements based on feedback
- P3: Nice to have, future — architectural changes or scope expansion

## Competitor Feature Analysis

| Feature | ChatGPT | Claude.ai | Our Approach |
|---------|---------|-----------|--------------|
| Streaming | Yes, token-by-token | Yes, token-by-token | YES - DeepSeek supports this |
| Markdown | Yes | Yes | YES - react-markdown |
| Code highlighting | Yes with copy button | Yes with copy button | YES - Shiki + copy button |
| Stop generation | Yes | Yes | YES - abort fetch mid-stream |
| Conversation history | Persistent with auth | Persistent with auth | NO - cleared on refresh for simplicity |
| Regenerate | Yes | Yes | DEFER to P2 - wait for feedback |
| Multi-conversations | Sidebar with threads | Project organization | NO - single conversation only |
| Dark mode | Yes | Yes | DEFER to P2 - nice-to-have |
| File upload | Yes (Plus/Pro) | Yes (Pro) | NO - text-only for MVP |
| Model selection | Yes (GPT-3.5/4) | Yes (Opus/Sonnet) | NO - use cheapest DeepSeek model |

## Sources

- [Best Open Source Chat UIs for LLMs in 2026](https://poornaprakashsr.medium.com/5-best-open-source-chat-uis-for-llms-in-2025-11282403b18f)
- [Chrome Developer Docs: Best practices to render streamed LLM responses](https://developer.chrome.com/docs/ai/render-llm-responses)
- [Vercel AI SDK Documentation](https://ai-sdk.dev/docs/introduction)
- [AI SDK UI: Error Handling](https://ai-sdk.dev/docs/ai-sdk-ui/error-handling)
- [llm-ui: React library for LLMs](https://llm-ui.com/)
- [LibreChat: Syntax Highlighting](https://www.librechat.ai/docs/documentation/syntax_highlighting)
- [Beyond Chat: How AI is Transforming UI Design Patterns](https://artium.ai/insights/beyond-chat-how-ai-is-transforming-ui-design-patterns)
- [10 AI Chatbot Trends for 2026](https://www.oscarchat.ai/blog/10-ai-chatbot-trends-2026/)
- [CSS-Tricks: The Cleanest Trick for Autogrowing Textareas](https://css-tricks.com/the-cleanest-trick-for-autogrowing-textareas/)
- [Vercel AI Chatbot Template](https://github.com/vercel/ai-chatbot)

---
*Feature research for: Minimal LLM Chat Web Application*
*Researched: 2026-02-17*
