# Research: Minimal Luxe Redesign

**Design:** `docs/hyperpowers/designs/2026-02-17-minimal-luxe-redesign.md`
**Date:** 2026-02-17

## Summary

All 6 file changes in the design are technically feasible. One critical adjustment needed: the `prose` class adds `max-width: 65ch` which conflicts with `max-w-[80%]` on AI message bubbles — must add `max-w-none` to override.

## 1. Inter Font via next/font/google

**Status:** Straightforward, no issues.

- Import: `import { Inter } from "next/font/google"`
- Configure: `const inter = Inter({ subsets: ["latin"], display: "swap" })`
- Apply to `<html>` tag: `className={inter.className}`
- Inter is a variable font — no weight specification needed
- Next.js 15 auto-hosts the font at build time (no runtime Google Fonts requests)
- Optional: add `antialiased` class for smoother rendering

**Exact code for layout.tsx:**
```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Day1 AI Chat",
  description: "Chat with AI powered by DeepSeek",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.className}>
      <body>{children}</body>
    </html>
  );
}
```

## 2. Message Bubble Styling

**Status:** Feasible with one adjustment needed.

### User Bubbles
- Gradient `bg-gradient-to-br from-blue-600 to-indigo-600` + `shadow-md` + `px-5 py-3` — standard Tailwind, no issues.

### AI Bubbles — Critical Finding
- **Problem:** Upgrading from `prose-sm` to `prose` adds `max-width: 65ch` to the element. Combined with `max-w-[80%]`, the *smaller* value wins in CSS cascade, so on wide screens `65ch` (~585px) constrains the bubble narrower than intended.
- **Fix:** Add `max-w-none` before `max-w-[80%]` to explicitly disable prose's default max-width, letting `max-w-[80%]` control width.
- `bg-white shadow-sm border border-gray-100` — no conflict with prose code blocks (prose targets `<pre>` descendants with `--tw-prose-pre-bg` CSS variable, unaffected by container bg).
- Font size increases from 14px (prose-sm) to 16px (prose) — headings, margins, and code block padding all scale proportionally.

**Adjusted class for AI bubbles:**
```
prose max-w-none max-w-[80%] rounded-2xl rounded-bl-md bg-white shadow-sm border border-gray-100 px-5 py-3
```

Note: `max-w-none` resets prose's 65ch, then `max-w-[80%]` applies the chat bubble constraint.

## 3. Input Area Styling

**Status:** Straightforward, no issues.

- `rounded-full` on textarea — works with `react-textarea-autosize` (applies to the rendered `<textarea>`)
- Gradient button with `hover:scale-105 active:scale-95 transition-all` — standard micro-interaction pattern
- Focus ring `focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400` — clean and accessible

## 4. Header Shadow

**Status:** Straightforward, no issues.

- Replace `border-b` with `shadow-sm` — single class swap

## 5. Bouncing Dots Animation

**Status:** Feasible. Requires changes to `tailwind.config.ts` and `globals.css`.

### Approach: Custom keyframes in config + animation-delay utilities

**tailwind.config.ts additions:**
```ts
theme: {
  extend: {
    keyframes: {
      "bounce-dots": {
        "0%, 100%": { transform: "translateY(0)", opacity: "1" },
        "50%": { transform: "translateY(-12px)", opacity: "0.7" },
      },
    },
    animation: {
      "bounce-dots": "bounce-dots 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
    },
  },
},
```

**globals.css additions:**
```css
@layer utilities {
  .animation-delay-200 {
    animation-delay: 0.2s;
  }
  .animation-delay-400 {
    animation-delay: 0.4s;
  }
}
```

**Component markup:**
```tsx
<div className="flex justify-start">
  <div className="rounded-2xl rounded-bl-md bg-white shadow-sm border border-gray-100 px-5 py-3">
    <div className="flex items-center gap-1">
      <span className="animate-bounce-dots h-2 w-2 rounded-full bg-gray-400" />
      <span className="animate-bounce-dots animation-delay-200 h-2 w-2 rounded-full bg-gray-400" />
      <span className="animate-bounce-dots animation-delay-400 h-2 w-2 rounded-full bg-gray-400" />
    </div>
  </div>
</div>
```

**Key details:**
- GPU-accelerated (uses `transform` and `opacity` only)
- 0.8s duration with cubic-bezier easing for natural feel
- Stagger: 0s, 0.2s, 0.4s delays
- Keyframes in config tree-shake properly (vs globals.css)

## Design Adjustments Required

| # | Original Design | Adjustment | Reason |
|---|----------------|------------|--------|
| 1 | AI bubble: `prose max-w-[80%]` | Add `max-w-none` before `max-w-[80%]` | Prose adds `max-width: 65ch` that conflicts |

## Files to Modify (confirmed)

1. **`app/layout.tsx`** — Add Inter font import + apply to `<html>`
2. **`app/page.tsx`** — Header: `border-b` → `shadow-sm`
3. **`app/components/ChatMessage.tsx`** — User gradient + shadow, AI white card + prose fix
4. **`app/components/ChatInput.tsx`** — Pill shape, gradient button, hover animation
5. **`app/components/ChatContainer.tsx`** — Bouncing dots thinking indicator
6. **`app/globals.css`** — Animation-delay utilities
7. **`tailwind.config.ts`** — Bounce-dots keyframes + animation (NEW — not in original design)

## Risk Assessment

- **Low risk:** All changes are CSS/styling only, no logic changes
- **Medium attention:** Prose upgrade changes message sizing — visual QA needed
- **No new npm dependencies** confirmed
