# Domain Pitfalls

**Domain:** Minimal LLM Chat Web Application
**Researched:** 2026-02-17
**Confidence:** HIGH

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: SSE Buffering - Streaming Works Locally, Fails in Production

**What goes wrong:**
Streaming implementation works perfectly in development (`next dev`) but arrives all-at-once in production. Users see no incremental streaming — the entire response dumps after completion, creating a poor UX that defeats the purpose of streaming.

**Why it happens:**
Next.js waits for the route handler function to complete before sending the Response to the client. If you run an async `for await` loop that processes chunks before returning the Response, Next.js buffers everything until the handler finishes. Additionally, many deployment platforms (AWS Amplify, Vercel Edge in certain configurations) impose restrictions on streaming responses.

**How to avoid:**
- Return the ReadableStream immediately from the route handler, don't await the entire stream processing
- Use proper streaming pattern: `return new Response(stream)` where stream is a ReadableStream
- Export required route segment config: `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'`
- Test on your actual deployment platform early — don't assume local success means production success
- Verify platform supports HTTP streaming (AWS Amplify notably does not for Next.js API routes)

**Warning signs:**
- "It works on my machine" but production shows buffered responses
- Response headers missing `Transfer-Encoding: chunked`
- Entire response arrives in browser DevTools as single chunk
- No progressive rendering in UI despite streaming code

**Phase to address:**
Phase 1 (Core API Integration) - Implement and verify streaming works on target deployment platform before building dependent features.

---

### Pitfall 2: XSS Vulnerabilities in Markdown Rendering

**What goes wrong:**
LLM responses containing malicious HTML/JavaScript execute in the browser, compromising user security. This is especially dangerous because LLMs can be prompted to generate malicious payloads, and without sanitization, your app becomes a vector for XSS attacks.

**Why it happens:**
Most markdown libraries (markdown2, showdown, markdown-it) allow raw HTML to pass through unchanged by default. Developers assume markdown rendering is "safe" but it's not — markdown syntax explicitly allows arbitrary HTML to be included. When rendered, embedded `<script>` tags or event handlers (`onclick`, `onerror`) execute.

**How to avoid:**
- Use react-markdown which escapes HTML by default
- Never use `dangerouslySetInnerHTML` with unsanitized LLM output
- If using other markdown libraries, explicitly disable HTML rendering or use sanitization libraries like DOMPurify
- Implement Content Security Policy (CSP) headers to block inline script execution
- Test with malicious payloads: `<img src=x onerror=alert('XSS')>`, `<script>alert('XSS')</script>`

**Warning signs:**
- Markdown library documentation mentions "allows HTML" or "HTML pass-through"
- No mention of sanitization in your rendering code
- Using libraries like markdown2 or showdown without explicit HTML sanitization config
- CSP headers not configured in responses

**Phase to address:**
Phase 1 (Core API Integration) - Security must be built-in from start, not retrofitted. Choose secure-by-default markdown renderer before writing UI code.

---

### Pitfall 3: NEXT_PUBLIC_ Environment Variables Frozen at Build Time

**What goes wrong:**
You build a Docker image with `NEXT_PUBLIC_API_KEY=dev-key`, deploy it to production, set `NEXT_PUBLIC_API_KEY=prod-key` at runtime, but the app still uses `dev-key`. API calls fail or leak dev credentials to production.

**Why it happens:**
`NEXT_PUBLIC_*` variables are inlined into the JavaScript bundle during `next build`. The build process performs string replacement, so the value is hardcoded at build time. Setting them at runtime (via docker run -e or Kubernetes env) has no effect because the bundle already contains the build-time value.

**How to avoid:**
- For this minimal app (no auth, no persistence), minimize use of `NEXT_PUBLIC_*` variables
- API key should be server-side only, never exposed to client with `NEXT_PUBLIC_` prefix
- DeepSeek API calls must be made from API routes, not client-side
- If you need runtime configuration, create an API endpoint that provides config values instead
- For Docker: use build args for `NEXT_PUBLIC_*` values that must be available at build time
- Document which env vars are build-time vs runtime in your README

**Warning signs:**
- Environment variables prefixed with `NEXT_PUBLIC_` being set at container runtime
- API keys in client-side code (visible in browser DevTools)
- Same Docker image expected to work across dev/staging/prod with different NEXT_PUBLIC values
- Console showing wrong environment values after deployment

**Phase to address:**
Phase 1 (Core API Integration) - Architecture decision: API calls server-side only, env vars never exposed to client.

---

### Pitfall 4: Missing Static Assets in Standalone Docker Build

**What goes wrong:**
Next.js builds successfully, Docker image runs, server starts, but the app shows broken images, missing CSS, 404s for static files. The UI is completely broken or unstyled.

**Why it happens:**
Next.js `output: "standalone"` creates a minimal `.next/standalone` folder that copies only necessary files for production. However, it does NOT include the `public/` or `.next/static/` folders by default because Vercel assumes these will be served by a CDN. When self-hosting with Docker, these folders are missing from the standalone output.

**How to avoid:**
- After `next build`, manually copy `public/` and `.next/static/` to standalone folder
- Dockerfile pattern:
  ```dockerfile
  COPY --from=builder /app/public ./public
  COPY --from=builder /app/.next/static ./.next/static
  ```
- Verify static files exist in final image: `docker run --rm IMAGE ls -la public`
- Test full Docker image locally before deploying to VPS

**Warning signs:**
- Build succeeds but runtime shows 404 errors for `/static/*` or `/public/*`
- Dockerfile only copies `.next/standalone` without additional COPY commands
- Images, fonts, or other static assets fail to load
- Browser DevTools Network tab shows 404s for expected static resources

**Phase to address:**
Phase 2 (Docker Deployment) - Discovered during Docker setup, requires Dockerfile changes before deployment.

---

### Pitfall 5: Rate Limiting and Timeout Errors Without Exponential Backoff

**What goes wrong:**
DeepSeek API returns 429 (rate limit) or 503 (overloaded) errors, your app crashes or shows cryptic error messages to users. During peak usage or high demand periods (which DeepSeek experiences frequently), the app becomes unusable.

**Why it happens:**
Developers implement happy-path API integration without error handling for rate limits, timeouts, or service degradation. DeepSeek has experienced frequent capacity issues and rate limiting, especially during peak times. Without retry logic, every rate limit error becomes a user-facing failure.

**How to avoid:**
- Implement exponential backoff with jitter for 429, 500, 503 errors
- Pattern: wait 1s, then 2s, then 4s + random jitter, max 3-5 retries
- Monitor rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- Enable streaming (`stream: true`) to prevent timeout on long responses (DeepSeek has 2-minute timeout limit)
- Return user-friendly error messages: "DeepSeek is currently overloaded, please try again in a moment"
- Handle timeout errors specifically for R1 model which can exceed 2-minute limits

**Warning signs:**
- No try/catch around API calls
- API errors crash the server or return 500 to client
- No retry logic in API route handler
- Users report "it works sometimes but not always"
- No error handling for specific HTTP status codes (429, 503)

**Phase to address:**
Phase 1 (Core API Integration) - Build retry logic into initial API integration, not as afterthought.

---

### Pitfall 6: Auto-Scroll Disrupting User Reading Experience

**What goes wrong:**
As streaming response arrives, the chat auto-scrolls to bottom continuously, but if the user scrolls up to read earlier messages, the page keeps jumping back down, making it impossible to read previous content. Alternatively, auto-scroll doesn't work at all, forcing users to manually scroll to see new tokens.

**Why it happens:**
Naive implementation either: (a) calls `scrollIntoView()` on every token received, disrupting intentional user scrolling, or (b) never auto-scrolls, burying new content below the fold. Proper auto-scroll requires tracking whether the user is actively reading vs. passively viewing latest content.

**How to avoid:**
- Use ChatScrollAnchor pattern: invisible element at bottom of chat
- Use IntersectionObserver to detect if anchor is visible
- Only auto-scroll when anchor is in viewport (user is at bottom)
- If user has scrolled up (anchor not visible), don't force scroll
- Provide "Jump to latest" button when user is scrolled up and new messages arrive
- Smooth scroll behavior: `behavior: 'smooth'` to avoid jarring jumps

**Warning signs:**
- User feedback: "I can't read old messages while new ones arrive"
- Scroll position resets on every token received
- Messages appear below viewport with no way to notice them
- No differentiation between user-initiated scroll and programmatic scroll

**Phase to address:**
Phase 1 (Chat UI) - Core UX feature, must be correct from initial implementation.

---

## Moderate Pitfalls

### Pitfall 7: Missing Loading States During API Calls

**What goes wrong:**
User sends message, UI shows nothing, no indication that processing is happening. User clicks send again (duplicate request) or thinks app is broken. Poor perceived performance.

**Why it happens:**
Developers focus on streaming response but forget the delay between user submit and first token arrival (can be 1-3 seconds for DeepSeek). No visual feedback during this "thinking time."

**How to avoid:**
- Show loading state immediately on message submit
- Typing indicator with animated dots (not static) while waiting for first chunk
- Disable send button during active request
- Clear loading state on first chunk received or on error
- For R1 model specifically, set expectation: "Reasoning models may take longer..."

**Warning signs:**
- Send button clickable during active request
- No visual feedback between submit and response
- User testing reveals confusion about whether request was received
- Multiple duplicate requests in server logs

**Phase to address:**
Phase 1 (Chat UI) - Simple addition that significantly improves perceived performance.

---

### Pitfall 8: Docker Container Not Binding to 0.0.0.0

**What goes wrong:**
Next.js runs inside Docker container, `docker ps` shows container running, but you can't access the app from outside the container. Curl from host machine fails. VPS deployment is completely inaccessible.

**Why it happens:**
Next.js defaults to `localhost` (127.0.0.1) which is not accessible outside the container. Docker networking requires binding to `0.0.0.0` to accept connections from outside the container network.

**How to avoid:**
- Start Next.js with hostname configured: `next start -H 0.0.0.0`
- Or set `ENV HOSTNAME=0.0.0.0` in Dockerfile
- Verify in container: `docker exec CONTAINER netstat -tulpn` shows `0.0.0.0:3030`
- Test locally: `docker run -p 3000:3030 IMAGE` then curl `localhost:3030`
- VPS: ensure security group/firewall allows inbound on port 3000

**Warning signs:**
- Container runs but `curl localhost:3030` from host fails
- netstat shows `127.0.0.1:3030` instead of `0.0.0.0:3030`
- Works with `docker exec CONTAINER curl localhost:3030` but not from outside
- VPS deployment inaccessible despite container running

**Phase to address:**
Phase 2 (Docker Deployment) - Caught during local Docker testing before VPS deployment.

---

### Pitfall 9: Process Management - Using npm/yarn to Start App

**What goes wrong:**
Docker container doesn't respond to SIGTERM, takes 10+ seconds to stop, or doesn't shut down gracefully. In orchestrated environments (Kubernetes, Docker Swarm), this causes forced kills and potential data loss.

**Why it happens:**
Running `npm start` or `yarn start` as PID 1 means npm receives signals, not your app. npm doesn't properly forward SIGTERM to child processes, causing Next.js to not shut down gracefully.

**How to avoid:**
- Use `node .next/standalone/server.js` directly in CMD/ENTRYPOINT
- Don't use npm or yarn to start production server
- Alternatively, use a process manager like `tini` as PID 1 to handle signals
- Test: `docker stop CONTAINER` should complete in 1-2 seconds, not timeout at 10s

**Warning signs:**
- CMD in Dockerfile is `npm start` or `yarn start`
- `docker stop` hangs for 10 seconds before force killing
- Logs show container received SIGTERM but Next.js keeps running
- PID 1 in container is npm/yarn instead of node

**Phase to address:**
Phase 2 (Docker Deployment) - Optimization during Docker setup, affects operational reliability.

---

### Pitfall 10: Hard-Coded Model Names Without Configuration

**What goes wrong:**
DeepSeek releases a new model or deprecates old one, your code has `model: "deepseek-chat"` hardcoded in 5 different places. Now you need to change it everywhere, retest, and redeploy. If you want to experiment with different models, it requires code changes.

**Why it happens:**
Initial implementation hardcodes model name because it's simple. As requirements evolve (different models for different users, A/B testing, cost optimization), hardcoded values become technical debt.

**How to avoid:**
- Environment variable: `DEEPSEEK_MODEL=deepseek-chat`
- Single source of truth in config file
- Even for "minimal" app, use env var from start — costs nothing, saves refactoring later
- Document which models are supported/tested

**Warning signs:**
- String literal "deepseek-chat" appears in multiple files
- Changing models requires code changes, not config changes
- No easy way to test different models without modifying source

**Phase to address:**
Phase 1 (Core API Integration) - Trivial to implement correctly from start, painful to refactor later.

---

## Minor Pitfalls

### Pitfall 11: TextEncoder Instantiation in Hot Path

**What goes wrong:**
Performance degradation on streaming responses — creating new TextEncoder instance for every chunk is wasteful and creates unnecessary garbage collection pressure.

**Why it happens:**
Copy-paste from examples that create `const encoder = new TextEncoder()` inside the chunk processing loop instead of outside.

**How to avoid:**
- Create TextEncoder once at module level or outside the streaming loop
- Pattern: `const encoder = new TextEncoder()` before async generator function
- Reuse same encoder instance for all chunks

**Phase to address:**
Phase 1 (Core API Integration) - Micro-optimization, but easy to do correctly from start.

---

### Pitfall 12: Missing .dockerignore File

**What goes wrong:**
Docker build takes 5+ minutes, image size is 2GB+, or builds fail because node_modules from host are copied into the image.

**Why it happens:**
Without `.dockerignore`, Docker copies everything from build context including `node_modules`, `.next`, `.git`, `*.log`, etc. This bloats the build cache and final image.

**How to avoid:**
- Create `.dockerignore` with at minimum:
  ```
  node_modules
  .next
  .git
  *.log
  .env*.local
  ```
- Verify: `docker build` should show "COPY . ." transferring <50MB for minimal app

**Phase to address:**
Phase 2 (Docker Deployment) - Standard Docker best practice.

---

### Pitfall 13: Response Not Closed on Error During Streaming

**What goes wrong:**
If error occurs mid-stream (DeepSeek timeout, API error), the client hangs indefinitely waiting for stream completion. Browser connection stays open, consuming resources.

**Why it happens:**
Error handling doesn't explicitly close the stream controller. The stream remains in readable state even though no more data is coming.

**How to avoid:**
- In catch blocks: `controller.close()` or `controller.error(error)`
- Ensure finally block cleans up stream state
- Test error cases: kill DeepSeek API mid-stream and verify client receives error

**Warning signs:**
- Network request in DevTools shows "pending" indefinitely after error
- No error message shown to user when API fails mid-stream
- Memory leaks from unclosed streams

**Phase to address:**
Phase 1 (Core API Integration) - Error handling edge case, often missed in happy-path testing.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcode DeepSeek API key in code | Fast to implement | Security risk, can't rotate keys without redeployment, leaks in git history | Never - always use env vars |
| Skip error handling for rate limits | Clean happy-path code | App breaks during peak usage, poor UX, no retry logic | Never - DeepSeek has frequent capacity issues |
| Client-side API calls to DeepSeek | Simpler architecture, no API route needed | API key exposed to client, rate limits harder to manage, CORS issues | Never - API keys must be server-side |
| No Dockerfile multi-stage build | Simpler Dockerfile | 2GB+ images, includes dev dependencies in production | Never - multi-stage is standard practice |
| Skip CSP headers | Less configuration | XSS vulnerabilities, no defense-in-depth | Never - CSP is basic security hygiene |
| No streaming, just await full response | Easier to implement | Poor UX for long responses, timeout issues with R1 model | Never - streaming is key feature |
| Use default markdown library settings | Works out of box | XSS vulnerabilities from HTML pass-through | Never - security can't be compromised |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| DeepSeek API | Not enabling `stream: true` | Always use streaming to avoid timeouts and enable progressive UX |
| DeepSeek API | No handling for 429/503 errors | Implement exponential backoff with jitter for rate limits and overload errors |
| DeepSeek API | Assuming 100% uptime | Add user-facing error messages, monitor status.deepseek.com, have fallback UX |
| Docker networking | Binding to localhost | Bind to 0.0.0.0 for external access, verify with netstat |
| Next.js API routes | Returning Response before stream completes | Return stream immediately, let Next.js handle the streaming |
| Environment variables | Using NEXT_PUBLIC_ for API keys | Server-side only, use API routes as proxy |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| No rate limit on client send button | Users spam send, hit DeepSeek rate limits | Disable button during active request, show loading state | ~10-20 rapid requests |
| Creating new TextEncoder per chunk | Increased GC pressure, minor slowdown | Instantiate once, reuse for all chunks | Noticeable after hundreds of chunks |
| Unbounded message history in memory | Memory grows indefinitely | For stateless app, clear on refresh (current design); for persistent, limit history | After dozens of long conversations |
| No timeout on API calls | Hang indefinitely on DeepSeek outage | Set fetch timeout (e.g., 60s for streaming) | First time DeepSeek is down/slow |
| Large Docker images (2GB+) | Slow deployments, high bandwidth usage | Multi-stage builds, .dockerignore, Alpine base | Every deployment is slow |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Client-side API calls exposing DeepSeek key | Key theft, unauthorized usage, cost overruns | Server-side API routes only, never NEXT_PUBLIC_ prefix |
| No HTML sanitization in markdown | XSS attacks via malicious LLM responses | Use react-markdown or explicit sanitization with DOMPurify |
| Missing CSP headers | XSS exploitation, data exfiltration | Set Content-Security-Policy headers in Next.js config |
| API keys in Docker image layers | Keys leak via `docker history IMAGE` | Use build args, secrets at runtime, never ARG for sensitive data |
| No rate limiting on API routes | DoS attack vector, cost overruns | Add rate limiting middleware (even simple in-memory for single VPS) |
| Logging API responses with PII | Data leakage in logs | Sanitize logs, don't log full LLM responses |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No streaming, wait for full response | 10-30s blank screen, user thinks app is broken | Stream tokens as they arrive for responsive feel |
| Auto-scroll during user reading | User can't read old messages while new ones arrive | Only auto-scroll when user is at bottom (ChatScrollAnchor pattern) |
| No loading indicator during "thinking time" | Confusion whether app received request | Animated typing indicator, disabled send button |
| Generic error messages | User doesn't know what went wrong or how to fix | Specific errors: "DeepSeek is overloaded" vs. "Something went wrong" |
| No indication of streaming in progress | User doesn't know response is incomplete | Loading indicator at end of partial response |
| Message input not cleared after send | Unclear whether message was sent | Clear input immediately on send, restore on error |
| No visual distinction between user/AI messages | Confusing conversation flow | Clear styling: different backgrounds, avatars, alignment |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Streaming**: Works in dev with `next dev` — verify works in production Docker container on actual deployment platform
- [ ] **Environment Variables**: Set at runtime — verify NEXT_PUBLIC_ variables are either build-time with ARG or moved to server-side API
- [ ] **Static Assets**: App renders in dev — verify `public/` and `.next/static/` are included in Docker standalone build
- [ ] **Error Handling**: Happy path works — verify 429, 500, 503, timeout, network errors all show user-friendly messages
- [ ] **Markdown Security**: Renders markdown — verify HTML is escaped or sanitized, test with XSS payloads
- [ ] **Docker Networking**: Container runs — verify accessible from outside container (0.0.0.0 binding), test from host machine
- [ ] **Auto-scroll**: New messages appear — verify doesn't disrupt user reading, only scrolls when user at bottom
- [ ] **Loading States**: Response streams — verify loading indicator during delay before first chunk arrives
- [ ] **Graceful Shutdown**: Container stops — verify SIGTERM handled properly (not using npm/yarn to start)
- [ ] **API Key Security**: API calls work — verify key never exposed to client, check browser DevTools network tab

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| SSE Buffering in production | MEDIUM | Add `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'` to route, verify platform supports streaming, may need platform migration if not supported |
| XSS from markdown rendering | HIGH | Replace markdown library with react-markdown, audit all existing content, add CSP headers, security advisory if user data compromised |
| NEXT_PUBLIC_ vars frozen at build | MEDIUM | Move API calls to server-side routes, remove NEXT_PUBLIC_ prefix, rebuild and redeploy image |
| Missing static assets in Docker | LOW | Update Dockerfile to COPY public/ and .next/static/, rebuild image |
| No rate limit handling | LOW | Add exponential backoff retry logic to API route, wrap in try/catch, test with rate limit errors |
| Auto-scroll disruption | MEDIUM | Refactor to ChatScrollAnchor pattern with IntersectionObserver, requires React component changes |
| Container not accessible (localhost binding) | LOW | Update start command to `-H 0.0.0.0`, rebuild image, redeploy |
| npm/yarn as PID 1 | LOW | Change CMD to `node server.js` directly, rebuild image |
| Hardcoded model names | LOW | Extract to env var, update config, redeploy (no code changes if done right) |
| TextEncoder in hot path | LOW | Move instantiation outside loop, minimal refactor |
| Missing .dockerignore | LOW | Create .dockerignore, rebuild image (faster builds going forward) |
| Stream not closed on error | MEDIUM | Add controller.close() in catch/finally blocks, test error scenarios |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| SSE Buffering | Phase 1: Core API Integration | Deploy to production env, verify streaming with browser DevTools Network tab |
| XSS in markdown | Phase 1: Core API Integration | Test with malicious payload: `<img src=x onerror=alert('XSS')>`, verify no alert |
| NEXT_PUBLIC_ vars frozen | Phase 1: Core API Integration | Build Docker image once, run with different env vars, verify server-side config |
| Missing static assets | Phase 2: Docker Deployment | Build Docker image, run container, verify all assets load without 404s |
| Rate limit handling | Phase 1: Core API Integration | Trigger 429 error (rapid requests), verify exponential backoff and user message |
| Auto-scroll disruption | Phase 1: Chat UI | During streaming, scroll up, verify page doesn't force scroll to bottom |
| Container networking | Phase 2: Docker Deployment | Access from outside container, verify 0.0.0.0 binding with netstat |
| npm/yarn PID 1 | Phase 2: Docker Deployment | `docker stop CONTAINER`, verify stops in <2s without timeout |
| Hardcoded model | Phase 1: Core API Integration | Change env var, restart, verify different model used without code changes |
| TextEncoder hot path | Phase 1: Core API Integration | Code review during implementation |
| Missing .dockerignore | Phase 2: Docker Deployment | Check build time and image size, compare with/without .dockerignore |
| Stream not closed on error | Phase 1: Core API Integration | Kill API mid-stream, verify client receives error and connection closes |

## Sources

**Streaming Implementation:**
- [How to Fix Streaming SSR Issues in Next.js](https://oneuptime.com/blog/post/2026-01-24-nextjs-streaming-ssr-issues/view)
- [Fixing Slow SSE Streaming in Next.js and Vercel](https://medium.com/@oyetoketoby80/fixing-slow-sse-server-sent-events-streaming-in-next-js-and-vercel-99f42fbdb996)
- [App Router pitfalls: common Next.js mistakes](https://imidef.com/en/2026-02-11-app-router-pitfalls)
- [Next.js Route Handlers Official Docs](https://nextjs.org/docs/app/api-reference/file-conventions/route)

**LLM Streaming Challenges:**
- [AnyCable, Rails, and the pitfalls of LLM-streaming](https://evilmartians.com/chronicles/anycable-rails-and-the-pitfalls-of-llm-streaming)
- [How to Build LLM Streams That Survive Reconnects](https://upstash.com/blog/resumable-llm-streams)
- [Understanding LLM Chat Streaming](https://langtail.com/blog/llm-chat-streaming)

**Docker Deployment:**
- [Docker Next.js deployment common mistakes](https://medium.com/@mindelias/how-to-deploy-next-js-to-azure-app-service-with-docker-a-complete-guide-to-environment-variables-1aa19d85000a)
- [Dockerize a Next.js App](https://medium.com/@itsuki.enjoy/dockerize-a-next-js-app-4b03021e084d)
- [Next.js with Docker standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)

**Environment Variables:**
- [Runtime environment variables in Next.js with Docker](https://nemanjamitic.com/blog/2025-12-13-nextjs-runtime-environment-variables/)
- [NEXT_PUBLIC environment variables Docker discussion](https://github.com/vercel/next.js/discussions/17641)

**DeepSeek API:**
- [DeepSeek API Error Codes](https://api-docs.deepseek.com/quick_start/error_codes)
- [DeepSeek API Not Working - Common Issues](https://deepseeksguides.com/deepseek-api-not-working/)
- [API Request Timeout for DeepSeek-R1](https://learn.microsoft.com/en-us/answers/questions/2154129/api-request-timeout-at-2-minutes-for-deepseek-r1-m)

**Rate Limiting & Error Handling:**
- [Handling API Errors and Rate Limits](https://apxml.com/courses/prompt-engineering-llm-application-development/chapter-4-interacting-with-llm-apis/handling-api-errors-rate-limits)
- [Tackling rate limiting for LLM apps](https://portkey.ai/blog/tackling-rate-limiting-for-llm-apps/)
- [API Rate Limits Explained: Best Practices for 2025](https://orq.ai/blog/api-rate-limit)

**Security:**
- [CVE-2026-22813 OpenCode AI XSS Vulnerability](https://www.pointguardai.com/ai-security-incidents/opencode-ai-ui-turns-chat-output-into-code-cve-2026-22813)
- [Secure Markdown Rendering in React](https://www.pullrequest.com/blog/secure-markdown-rendering-in-react-balancing-flexibility-and-safety/)
- [Markdown XSS Vulnerability mitigation](https://github.com/showdownjs/showdown/wiki/Markdown's-XSS-Vulnerability-(and-how-to-mitigate-it))

**UX Best Practices:**
- [Intuitive Scrolling for Chatbot Message Streaming](https://tuffstuff9.hashnode.dev/intuitive-scrolling-for-chatbot-message-streaming)
- [Streaming chat scroll to bottom with React](https://davelage.com/posts/chat-scroll-react/)
- [UX for AI Chatbots: Complete Guide (2026)](https://www.parallelhq.com/blog/ux-ai-chatbots)

---
*Pitfalls research for: Minimal LLM Chat Web Application*
*Researched: 2026-02-17*
