# Minimal Luxe Redesign Implementation Plan

> **For Claude:** Run `/execute-plan` to implement this plan (will ask which execution style you prefer).
> **Related Issues:** None

**Goal:** Elevate the chat app's visual design from generic template to polished product — gradient bubbles, Inter font, elevated cards, micro-interactions, bouncing dots thinking indicator.

**Architecture:** CSS/styling-only changes across 7 files. No JavaScript logic changes. Inter font loaded via `next/font/google` (zero new dependencies). Custom bounce animation via Tailwind config keyframes + CSS animation-delay utilities.

**Tech Stack:** Next.js 15, Tailwind CSS 3.4, `@tailwindcss/typography`, `next/font/google`, `react-textarea-autosize`

**Context Gathered From:**
- `docs/hyperpowers/research/2026-02-17-minimal-luxe-redesign.md`
- `docs/hyperpowers/designs/2026-02-17-minimal-luxe-redesign.md`

**Key Research Findings:**
- `prose` class adds `max-width: 65ch` — must add `max-w-none` before `max-w-[80%]` on AI bubbles
- `tailwind.config.ts` is an additional file to modify (not in original design)
- Keyframes belong in Tailwind config (tree-shakeable) while animation-delay utilities go in `globals.css`
- Inter is a variable font — no weight specification needed

---

### Task 1: Add Inter font to layout

**Files:**
- Modify: `app/layout.tsx`

**Step 1: Add Inter font import and apply to html**

Replace the entire file content with:

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
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.className}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

Changes from current:
- Added `import { Inter } from "next/font/google"`
- Added `const inter = Inter({ subsets: ["latin"], display: "swap" })`
- Added `className={inter.className}` to `<html>`
- Added `className="antialiased"` to `<body>` for smoother font rendering

**Step 2: Commit**

```bash
git add app/layout.tsx
git commit -m "style: add Inter font via next/font/google"
```

---

### Task 2: Add bounce-dots keyframes to Tailwind config

**Files:**
- Modify: `tailwind.config.ts`

**Step 1: Add keyframes and animation to theme.extend**

Replace `theme: { extend: {} }` with:

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

Details:
- GPU-accelerated (`transform` + `opacity` only)
- 0.8s duration with cubic-bezier easing
- `infinite` loop

**Step 2: Commit**

```bash
git add tailwind.config.ts
git commit -m "style: add bounce-dots keyframes to Tailwind config"
```

---

### Task 3: Add animation-delay utilities to globals.css

**Files:**
- Modify: `app/globals.css`

**Step 1: Add animation-delay utility classes**

Append after the existing `@tailwind` directives:

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

These create staggered timing for the 3 bouncing dots (0s, 0.2s, 0.4s).

**Step 2: Commit**

```bash
git add app/globals.css
git commit -m "style: add animation-delay utilities for bouncing dots"
```

---

### Task 4: Update header to use shadow instead of border

**Files:**
- Modify: `app/page.tsx`

**Step 1: Replace header border-b with shadow-sm and refine typography**

In `app/page.tsx`, change line 28:

```tsx
// FROM:
<header className="border-b bg-white px-4 py-3">
  <h1 className="text-xl font-semibold text-gray-800">Day1 AI Chat</h1>
</header>

// TO:
<header className="shadow-sm bg-white px-4 py-3">
  <h1 className="text-xl font-medium tracking-tight text-gray-800">Day1 AI Chat</h1>
</header>
```

Changes:
- `border-b` -> `shadow-sm` (softer visual separation)
- `font-semibold` -> `font-medium tracking-tight` (refined typography)

**Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "style: header shadow and refined typography"
```

---

### Task 5: Restyle message bubbles

**Files:**
- Modify: `app/components/ChatMessage.tsx`

**Step 1: Update user bubble classes**

In `app/components/ChatMessage.tsx`, change the user bubble div (line 26):

```tsx
// FROM:
<div className="max-w-[80%] rounded-2xl rounded-br-md bg-blue-600 px-4 py-2 text-white">

// TO:
<div className="max-w-[80%] rounded-2xl rounded-br-md bg-gradient-to-br from-blue-600 to-indigo-600 px-5 py-3 text-white shadow-md">
```

Changes:
- `bg-blue-600` -> `bg-gradient-to-br from-blue-600 to-indigo-600`
- `px-4 py-2` -> `px-5 py-3` (more breathing room)
- Added `shadow-md`

**Step 2: Update AI bubble classes**

Change the AI bubble div (line 58):

```tsx
// FROM:
<div className="prose prose-sm max-w-[80%] rounded-2xl rounded-bl-md bg-gray-50 px-4 py-2">

// TO:
<div className="prose max-w-none max-w-[80%] rounded-2xl rounded-bl-md bg-white shadow-sm border border-gray-100 px-5 py-3">
```

Changes:
- `prose-sm` -> `prose` (larger, more readable text)
- Added `max-w-none` before `max-w-[80%]` (CRITICAL: resets prose's `max-width: 65ch`)
- `bg-gray-50` -> `bg-white shadow-sm border border-gray-100` (elevated white card)
- `px-4 py-2` -> `px-5 py-3`

**Step 3: Commit**

```bash
git add app/components/ChatMessage.tsx
git commit -m "style: gradient user bubbles and elevated AI cards"
```

---

### Task 6: Restyle input area

**Files:**
- Modify: `app/components/ChatInput.tsx`

**Step 1: Update form container**

Change the form element (line 29):

```tsx
// FROM:
<form onSubmit={handleSubmit} className="border-t bg-white px-4 py-3">

// TO:
<form onSubmit={handleSubmit} className="bg-white px-4 py-3">
```

Change: Remove `border-t` (shadow from header is enough visual separation; input area sits at bottom naturally).

**Step 2: Update textarea classes**

Change the TextareaAutosize className (line 38):

```tsx
// FROM:
className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"

// TO:
className="flex-1 resize-none rounded-full border border-gray-200 px-4 py-2 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
```

Changes:
- `rounded-xl` -> `rounded-full` (pill shape)
- `border-gray-300` -> `border-gray-200` (lighter)
- Added `shadow-sm`
- Focus: `ring-1 ring-blue-500` -> `ring-2 ring-blue-500/20` (softer glow)
- Focus: `border-blue-500` -> `border-blue-400`

**Step 3: Update button classes**

Change the button className (line 43):

```tsx
// FROM:
className="rounded-xl bg-blue-600 px-4 py-2 text-white transition-opacity hover:bg-blue-700 disabled:opacity-50"

// TO:
className="rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
```

Changes:
- `rounded-xl` -> `rounded-full`
- `bg-blue-600` -> `bg-gradient-to-r from-blue-600 to-indigo-600`
- `transition-opacity hover:bg-blue-700` -> `transition-all hover:scale-105 active:scale-95`

**Step 4: Commit**

```bash
git add app/components/ChatInput.tsx
git commit -m "style: pill input, gradient button, micro-interactions"
```

---

### Task 7: Replace thinking indicator with bouncing dots

**Files:**
- Modify: `app/components/ChatContainer.tsx`

**Step 1: Replace the thinking indicator markup**

In `app/components/ChatContainer.tsx`, replace the thinking indicator block (lines 48-56):

```tsx
// FROM:
{status === 'submitted' && (
  <div className="flex justify-start">
    <div className="rounded-2xl rounded-bl-md bg-gray-50 px-4 py-2">
      <span className="inline-flex items-center gap-1 text-gray-500">
        <span className="animate-pulse">AI is thinking...</span>
      </span>
    </div>
  </div>
)}

// TO:
{status === 'submitted' && (
  <div className="flex justify-start">
    <div className="rounded-2xl rounded-bl-md bg-white shadow-sm border border-gray-100 px-5 py-3">
      <div className="flex items-center gap-1">
        <span className="animate-bounce-dots h-2 w-2 rounded-full bg-gray-400" />
        <span className="animate-bounce-dots animation-delay-200 h-2 w-2 rounded-full bg-gray-400" />
        <span className="animate-bounce-dots animation-delay-400 h-2 w-2 rounded-full bg-gray-400" />
      </div>
    </div>
  </div>
)}
```

Changes:
- Container matches AI message style: `bg-white shadow-sm border border-gray-100 px-5 py-3`
- Replaced text with 3 animated dots: `h-2 w-2 rounded-full bg-gray-400`
- Staggered with `animation-delay-200` and `animation-delay-400`
- Uses `animate-bounce-dots` from Task 2's Tailwind config

**Step 2: Commit**

```bash
git add app/components/ChatContainer.tsx
git commit -m "style: bouncing dots thinking indicator"
```

---

### Task 8: Visual verification

**Step 1: Start dev server and verify in browser**

```bash
pnpm dev
```

Open `http://localhost:3030` and verify:

1. Inter font is loaded (check Network tab — font should be self-hosted, no Google Fonts requests)
2. Header has subtle shadow instead of hard border line
3. User messages show blue-to-indigo gradient with shadow
4. AI messages show white card with subtle border and shadow on gray background
5. AI message text is larger (16px base, not 14px) and width extends to 80% on wide screens
6. Input textarea is pill-shaped with soft focus glow
7. Send button has gradient and scales on hover/click
8. Thinking indicator shows 3 bouncing dots with staggered timing
9. Mobile layout still works (resize browser to narrow width)

**Step 2: Final commit if any tweaks needed**

If everything looks good, no additional commit needed.

---

## Validated Assumptions

All 9 technical assumptions validated against current documentation.

- `next/font/google` Inter with `{ subsets: ["latin"], display: "swap" }` — confirmed for Next.js 15
- `inter.className` on `<html>` tag — documented pattern
- `prose` adds `max-width: 65ch`, `max-w-none` resets it — confirmed in typography plugin docs
- `rounded-full` on `react-textarea-autosize` `<textarea>` — standard CSS, works
- `hover:scale-105 active:scale-95 transition-all` — transforms don't cause layout shift
- Custom keyframes in `theme.extend.keyframes` — tree-shakeable in Tailwind 3.4
- `@layer utilities` for animation-delay — supported in Tailwind 3.4
- `bg-gradient-to-br from-blue-600 to-indigo-600` — valid Tailwind 3.4 gradient syntax
- `focus:ring-blue-500/20` opacity modifier — supported in Tailwind 3.4
