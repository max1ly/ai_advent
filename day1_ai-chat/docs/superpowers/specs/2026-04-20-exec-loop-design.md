# Execution Loop Challenge — Design Spec

## Goal

Benchmark autonomous AI assistant execution: how many tasks can be completed in a row without human intervention. Produce metrics for comparison across runs and models.

## Decisions

| Decision | Choice |
|----------|--------|
| Task storage | Local `tasks.md` at project root |
| Loop orchestration | Custom `/exec-loop` skill (`.claude/skills/exec-loop.md`) |
| On failure | Never auto-stop — revert changes, record failure, continue |
| Branch strategy | Single branch (`exec-loop/run-N`), `git checkout .` on fail |
| Verification gate | `tsc --noEmit --skipLibCheck` + `vitest run` + `pnpm build` |
| Metrics | `tasks.md` (status checkboxes) + `metrics.md` (detailed report) |
| Task count | 18 tasks |
| Task mix | 3 docs, 5 bugs, 4 tests, 3 features, 3 refactors |
| Subagent mode | `bypassPermissions`, fresh context per task, no git access |

## Architecture

### File Layout

```
project root/
├── tasks.md                        # Task pool (18 tasks with checkboxes)
├── metrics.md                      # Generated during run
├── .claude/skills/exec-loop.md     # The custom skill
```

### Branch Strategy

- Create `exec-loop/run-1` from current branch before starting
- All commits and reverts happen on that branch
- Run 2 after rule refinement: `exec-loop/run-2` from same starting point
- `git log --oneline exec-loop/run-N` shows full history

## Skill: `/exec-loop`

### Lifecycle Per Task

1. Parse `tasks.md`, find the first unchecked task (`- [ ]`)
2. Record start timestamp
3. Dispatch a subagent (`mode: bypassPermissions`) with task prompt
4. When subagent returns, run verification gate:
   - `pnpm exec tsc --noEmit --skipLibCheck`
   - `pnpm vitest run`
   - `pnpm build`
5. Record end timestamp, compute duration
6. **If all pass:** commit changes with `exec-loop: [task-id] [title]`, mark `[x] PASS` in `tasks.md`
7. **If any fail:** capture error output, `git checkout .` to revert, mark `[x] FAIL` in `tasks.md`
8. Append metrics row to `metrics.md`
9. Repeat until all tasks done
10. Write summary stats to `metrics.md`

### Subagent Prompt Template

```
You are completing a task in the day1_ai-chat project.

Task: {title}
Description: {description}
Done criteria: {done_criteria}
Type: {type}

Rules:
- Follow all CLAUDE.md rules strictly
- Do NOT run git commands — do not commit, branch, or stage
- Do NOT run the build or tests — the orchestrator handles verification
- Focus only on this task — do not fix unrelated issues
- If the task is unclear, make your best judgment and proceed
```

## Task Pool (18 Tasks)

### Documentation (3)

**T01** (docs/S): Add JSDoc to `lib/rag/tool.ts`
- Module-level doc explaining RAG tool factory, threshold behavior, and usage
- Done: JSDoc present on `createRagTool` export

**T02** (docs/S): Add JSDoc to `lib/memory.ts`
- Document `extractMemory`, `MemoryManager`, and memory extraction flow
- Done: JSDoc present on all exported functions

**T03** (docs/S): Add JSDoc to `lib/task-state.ts`
- Document task state machine and all exported functions
- Done: JSDoc present on all exports

### Bug Fixes (5)

**T04** (bug/S): Fix silent catch swallowing invariants in `app/page.tsx:122`
- Empty `catch {}` discards parse errors for saved invariants
- Done: catch logs warning and resets to `[]`

**T05** (bug/S): Fix `res.body!` non-null assertion in `app/page.tsx:277`
- Add null check before `.getReader()`
- Done: throws descriptive error if `res.body` is null

**T06** (bug/M): Fix stale `ragSourceFilter` in useCallback deps — `app/page.tsx:501`
- `ragSourceFilter` used in `sendAndStream` but missing from dependency array
- Done: dependency added, no test regressions

**T07** (bug/M): Add `ragThreshold` validation in `app/api/chat/route.ts`
- Reject NaN, negative, or >1 values
- Done: invalid values return 400 with descriptive error

**T08** (bug/M): Surface tool execution errors to UI in `app/page.tsx:605`
- `handleToolAllow` catch block only logs to console, user never sees the error
- Done: error state set and visible to user

### Tests (4)

**T09** (test/S): Write tests for `lib/sessions.ts`
- Cover `getOrCreateAgent`, session reuse, edge cases
- Done: test file exists at `lib/__tests__/sessions.test.ts`, vitest passes

**T10** (test/M): Write tests for `lib/rag/tool.ts`
- Cover `createRagTool` with mocked search, error handling
- Done: test file exists at `lib/__tests__/rag/tool.test.ts`, vitest passes

**T11** (test/M): Write tests for `lib/memory.ts`
- Cover `extractMemory`, error paths
- Done: test file exists at `lib/__tests__/memory.test.ts`, vitest passes

**T12** (test/M): Write rendering test for `ChatMessage` component
- Done: `app/components/__tests__/ChatMessage.test.tsx` exists and passes

### Small Features (3)

**T13** (feature/M): Add file upload size limit (50MB) in `app/page.tsx`
- Reject oversized files with user-visible error message
- Done: files over 50MB show error, not uploaded

**T14** (feature/M): Graceful RAG fallback on indexing timeout — `lib/agent.ts:252-258`
- If indexing times out, disable RAG for that session and continue chat
- Done: chat works when Ollama is down

**T15** (feature/L): Clean up ObjectURL memory leak in `app/page.tsx:249-262`
- Revoke URLs on component unmount via useEffect cleanup
- Done: cleanup function present in useEffect

### Refactoring (3)

**T16** (refactor/M): Extract metrics/timing logic from `lib/agent.ts` into `lib/agent-metrics.ts`
- Done: new file with named exports, `agent.ts` imports from it, build passes

**T17** (refactor/L): Add session TTL to `lib/sessions.ts`
- Expire sessions after 24h with periodic cleanup
- Done: stale sessions removed, existing tests still pass

**T18** (refactor/L): Extract RAG setup logic from `lib/agent.ts` into `lib/agent-rag.ts`
- Done: new file, `agent.ts` imports from it, build passes

## Metrics Report (`metrics.md`)

### Structure

```markdown
# Execution Loop Metrics — Run N

## Config
- Branch: exec-loop/run-N
- Started: <ISO timestamp>
- Verification: tsc + vitest + build

## Per-Task Results

| # | Task ID | Type | Difficulty | Status | Duration | Failure Reason |
|---|---------|------|------------|--------|----------|----------------|
| 1 | T01     | docs | S          | PASS   | 42s      | —              |

## Summary
- Total tasks: 18
- Passed: X / 18 (XX%)
- Failed: X / 18
- Longest streak without failure: X
- Average time per task: Xs
- First failure at: task #X

## Failure Analysis
### Task TXX — [title]
- Gate failed: [tsc / vitest / build]
- Error: [captured output]
- Root cause category: [generated non-working code / misunderstood context / ...]
```

## Enhancement: Run Comparison

After Run 1 failures, refine `.claude/rules/` or profiles based on failure analysis. Run 2 uses `exec-loop/run-2` from the same starting point. Compare:

- Longest streak: Run 1 vs Run 2
- Pass rate: Run 1 vs Run 2
- Average time: Run 1 vs Run 2
- Which failure categories were eliminated
