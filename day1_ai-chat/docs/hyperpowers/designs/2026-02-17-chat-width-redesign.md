# Chat Width Redesign

## Problem Statement

The chat stretches to full viewport width on desktop, which looks too wide and hurts readability on large screens.

## Success Criteria

- Chat container is ~2/3 viewport width on screens >= 1024px (lg breakpoint)
- Chat is horizontally centered with background visible on both sides
- Full-width on mobile/tablet (< 1024px)
- Header, messages, and input all align within the narrower container

## Constraints / Out of Scope

- No changes to message bubble widths (keep existing max-w-[80%])
- No changes to mobile layout
- No new dependencies
- Single file change only (app/page.tsx)

## Approach

Add `lg:max-w-[66%] mx-auto` to the outermost div in `app/page.tsx`. Optionally add `lg:border-x` or `lg:shadow-lg` for visual separation on desktop.

## Open Questions

None - approach is straightforward and approved.
