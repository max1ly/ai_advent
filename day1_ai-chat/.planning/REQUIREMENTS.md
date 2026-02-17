# Requirements: Day1 AI Chat

**Defined:** 2026-02-17
**Core Value:** Users can send messages and receive streaming LLM responses in a clean, responsive chat interface

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Chat Interface

- [ ] **CHAT-01**: User can type messages in an auto-resizing textarea
- [ ] **CHAT-02**: User can send messages by pressing Enter or clicking Send
- [ ] **CHAT-03**: User sees their sent messages displayed in a conversation thread
- [ ] **CHAT-04**: User sees AI responses stream in token-by-token as they are generated
- [ ] **CHAT-05**: User sees a loading indicator while waiting for the first token
- [ ] **CHAT-06**: User can scroll through conversation history

### LLM Integration

- [ ] **LLM-01**: User messages are sent to DeepSeek API via server-side route (API key never exposed to browser)
- [ ] **LLM-02**: AI responses stream back using Server-Sent Events
- [ ] **LLM-03**: User sees a clear error message when the API fails, with option to retry
- [ ] **LLM-04**: DeepSeek model is configurable via environment variable

### Content Rendering

- [ ] **CONT-01**: AI responses render markdown formatting (bold, italic, lists, headings, inline code)
- [ ] **CONT-02**: Markdown rendering is XSS-safe (no raw HTML execution)

### Deployment

- [ ] **DEPL-01**: App builds and runs in a Docker container using multi-stage build with standalone output
- [ ] **DEPL-02**: Docker image is production-optimized (< 200MB, non-root user, .dockerignore)
- [ ] **DEPL-03**: App is deployable to VPS with a single docker-compose command
- [ ] **DEPL-04**: Environment variables (API key, model) are configurable at runtime without rebuilding

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Chat Enhancements

- **CHAT-07**: User can stop an in-progress AI response mid-stream
- **CHAT-08**: User can regenerate the last AI response without retyping
- **CHAT-09**: User can clear the conversation with one click

### Content Enhancements

- **CONT-03**: Code blocks render with syntax highlighting
- **CONT-04**: Code blocks have a copy-to-clipboard button

### UX Enhancements

- **UX-01**: Mobile-responsive layout for phone screens
- **UX-02**: Keyboard shortcuts (Enter to send, Escape to stop)
- **UX-03**: Dark mode with system preference detection

### Deployment Enhancements

- **DEPL-05**: Reverse proxy configuration (Nginx/Caddy) for SSL termination
- **DEPL-06**: Health check endpoint for monitoring

## Out of Scope

| Feature | Reason |
|---------|--------|
| User authentication / accounts | Not needed for minimal chat — adds complexity, security surface |
| Chat persistence / database | Conversations are ephemeral by design — no storage needed |
| Multiple conversations | Single thread cleared on refresh — keeps it simple |
| File/image upload | Text-only chat — multimodal adds cost and complexity |
| Message editing | Complex state management for minimal benefit |
| Rate limiting | No auth = can't track users; VPS firewall handles abuse |
| Multiple LLM providers | DeepSeek only for v1 — AI SDK makes switching easy later |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CHAT-01 | Phase 1 | Pending |
| CHAT-02 | Phase 1 | Pending |
| CHAT-03 | Phase 1 | Pending |
| CHAT-04 | Phase 1 | Pending |
| CHAT-05 | Phase 1 | Pending |
| CHAT-06 | Phase 1 | Pending |
| LLM-01 | Phase 1 | Pending |
| LLM-02 | Phase 1 | Pending |
| LLM-03 | Phase 1 | Pending |
| LLM-04 | Phase 1 | Pending |
| CONT-01 | Phase 1 | Pending |
| CONT-02 | Phase 1 | Pending |
| DEPL-01 | Phase 2 | Pending |
| DEPL-02 | Phase 2 | Pending |
| DEPL-03 | Phase 2 | Pending |
| DEPL-04 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-02-17*
*Last updated: 2026-02-17 after roadmap creation*
