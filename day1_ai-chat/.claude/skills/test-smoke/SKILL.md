---
name: test-smoke
description: Level 2 — execute 3–5 natural-language UI scenarios against the running day1_ai-chat app using Playwright. Detects or launches the app on :3030, generates a spec per scenario, runs them serially, captures screenshots on failure, and writes a diagnosis report. Use when the user says "run smoke test", "test the UI", or "test scenarios: ...".
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
---

# test-smoke (Level 2)

Goal: execute user-described UI scenarios against a live app and report.

## Preconditions

- `@playwright/test` installed and `pnpm exec playwright install chromium` has been run.
- Working directory = project root.
- `DEEPSEEK_API_KEY` present in env for scenarios that send chat messages (check `echo $DEEPSEEK_API_KEY | head -c 4`). Missing → fail fast with a clear error.

## Inputs

3–5 natural-language scenarios from the user's prompt. Example:
- "Open the app, make sure a model is selected, send 'hello', verify an assistant message appears."
- "Open settings, enable an MCP server, close settings."

## Phases

### 1. Resolve timestamp and report dir

```bash
TS="${TEST_REPORT_TS:-$(date -u +%Y-%m-%d-%H%M)}"   # inherit from test-new-feature if set
REPORT_DIR="docs/test-reports/$TS"
mkdir -p "$REPORT_DIR/screenshots"
```

### 2. App lifecycle

```bash
if curl -sf http://localhost:3030/ -o /dev/null; then
  APP_OWNED_BY_SKILL=0
else
  nohup pnpm dev >"$REPORT_DIR/dev.log" 2>&1 &
  DEV_PID=$!
  APP_OWNED_BY_SKILL=1
  # Poll port with 60s timeout
  for i in $(seq 1 60); do
    curl -sf http://localhost:3030/ -o /dev/null && break
    sleep 1
  done
  curl -sf http://localhost:3030/ -o /dev/null || { echo "dev never ready"; exit 1; }
fi
```
On every exit path (success, failure, interrupt), if `APP_OWNED_BY_SKILL=1`, `kill $DEV_PID` and wait.

### 3. Scenario parse

Translate each NL scenario into a structured step list. Action vocabulary (preferred selector order in parentheses):
- `goto('/')`
- `click` → `getByRole('button', { name })` → `getByRole('link')` → `getByTestId(...)`
- `fill` → `getByRole('textbox')` or `getByLabel(...)`
- `select` → `getByRole('combobox', { name })`
- `waitFor` → `waitForResponse`/`waitFor(timeout)` when awaiting stream
- `assertVisible` → `await expect(locator).toBeVisible()`
- `assertText` → shape-only for LLM output: `await expect(locator).toContainText(/\S+/)` (non-empty) or role-based assertion

Never emit CSS selectors.

### 4. DOM discovery (one-shot, before writing specs)

```bash
pnpm exec playwright codegen http://localhost:3030 --target=javascript --output=/dev/stdout --no-hosts 2>/dev/null &
CODEGEN_PID=$!
sleep 3
kill $CODEGEN_PID 2>/dev/null
```
Alternative (preferred for headless discovery): read `app/components/*.tsx` to find existing roles/labels/test-ids. The following components are known interaction surfaces:
- `ChatInput.tsx` → textarea (role=`textbox`), send button
- `ModelSelector.tsx` → combobox
- `McpSettingsDialog.tsx`, `MemoryDialog.tsx` → buttons with accessible names

### 5. Spec generation (ephemeral)

Write one spec per scenario into a throwaway dir:
```bash
EPHEMERAL="$REPORT_DIR/.specs"
mkdir -p "$EPHEMERAL"
# write $EPHEMERAL/<slug>.spec.ts using the step list from Phase 3
```

Spec shape:
```ts
import { test, expect } from '@playwright/test';

test('<scenario name>', async ({ page }) => {
  await page.goto('/');
  // step 1…
  // step 2…
  // shape-only assertion for LLM response:
  const last = page.getByRole('article').last();
  await expect(last).toContainText(/\S+/);
});
```

### 6. Execute serially

```bash
pnpm exec playwright test \
  --config=playwright.config.ts \
  --reporter=json \
  --output="$REPORT_DIR/test-artifacts" \
  "$EPHEMERAL" \
  > "$REPORT_DIR/playwright.json"
```
Copy any failure screenshots from `test-results/` into `$REPORT_DIR/screenshots/<slug>-step-<n>.png`.

### 7. Diagnose per failure

For each failing test, read:
- The failing step's `expected`.
- `$REPORT_DIR/dev.log` (filter by `[Agent]`, `[MCP]`, `[DB]`, `[Memory]`, `[RAG]`, `[DevAssistant]` prefixes).
- The component(s) responsible (grep for the role/label used in the failing step).

Emit a one-paragraph diagnosis pointing at `file:line`. Do NOT modify code.

### 8. Write report

`$REPORT_DIR/level2.md`:

```markdown
# Level 2 — test-smoke report (<TS>)

## App lifecycle
- Ownership: started | pre-existing
- Boot time: Ns
- PID: NNNNN (if started)

## Scenarios
| # | Name | Result | Duration | Screenshot | Diagnosis |
|---|------|--------|----------|------------|-----------|
| 1 | ... | PASS | 3.2s | — | — |
| 2 | ... | FAIL | 7.8s | screenshots/.../step-4.png | <one paragraph with file:line> |

## Summary
- Passed: X/Y
- Flaky candidates: 0
- LLM shape-assertion notes: …
```

### 9. Shutdown

If we started the dev server, kill it:
```bash
[ "${APP_OWNED_BY_SKILL:-0}" = "1" ] && kill "$DEV_PID" 2>/dev/null
```

## Never do

- CSS selectors.
- Assert exact LLM content.
- Edit production code from this skill.
- Leave `pnpm dev` running if this skill started it.
