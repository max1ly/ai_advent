# Debugging Rules

## Philosophy

All debugging tools (server start, tests, port management, Docker, browser DevTools) are pre-authorized in project settings. Proceed without hesitation.

- **Investigate, don't assume** — trace actual execution before hypothesizing
- Find root cause — don't patch symptoms
- Compare 2-3 approaches for non-trivial fixes (correctness, security, prod-readiness, project fit)
- Iterate until verified — fix isn't done until tests pass AND browser confirms

## Workflow

1. **Reproduce** — confirm the issue via browser (`http://localhost:3030`) and/or server logs
2. **Investigate** — read source code, trace data/control flow, add `[Module]` prefixed `console.log` if needed
3. **Diagnose** — identify exact root cause before proposing any fix
4. **Compare approaches** — for non-trivial issues, evaluate 2-3 options for security, prod-readiness, project patterns, simplicity
5. **Fix** — apply chosen approach with production-ready quality
6. **Validate** — run `pnpm vitest run` from project root AND check browser at `http://localhost:3030`
7. **Iterate** — if validation fails, restart services and return to step 2

## Service Management

### Start Services

```bash
# Client (port 3030)
pnpm dev

# Docker services (PostgreSQL + Redis)
pnpm docker:up
```

### Kill Stale Processes

```bash
kill $(lsof -t -i:3030 -sTCP:LISTEN) 2>/dev/null   # Client
```

### When to Restart

Restart the server after:
- Server source code changes
- Environment or config file changes
- Database schema changes (after running migrations)

## Anti-Patterns

- **NEVER** assume a fix works without running tests and checking the browser
- **NEVER** leave debug `console.log` statements in the final fix
- **NEVER** apply quick hacks or TODO workarounds — do the proper fix
- **NEVER** skip approach comparison for non-trivial issues
