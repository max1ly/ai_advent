# Component Rules (v1 additions)

Strict, enforceable rules for every new React component in `app/components/`. These are MUST rules — not guidelines.

Do not rewrite this file. Additions only.

---

## R1: One component per file

**MUST:** Each new component lives in its own file at `app/components/<PascalCase>.tsx`. NEVER declare a second component as an inline (unexported) function inside another component's file, even for small helpers (buttons, icons, badges, dialogs).

```tsx
// ❌ BAD — helper defined inline in another component's file
// app/components/SomeParent.tsx
function SmallHelper({ value }: { value: string }) { /* ... */ }

// ✅ GOOD — new dedicated file
// app/components/SmallHelper.tsx
export function SmallHelper({ value }: SmallHelperProps) { /* ... */ }
```

Then import it: `import { SmallHelper } from '@/app/components/SmallHelper';`

---

## R2: Props type MUST be an exported interface

**MUST:** Every component declares props via an exported `<Name>Props` interface. Inline object types are forbidden, even for single-prop components.

```tsx
// ❌ BAD — inline object type
function Foo({ value }: { value: string }) { }

// ❌ BAD — type alias not exported
type FooProps = { value: string };
function Foo({ value }: FooProps) { }

// ✅ GOOD
export interface FooProps {
  value: string;
}
export function Foo({ value }: FooProps) { }
```

---

## R3: Every component MUST be a named export

**MUST:** Component declarations use `export function <Name>` or `export const <Name>`. A component with no `export` keyword is a bug. `export default` is forbidden (see CLAUDE.md anti-patterns).

```tsx
// ❌ BAD — private to module
function Foo() { }

// ❌ BAD — default export
export default function Foo() { }

// ✅ GOOD
export function Foo() { }
```

---

## R4: New component → new test file

**MUST:** Creating `app/components/<Name>.tsx` requires creating `app/components/__tests__/<Name>.test.tsx` with at least one rendering test. Run `pnpm vitest run` before declaring the task complete.

**Minimal acceptable test:**

```tsx
import { render, screen } from '@testing-library/react';
import { Foo } from '../Foo';

describe('Foo', () => {
  it('renders', () => {
    render(<Foo value="x" />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
```

---

## R5: Load the detail rules files

**MUST:** Before writing or editing any component, `Read` these files in full:

- `.claude/rules/templates.md` — the "Client component" template is authoritative
- `.claude/rules/anti-patterns.md` — every listed bad pattern is forbidden
- `.claude/rules/patterns.md` — mirror the structure of existing good examples

The `@.claude/rules/*.md` syntax in CLAUDE.md is **not auto-loaded** — you MUST open these files explicitly with the Read tool.

---

## Pre-implementation checklist

Before editing or creating any file for a UI request, in order:

1. `Read .claude/rules/templates.md` — match the template for the file type.
2. `Read .claude/rules/anti-patterns.md` — confirm you are not about to produce any listed bad pattern.
3. `Grep` the codebase for existing callbacks/handlers that cover the request (e.g., `handleNewChat`, `handleClear`, `reset`) before writing new reset/clear/toggle logic.
4. Confirm any new file path follows naming: `app/components/<PascalCase>.tsx` for components, `lib/<camelCase>.ts` for lib modules, `app/components/__tests__/<Name>.test.tsx` for tests.
5. Confirm every new component has: `'use client'` on line 1, exported `<Name>Props` interface, named export, paired test file.
