# Roadmap: Day1 AI Chat

## Overview

Build a minimal web-based LLM chat application in two phases: first establish a working streaming chat interface with DeepSeek API integration and secure markdown rendering, then package it for production deployment with Docker. The journey prioritizes proving the core streaming architecture before tackling deployment complexity.

## Phases

**Phase Numbering:**
- Integer phases (1, 2): Planned milestone work
- Decimal phases (1.1, 1.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Core Chat** - Working streaming chat interface with DeepSeek integration
- [ ] **Phase 2: Production Deployment** - Docker packaging and VPS deployment

## Phase Details

### Phase 1: Foundation & Core Chat
**Goal**: Users can send messages and receive streaming LLM responses in a clean, responsive chat interface
**Depends on**: Nothing (first phase)
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, CHAT-06, LLM-01, LLM-02, LLM-03, LLM-04, CONT-01, CONT-02
**Success Criteria** (what must be TRUE):
  1. User can type multi-line messages in an auto-resizing textarea and send with Enter or button
  2. User sees their messages and AI responses displayed in a scrollable conversation thread
  3. User sees AI responses stream in token-by-token with a loading indicator before first token
  4. User sees markdown formatting in AI responses (bold, lists, code blocks) rendered safely without XSS risk
  5. User sees a clear error message with retry option when the API fails
**Plans:** 2 plans

Plans:
- [ ] 01-01-PLAN.md — Scaffold Next.js 15 project and create streaming DeepSeek API route
- [ ] 01-02-PLAN.md — Build complete chat UI with streaming, markdown, auto-scroll, and error handling

### Phase 2: Production Deployment
**Goal**: App is deployable to VPS with a single docker-compose command
**Depends on**: Phase 1
**Requirements**: DEPL-01, DEPL-02, DEPL-03, DEPL-04
**Success Criteria** (what must be TRUE):
  1. App builds into a Docker image under 200MB using multi-stage build with standalone output
  2. Docker image runs as non-root user with proper security configuration
  3. App starts with docker-compose and is accessible from the host machine
  4. DeepSeek API key and model name are configurable via environment variables at runtime without rebuilding
**Plans**: TBD

Plans:
- [ ] (Plans will be created during `/gsd:plan-phase 2`)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Core Chat | 0/2 | Planned | - |
| 2. Production Deployment | 0/TBD | Not started | - |

---
*Roadmap created: 2026-02-17*
*Last updated: 2026-02-17*
