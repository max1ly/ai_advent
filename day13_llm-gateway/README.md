# Day 13 — LLM Gateway

An educational HTTP proxy that sits between a client and an LLM provider (DeepSeek), demonstrating input/output guards for secret detection, audit logging, rate limiting, and cost tracking.

## Quickstart

```bash
pnpm install

# Copy your DeepSeek API key
cp .env.example .env.local
# Edit .env.local and set DEEPSEEK_API_KEY=sk-...

# Start the dev server (port 3131)
pnpm dev

# Send a test request
curl -s -X POST http://localhost:3131/chat \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"What services does FrostBank offer?"}'
```

## The 10 Canonical Test Cases

| # | Case | Expected |
|---|------|----------|
| 1 | Prompt with AWS access key `AKIAIOSFODNN7EXAMPLE` (block mode) | 400, finding=`AWS_ACCESS_KEY` |
| 2 | Prompt with credit card `4532015112830366` (Luhn valid) | 400, finding=`CREDIT_CARD` |
| 3 | Prompt with base64-encoded OpenAI key | 400, finding=`BASE64_SECRET` (nested `OPENAI_KEY`) |
| 4 | Prompt with fragmented key `sk-proj-abc` (8 chars after prefix) | **MISSED** by design |
| 5 | Clean prompt `"What's the weather in Berlin?"` | 200, non-empty reply |
| 6 | Prompt with email + phone number | 400, findings=`EMAIL`, `PHONE` |
| 7 | Prompt with GitHub token `ghp_...` | 400, finding=`GITHUB_TOKEN` |
| 8 | Clean prompt; model returns hallucinated AWS key | 502, output blocked |
| 9 | Prompt asking for instructions; model leaks canary | 502, canary leak detected |
| 10 | Exceed rate limit within 60s window | 429 with `retryAfter` |

Run `pnpm acceptance` to execute all 10 cases against a mock provider and generate `RESULTS.md`.

## Why Case 4 Is a Known Miss

Case 4 sends `"my key: sk-proj-abc"` — the fragment after the `sk-proj-` prefix is only 3 characters, well below the 20-character minimum threshold in the `OPENAI_KEY` regex pattern.

Lowering the threshold to catch this would cause massive false positives against legitimate short strings that happen to start with `sk-`. This is an inherent limitation of regex-based secret detection.

**Future work:** AST/semantic detection, entropy heuristics, or integration with dedicated secret-scanning engines (e.g., TruffleHog, GitLeaks) could catch fragmented or obfuscated secrets that regex misses.

## Reading the Audit Log

```bash
tail -f logs/requests-$(date +%F).jsonl | jq .
```

Each line is a JSON object with: `ts`, `requestId`, `ip`, `event`, `mode`, `inputAction`, `outputAction`, `inputFindings`, `outputFlags`, `promptTokens`, `completionTokens`, `costUsd`, and more. Raw secret values are never stored — only SHA-256 hashes (first 16 hex chars).

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `DEEPSEEK_API_KEY` | (required) | DeepSeek API key |
| `DEEPSEEK_MODEL` | `deepseek-chat` | Model to use |
| `GATEWAY_PORT` | `3131` | Server port |
| `GUARD_MODE` | `block` | Default guard mode: `block` or `mask` |
| `RATE_LIMIT_PER_MIN` | `20` | Max requests per IP per 60s window |
| `LOG_DIR` | `./logs` | Directory for JSONL audit logs |
| `URL_ALLOWLIST` | (empty) | Comma-separated hostnames to allow in output URLs |

## Non-Goals (v1)

These are explicitly out of scope and not implemented:

- Streaming / SSE
- Database (SQLite, Postgres, etc.)
- Redis or external state stores
- Authentication / API keys for gateway clients
- Multi-tenancy
- Docker / docker-compose
- OpenAI or Anthropic providers
- Web UI / HTML demo page
- CI workflow (.github/workflows)

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server with hot reload |
| `pnpm test` | Run Vitest unit + integration tests |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm acceptance` | Run 10 canonical cases, produce RESULTS.md |
| `pnpm build` | TypeScript compile to dist/ |
| `pnpm start` | Run compiled build |
