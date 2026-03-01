---
paths: "server/tests/**/*.ts,client/e2e/**/*.ts"
---

# Testing Rules

## Testing Mandate

All code changes require corresponding tests. No exceptions.

- **New features with UI:** unit tests (Vitest) + E2E tests (Playwright)
- **New features without UI:** unit tests (Vitest)
- **Bug fixes:** test that reproduces the bug + verifies the fix
- **Refactors:** existing tests must still pass; add tests if coverage gaps found
- **Config/schema changes:** integration tests verifying the change works end-to-end
- **Behavior changes:** update existing tests to reflect the new intended behavior

## Anti-Patterns

- **NEVER** skip failing tests or mark them as `.skip` without explicit user approval
- **NEVER** commit code with failing tests
- **NEVER** write tautological tests (tests that pass without actually testing behavior)
- **NEVER** remove tests without explicit user approval

## Vitest Server Tests

### Test Structure
```typescript
describe('createMyProcessor', () => {
  let process: (job: Job) => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    process = createMyProcessor(mockDeps as any);
  });

  it('should [expected behavior] when [condition]', async () => {
    // Arrange
    mockPrisma.model.findUnique.mockResolvedValue(record);
    // Act
    await process(makeJob({ id: 'test-1' }));
    // Assert
    expect(mockPrisma.model.update).toHaveBeenCalledWith({
      where: { id: 'test-1' },
      data: { status: 'processed' },
    });
  });
});
```

### Job Factory
```typescript
function makeJob<T>(data: T): Job<T> {
  return { data, id: 'job-1', name: 'test', attemptsMade: 0 } as unknown as Job<T>;
}
```

### Mock Conventions

- Mock adapters, KMS, external APIs — never hit real services
- Use `vi.fn()` for all mock methods
- Reset with `vi.clearAllMocks()` in `beforeEach`
- Nest mocks in object shape matching the real dependency

### File Organization

Mirror `src/` directory structure:
- `server/src/queue/processors.ts` → `server/tests/queue/processors.test.ts`
- `server/src/routes/channels.ts` → `server/tests/routes/channels.test.ts`

## Playwright E2E Tests

```typescript
test.describe('Feature Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/feature');
  });

  test('shows expected content', async ({ page }) => {
    await expect(page.getByText('Expected text')).toBeVisible();
  });
});
```

- Use `test.describe` for grouping, `test.beforeEach` for setup
- Prefer `getByRole` and `getByText` selectors over CSS selectors
- Use `expect(...).toBeVisible()` for assertions

## Test Naming

Always use: `it('should [expected behavior] when [condition]')`

## RLS Testing

- Test with non-superuser credentials — superuser bypasses RLS
- Verify cross-tenant isolation: tenant A must NOT see tenant B's data
