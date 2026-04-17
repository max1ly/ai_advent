---
name: test-code
description: Level 1 — find vitest coverage gaps, author tests for the top uncovered files, run them, verify three green runs, and write a report. Use when the user says "add tests", "cover X with tests", "find coverage gaps", or "write tests". Never modifies production code; flags suspected source bugs in the report only.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
---

# test-code (Level 1)

Goal: given a prompt, pick 3–5 uncovered files, write tests that pass first run, and confirm no flake.

## Preconditions

- Working directory is the project root (contains `vitest.config.ts`).
- `@vitest/coverage-v8` installed (if `pnpm vitest run --coverage --reporter=json-summary` errors about "No coverage provider found", fail fast).

## Phases (run in order)

### 1. Baseline coverage

```bash
TS=$(date -u +%Y-%m-%d-%H%M)
REPORT_DIR="docs/test-reports/$TS"
mkdir -p "$REPORT_DIR/screenshots"
pnpm vitest run --coverage --reporter=default
```
Parse `coverage/coverage-summary.json`. Candidate files = keys matching `lib/**/*.ts` OR `app/components/**/*.tsx` with `lines.pct < 80`, excluding `__tests__`, `*.d.ts`, `mcp-servers/**`. Files with no entry in summary are also candidates (treat as 0% coverage).

### 2. Prioritize

Score each candidate as `LOC × (100 − lines.pct) / 100 × business_signal`, where `business_signal = 1` if the file exports functions/classes/components, else `0.3` for pure types. Pick top 3 (hard floor), up to 5 (soft cap). Skip files the user explicitly scoped out in the prompt.

### 3. Plan per target (in conversation only)

For each target, Read the source and enumerate 3–6 cases:
- at least one happy path
- at least one error path (throws, returns null, typed error)
- at least one boundary (empty input, max size, unicode, missing config)

### 4. Author tests (mirrored path)

- `lib/<name>.ts` → `lib/__tests__/<name>.test.ts`
- `app/components/<Name>.tsx` → `app/components/__tests__/<Name>.test.tsx`

Mirror `lib/__tests__/memory.test.ts` and `lib/__tests__/task-state.test.ts`:
- `import { describe, it, expect, beforeEach } from 'vitest';`
- `import { Fn } from '@/lib/<name>';` — named imports, `@/` alias, no barrel.
- For components: `import { render, screen } from '@testing-library/react';` + `import { Foo } from '../Foo';`.
- `beforeEach` resets shared state (see existing `clearAllMemory()` / `deleteTaskState()` patterns).
- Never `any` in Zod or test fixtures. Types match CLAUDE.md rules.

### 5. Run new tests

```bash
pnpm vitest run <space-separated-new-test-paths>
```
- If green: continue to Phase 6.
- If red: re-read source, **fix the test only**, re-run. Cap at 2 retry rounds per file. After 2 rounds still red → mark file `author failed` with root-cause note and move on. Never edit production code.

### 6. Verify no flake (3 consecutive green runs)

```bash
for i in 1 2 3; do pnpm vitest run <paths> || { echo "flake on run $i"; exit 1; }; done
```

### 7. Regenerate coverage

```bash
pnpm vitest run --coverage --reporter=default
```
Read `coverage/coverage-summary.json` again to compute per-file delta (`after.lines.pct − before.lines.pct`) and overall delta.

### 8. Write report

`$REPORT_DIR/level1.md`:

```markdown
# Level 1 — test-code report (<TS>)

## Summary
- Files targeted: N
- Tests added: M
- First-run pass rate: X/N
- Overall line coverage: Y.Y% → Z.Z% (Δ +W.W)

## Per file
### lib/<name>.ts
- Before: 0% / After: 78%
- Cases: [list of `it(...)` descriptions]
- Notes: any author-failed or suspected-source-bug notes with file:line
```

### 9. Suspected source bugs (never modify source)

If a test red consistently because the source behaves incorrectly (e.g., throws on valid input the tests consider valid), append:
```
## Suspected source bugs
- lib/x.ts:42 — `foo()` returns undefined for empty array; expected `[]`. Suggest: early return `[]`.
```

## Report format discipline
- Keep report under 150 lines.
- Always use `file:line` pointers.
- Every `it(...)` description should read as a spec, not a what-I-did note.

## Known issues
- If `coverage-summary.json` is missing after Phase 1, assume empty baseline and treat all candidates as 0%.
- Components using `export default` (e.g., `ChatInput.tsx`) are valid test targets; flag the default-export violation in the report but do not fix it in this skill.
- If `pnpm vitest` hangs, cap per-test timeout: add `--testTimeout=10000`.
