# Day1 AI Chat

## What This Is

A minimal web-based chat application that lets users have conversations with an LLM through the DeepSeek API. Single-page app with no authentication, no persistence — just a clean chat interface that streams responses in real time. Built with Next.js, deployed via Docker to a VPS.

## Core Value

Users can send messages and receive streaming LLM responses in a clean, responsive chat interface.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Text input for sending messages to the LLM
- [ ] Streaming responses from DeepSeek API (cheapest model)
- [ ] Markdown rendering in LLM responses (code blocks, bold, lists)
- [ ] Single conversation thread (cleared on page refresh)
- [ ] Production-ready Docker deployment (Dockerfile + docker-compose)
- [ ] Reverse proxy configuration for SSL/port management

### Out of Scope

- Login / authentication — not needed for a minimal chat app
- Chat history persistence — no database, conversations are ephemeral
- Multiple conversations / new chat button — single thread only
- File uploads or image generation — text-only chat
- User accounts or profiles — anonymous usage

## Context

- DeepSeek API is OpenAI-compatible, so the OpenAI SDK can be used with a different base URL
- Cheapest DeepSeek model to be used (currently deepseek-chat / V3)
- VPS deployment target — needs to be self-contained and production-hardened
- No external services beyond the DeepSeek API

## Constraints

- **Stack**: Next.js (App Router) — user preference
- **API**: DeepSeek API only — cheapest available model
- **Deployment**: Docker + docker-compose on VPS with reverse proxy
- **No persistence**: All state is in-memory, client-side only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| DeepSeek cheapest model | Cost efficiency, sufficient for general chat | — Pending |
| Docker deployment | Production standard — reproducible, isolated, easy rollbacks | — Pending |
| No persistence | Minimal scope — ephemeral conversations by design | — Pending |
| Streaming responses | Better UX — tokens appear as they arrive | — Pending |
| Markdown rendering | LLM responses contain code/formatting that should display properly | — Pending |

---
*Last updated: 2026-02-17 after initialization*
