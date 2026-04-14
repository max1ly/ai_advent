---
name: verify-build
description: Verify a change compiles, type-checks, and tests pass in day1_ai-chat. Runs tsc, vitest, and next build. Reports compact PASS/FAIL with file:line pointers. Use after any code change before declaring work complete.
allowed-tools: Bash
---

# verify-build

Run the three gates and report PASS/FAIL for each.

## Commands (run in order; do NOT stop on first failure)

```bash
# 1. TypeScript strict check (replaces broken pnpm lint)
pnpm exec tsc --noEmit --skipLibCheck

# 2. Tests
pnpm vitest run --reporter=default

# 3. Production build
pnpm build
```

## Known issues — treat as WARN not FAIL

- `pnpm lint` circular-ref bug (ESLint 9 + eslint-config-next 16) — do NOT run `pnpm lint`.
- Vitest globals (`describe`/`it`/`expect`) not in `tsconfig.json` `types`. If `tsc` reports these errors in `__tests__/*` files, report as WARN, not FAIL. Real FAIL = TS errors in `app/` or `lib/` non-test files.

## Report format

```
verify-build results
--------------------
tsc:   PASS | FAIL (N errors)
  [file:line] error message   ← only if FAIL
vitest: PASS | FAIL (X/Y passed)
  [file:line] description     ← only if FAIL
build:  PASS | FAIL
  [file:line] error           ← only if FAIL
--------------------
Overall: PASS | FAIL
```

Keep output under 40 lines. Deduplicate repeated errors. Always include `file:line` pointers.
