---
name: test-new-feature
description: Orchestrator — given "new feature just created" (or similar), detect changed files via git diff, run Level 1 (test-code) and Level 2 (test-smoke) under a shared timestamp, merge the reports, cross-diagnose failures, and promote passing ephemeral specs to e2e/smoke/. Use when the user says "new feature just created", "I added a feature", or "cover this feature".
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, Skill
---

# test-new-feature

Goal: end-to-end "feature just shipped, now test it" flow.

## Phases

### 1. Detect scope

```bash
BASE="${BASE_BRANCH:-master}"
git fetch origin "$BASE" --depth=1 2>/dev/null || true
CHANGED=$(git diff --name-only "$BASE"...HEAD)
echo "$CHANGED"
```
Partition changed paths:
- **Level 1 targets:** `lib/**/*.ts` + `app/components/**/*.tsx` that are NOT `__tests__`.
- **Level 2 candidates:** any `app/components/*.tsx` or `app/**/page.tsx` or `app/api/**/route.ts` that affects user-visible behavior.
- **Ignore:** `docs/`, `*.md`, `.claude/`, `.github/`, config files.

### 2. Share timestamp

```bash
export TEST_REPORT_TS="$(date -u +%Y-%m-%d-%H%M)"
REPORT_DIR="docs/test-reports/$TEST_REPORT_TS"
mkdir -p "$REPORT_DIR/screenshots"
```
Both sub-skills must read `TEST_REPORT_TS` from env so their outputs land in the same folder.

### 3. Elicit scenarios

- If the user provided scenarios in the prompt: use them.
- Else: propose 3 scenarios derived from (a) changed UI components' accessible names and (b) the most recent commit messages, then ask the user to confirm before running.

### 4. Run Level 1

Invoke the `test-code` skill with the Level-1 target files as scope.
Expected artifact: `$REPORT_DIR/level1.md`.

### 5. Run Level 2

Invoke the `test-smoke` skill with the confirmed scenarios.
Expected artifacts: `$REPORT_DIR/level2.md`, `$REPORT_DIR/screenshots/…`.

### 6. Merge + cross-diagnose

Write `$REPORT_DIR/unified.md`:

```markdown
# Unified report (<TS>)

## Level 1 summary
- <from level1.md's Summary section>

## Level 2 summary
- <from level2.md's Summary section>

## Cross-level diagnosis
- For each Level-2 failure, check if its touched component/lib file is in the Level-1 target set.
- If yes AND Level 1 had red on the same file → flag as top suspect with file:line pointer.
- Else → standalone note.

## Promoted specs
- <slug>.spec.ts → e2e/smoke/<slug>.spec.ts (if promoted)
```

### 7. Promote passing ephemeral specs

For each Level-2 scenario that passed all three stability runs:
```bash
SRC="$REPORT_DIR/.specs/<slug>.spec.ts"
DST="e2e/smoke/<slug>.spec.ts"
if [ -e "$DST" ]; then
  # Ask the user before overwriting
  echo "Overwrite existing $DST?"  # prompt the user, skip if no
else
  cp "$SRC" "$DST"
  git add "$DST"
fi
```

## Never do

- Run Level 2 if Level 1 detected a red that points at a file the scenario would exercise (short-circuit and report).
- Promote specs that failed, were skipped, or were quarantined.
- Commit changes inside this skill — leave the staging state for the user to review and commit.
