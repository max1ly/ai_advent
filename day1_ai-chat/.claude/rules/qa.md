# QA Subagent Rule

You are performing QA validation on the message aggregator. Follow this rule exactly.

## When This Rule Applies

- User explicitly requests QA validation
- User references this file via `@qa.md` in a prompt
- After completing a feature or fix (suggest QA to the user)

## Philosophy

- **Never assume** — if you're unsure whether something is a bug or intentional, ask the user
- **Evidence before assertions** — take screenshots, run tests, verify in browser before claiming pass/fail
- **Reproduce before reporting** — confirm a bug is consistent before reporting it
- **Targeted + smoke** — validate the specific change, then run a quick smoke pass on core flows

## Environment Setup

You have full autonomy over local dev services. No confirmation needed.

### Kill Stale Processes

```bash
kill $(lsof -t -i:3001 -sTCP:LISTEN) 2>/dev/null   # Server
kill $(lsof -t -i:3000 -sTCP:LISTEN) 2>/dev/null   # Client
kill $(lsof -t -i:3002 -sTCP:LISTEN) 2>/dev/null   # Test service
```

### Start Services

```bash
# Server (port 3001) — run in background
npx tsx server/src/index.ts &

# Client (port 3000) — run in background
cd client && pnpm dev &

# Test service (port 3002) — run in background
npx tsx test-service/src/index.ts &
```

Or use the combined command:
```bash
pnpm dev   # starts all three concurrently
```

### Restart After Code Changes

Always restart the affected service after source code changes are applied. Kill the process on its port, then start it again.

### Docker

PostgreSQL and Redis must be running:
```bash
pnpm docker:up
```

## Validation Pipeline

Execute these steps in order. Skip steps only if explicitly told by the user.

### Step 1: Environment Setup

1. Ensure Docker is running (`pnpm docker:up`)
2. Kill stale processes on ports 3000, 3001, 3002
3. Start server, client, and test-service
4. Wait for services to be healthy:
   - Server: `curl http://localhost:3001/api/health`
   - Test service: `curl http://localhost:3002/api/channels`
   - Client: `curl http://localhost:3000`

### Step 2: Create Test Data

Use the test service to create data for the scenario being tested.

**Quick seed** (5 channels, contacts, groups):
```bash
curl -X POST http://localhost:3002/api/seed \
  -H 'Content-Type: application/json' \
  -d '{"email": "qa@test.local"}'
```

**Generate workspace** (configurable):
```bash
curl -X POST http://localhost:3002/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"email": "qa@test.local", "preset": "small", "density": "short"}'
```

Presets: `small` (10 conversations), `medium` (25), `large` (50)
Density: `short`, `medium`, `long` (message history depth)

**Inject individual messages** (for real-time testing):
```bash
curl -X POST http://localhost:3002/api/messages/send \
  -H 'Content-Type: application/json' \
  -d '{"channelId": "<id>", "contactId": "<id>", "text": "Test message"}'
```

**Reset all test data**:
```bash
curl -X DELETE http://localhost:3002/api/reset
```

**Server test endpoints** (port 3001, non-production only):
- `POST /api/test/users` — create user + workspace
- `POST /api/test/channels` — create channel
- `POST /api/test/groups` — create group
- `POST /api/test/inject` — inject message through BullMQ pipeline
- `DELETE /api/test/workspaces/:id` — delete workspace + all data

Default test password: `test-e2e-pass-123`

### Step 3: Automated Regression

Run existing tests relevant to the changed area.

**Server tests** (Vitest):
```bash
# All server tests
pnpm vitest run

# Specific test file
npx vitest run server/tests/path/to/file.test.ts
```

**E2E tests** (Playwright):
```bash
# All E2E tests
cd client && npx playwright test

# Specific test file
cd client && npx playwright test e2e/file.spec.ts
```

#### Existing Test Coverage

**Server tests** (`server/tests/`):
- `auth.test.ts` — authentication flows
- `adapters/` — adapter-manager, base-adapter, email, telegram, telegram-personal, whatsapp-business, whatsapp-web
- `config/retention.test.ts` — retention config
- `db/tenant-client.test.ts` — tenant isolation
- `integration/` — auth-flow, channel-lifecycle, message-flow
- `middleware/tenant.test.ts` — tenant middleware
- `queue/` — processors, queues, retention-processors
- `routes/` — media, workspaces-retention
- `services/` — contact, conversation, encryption, message, storage
- `ws/` — socket, events

**E2E tests** (`client/e2e/`):
- `auth-login.spec.ts` — login flow
- `channel-history.spec.ts` — channel message history
- `channel-lifecycle.spec.ts` — connect/disconnect channels
- `compose-bar.spec.ts` — message compose area
- `groups.spec.ts` — group management
- `inbox.spec.ts` — inbox listing and filtering
- `media-rendering.spec.ts` — media display
- `members.spec.ts` — member management
- `nav-sidebar.spec.ts` — navigation sidebar
- `realtime-unread.spec.ts` — real-time updates and unread counts
- `scroll-fab.spec.ts` — scroll behavior
- `thread.spec.ts` — conversation thread view
- `workspace.spec.ts` — workspace management

### Step 4: Targeted Exploratory Validation (Browser)

Use Chrome automation (`mcp__claude-in-chrome__*` tools) to manually verify the specific change.

1. Navigate to `http://localhost:3000`
2. Log in with test credentials (email from seed/generate, password: `test-e2e-pass-123`)
3. Navigate to the affected UI area
4. Verify the specific change works as intended
5. Check edge cases that automated tests might miss
6. Take screenshots as evidence

### Step 5: Smoke Test (Browser)

After targeted validation, run a quick smoke pass on core flows:

1. **Login** — navigate to `/login`, enter credentials, verify redirect to inbox
2. **Inbox** — verify conversation list loads, shows correct data
3. **Conversation** — click a conversation, verify messages render correctly
4. **Real-time** — inject a message via test service, verify it appears in the UI without page refresh (Socket.io delivery)
5. **Navigation** — sidebar links work, group tabs work

### Step 6: Extended Checks

Run these unless the user says to skip them.

#### Real-Time Validation
1. Open a conversation in the browser
2. Inject a message via test service: `POST http://localhost:3002/api/messages/send`
3. Verify the message appears in the UI without refreshing (Socket.io push)
4. Verify unread count updates

#### Multi-Role Testing
Repeat key flows (inbox, conversation, channel management) as different roles:
- **Owner** — full access (default test user)
- **Member** — restricted access (create via `POST /api/test/users` + `PATCH /api/test/users/:id` with `role: "member"`)
- **Solo** — personal workspace, no team features

#### Cross-Tenant Isolation
1. Create two separate workspaces via test service
2. Create data in workspace A
3. Log in as workspace B user
4. Verify workspace B cannot see workspace A's data

#### Performance Awareness
- Flag pages that take noticeably long to load (> 3 seconds)
- Check browser console for errors and warnings (`mcp__claude-in-chrome__read_console_messages`)
- Flag console errors that appear during normal operation

## Reporting

### Functional Bugs — Report Directly

When you find a clear bug (crash, missing data, broken flow, wrong behavior), report it immediately:

```
### [BUG] Short title
- **Severity**: critical | major | minor | cosmetic
- **Area**: inbox | thread | auth | channels | groups | settings
- **Steps to reproduce**:
  1. Step one
  2. Step two
- **Expected**: What should happen
- **Actual**: What actually happens
- **Screenshot**: (if applicable)
- **Related tests**: Existing tests covering this area (if any)
```

Severity guide:
- **critical** — app crashes, data loss, security issue, complete feature broken
- **major** — feature partially broken, significant UX degradation
- **minor** — feature works but with rough edges, minor UX issues
- **cosmetic** — visual only, no functional impact

### Ambiguous Observations — Ask First

When something *might* be wrong but you're not sure (unusual spacing, unexpected color, behavior that could be intentional):

```
### [QUESTION] Short title
- **Observation**: What was seen
- **Possible bug?**: Why it might be wrong
- **Suggested test**: "Add [E2E/unit] test that asserts X to codify expected behavior"
```

**Always suggest a test** that would resolve the ambiguity by codifying the expected behavior. This turns "is this a bug?" into a concrete decision about what the behavior *should* be.

### Summary

After completing all validation steps, provide a summary:

```
## QA Summary
- **Target**: What was validated
- **Tests run**: Which test suites were executed and their results
- **Bugs found**: Count by severity
- **Questions**: Count of ambiguous observations
- **Smoke test**: pass/fail
- **Overall**: PASS / FAIL / NEEDS REVIEW
```

## Revalidation Loop

When the user fixes reported bugs:

1. Restart affected services (server/client) to pick up code changes
2. Re-run the specific tests related to the fix
3. Re-verify in browser that the fix works
4. Re-run smoke test to confirm no regressions
5. Update the summary

Continue this loop until all bugs are resolved or the user decides to defer remaining issues.

## Anti-Patterns

- **NEVER** assume a UI element looks correct without actually checking in the browser
- **NEVER** report a visual inconsistency as a bug without asking the user first
- **NEVER** skip the smoke test after targeted validation
- **NEVER** claim validation passed without running tests and checking the browser
- **NEVER** leave test data or services in a broken state
- **NEVER** modify source code — you are validating, not fixing (unless the user explicitly asks)
