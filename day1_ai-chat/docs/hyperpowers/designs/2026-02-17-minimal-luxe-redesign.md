# Minimal Luxe Redesign

## Problem Statement

The chat app's visual design is functional but generic — flat colors, no depth, system fonts, and zero personality. It looks like a default template rather than a polished product.

## Success Criteria

- Chat feels visually elevated and polished compared to current state
- User and AI messages are clearly distinct with improved contrast
- Typography uses a modern, clean font (Inter)
- Input area feels inviting with satisfying micro-interactions
- No new npm dependencies (Inter via next/font/google)
- Maintains full responsiveness (mobile still works)

## Constraints / Out of Scope

- No dark mode (future consideration)
- No new component libraries or UI frameworks
- Keep existing layout structure (centered 66% width on desktop)
- No changes to message content rendering logic
- No JavaScript behavior changes — styling only

## Approach

### 1. Typography
- Add **Inter** font via `next/font/google` in `layout.tsx`
- Apply to body element as the default font
- Header title: `font-medium tracking-tight` (refined from `font-semibold`)
- AI message prose: upgrade from `prose-sm` to `prose` for better readability

### 2. Message Bubbles
- **User messages:** `bg-gradient-to-br from-blue-600 to-indigo-600` (gradient replaces flat blue), add `shadow-md`, padding `px-5 py-3`
- **AI messages:** `bg-white shadow-sm border border-gray-100` (white card elevated from gray background), padding `px-5 py-3`
- Both keep existing asymmetric rounded corners

### 3. Input Area
- Textarea: `rounded-full` pill shape, `border-gray-200 shadow-sm`, focus ring `focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400`
- Send button: `rounded-full`, gradient `bg-gradient-to-r from-blue-600 to-indigo-600`, hover/active animation `hover:scale-105 active:scale-95 transition-all`. Keep "Send" text.

### 4. Header
- Replace `border-b` with `shadow-sm` for softer separation
- Keep white background

### 5. Thinking State
- Replace `animate-pulse` text with 3 animated bouncing dots inside a white card matching AI message style

## Files to Modify

1. `app/layout.tsx` — add Inter font import
2. `app/page.tsx` — header shadow change
3. `app/components/ChatMessage.tsx` — bubble gradient, shadows, padding, prose size
4. `app/components/ChatInput.tsx` — pill shape, gradient button, hover animation
5. `app/components/ChatContainer.tsx` — thinking indicator dots
6. `app/globals.css` — keyframes for staggered bounce animation (if needed)

## Open Questions

None — all assumptions validated against the codebase. Ready to implement.
