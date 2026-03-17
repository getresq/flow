# Codex Plan: UI Foundation Setup

## Objective

Set up the foundation for the resq-flow UI modernization on top of current `main`. This work is mostly plumbing. The only intentional visual shift in this plan is adopting the documented design tokens and Inter font in `ui/src/index.css`; there should be no component-level redesign here. Every task is mechanical and precisely specified. The goal is to give Claude a fully wired shadcn/ui + Motion + TanStack foundation that already matches `ui/DESIGN-SYSTEM.md`, while preserving the run/journey/history UX that already exists in the app.

## Context

- Working directory: `ui/` (the Vite + React app)
- Package manager: `bun` (`bun.lock` exists). Use `bun add`, `bun run`, and `bunx`; do not introduce `package-lock.json`
- React 19.2.0, Vite 8, Tailwind CSS v4.2.1, TypeScript 5.9.3
- No shadcn/Radix foundation is installed yet; most controls are still hand-rolled
- No path aliases configured yet
- Test framework: Vitest 4.1.0 using `jsdom`, with `@happy-dom/global-registrator` loaded from `src/test/setup.ts`
- `ui/DESIGN-SYSTEM.md` is the source of truth for tokens, typography, spacing, component rules, and anti-patterns

## Current Main Baseline

Current `main` already includes several product-level UI behaviors that must remain intact during this foundation pass:

- `BottomLogPanel` already has `Logs` / `Runs` tabs, search, filters, pinning, selection, and manual resize/collapse behavior
- `TraceDetailPanel` already exists and renders run/journey detail with `Overview` and `Advanced telemetry` tabs
- `App.tsx` already wires history playback, trace focus on the canvas, and selected run/node state
- Journey derivation, exact-id handling, and replay behavior are already covered by the current test suite

## Pre-Requisites

None. This plan is standalone and should be executed from the `ui/` directory.

Implementation constraint: preserve current behavior while adding the missing foundation. Prefer alias/dependency/utilities/token work first. If a task requires touching an already-landed UI surface, make the smallest change that unblocks the foundation and avoid redesigning the surface in this plan.

---

## Task 1: Add Path Aliases

TypeScript and Vite need `@/` path aliases so shadcn imports work.

### 1a. Update `ui/tsconfig.app.json`

Add `baseUrl` and `paths` to `compilerOptions`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    ...existing options...
  }
}
```

### 1b. Update `ui/vite.config.ts`

Add resolve alias. The file currently imports from `vitest/config` and `@tailwindcss/vite`. Because this package is ESM, use `node:url` rather than `__dirname`:

```ts
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  devtools: command === 'serve',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    forwardConsole: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
}))
```

### Verification

```bash
cd ui && bunx tsc -b --pretty false
```

Must exit 0 with no errors.

---

## Task 2: Install Dependencies

All commands from `ui/` directory.

### 2a. UI foundation dependencies

Install the missing foundation dependencies. Keep existing dependencies that are already present (for example `clsx`).

```bash
bun add motion @tanstack/react-table @tanstack/react-query class-variance-authority tailwind-merge lucide-react @radix-ui/react-slot @radix-ui/react-tabs @radix-ui/react-tooltip @radix-ui/react-dropdown-menu @radix-ui/react-dialog @radix-ui/react-scroll-area @radix-ui/react-separator @radix-ui/react-select @radix-ui/react-toggle cmdk zustand react-router-dom
```

Explanation of each:
- `motion` -- animation library (Framer Motion successor, now called Motion)
- `@tanstack/react-table` -- headless table for logs/runs
- `@tanstack/react-query` -- server-state cache for Victoria history queries, aggregated metrics, and flow health (prevents useEffect+fetch anti-pattern). See `future-state.md` Server State layer.
- `class-variance-authority` -- variant styling (shadcn pattern)
- `tailwind-merge` -- merge Tailwind classes without conflicts
- `lucide-react` -- icon library (shadcn default)
- `@radix-ui/react-*` -- accessible headless primitives used by the planned shadcn wrappers
- `cmdk` -- command palette component (powers shadcn Command)
- `zustand` -- lightweight UI layout state store (sidebar, panels, focus mode, theme). Prevents prop-drilling layout state through the component tree. See `future-state.md` State Architecture.
- `react-router-dom` -- URL-driven navigation and deep linking. Every view state needs a shareable URL. See `future-state.md` Deep Linking.

### Verification

```bash
cd ui && bunx tsc -b --pretty false && bun run build
```

Must exit 0.

---

## Task 3: Create Utility Files

### 3a. Create `ui/src/lib/utils.ts`

This is the standard shadcn utility file:

```ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### Verification

```bash
cd ui && bunx tsc -b --pretty false
```

Must compile without errors. The `cn` function must be importable as `import { cn } from '@/lib/utils'`.

---

## Task 4: Create shadcn Component Files

Create `ui/src/components/ui/` directory and add the following component files. Each file follows the standard shadcn/ui pattern adapted for this project.

**IMPORTANT**: All components must:
- Use `import { cn } from '@/lib/utils'`
- Use `forwardRef` patterns where the component API supports refs cleanly
- Export named components (not default exports)
- Follow `ui/DESIGN-SYSTEM.md`
- Prefer CSS-variable-based classes such as `bg-[var(--surface-overlay)]` and `text-[var(--text-primary)]` over hardcoded hex values
- Do not use `sky-*` / `blue-*` utilities for accent styling
- Use `text-xs` as the minimum size for non-canvas foundation components

### 4a. Create `ui/src/components/ui/button.tsx`

Standard shadcn Button with variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`. Sizes: `default`, `sm`, `lg`, `icon`.

Use this token mapping (see `ui/DESIGN-SYSTEM.md`):
- `default`: `bg-[var(--accent-primary)] text-[var(--surface-primary)] hover:bg-[var(--accent-primary-hover)]`
- `destructive`: `bg-[var(--status-error)] text-[var(--surface-primary)] hover:opacity-90`
- `outline`: `border border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-overlay)]`
- `secondary`: `bg-[var(--surface-overlay)] text-[var(--text-primary)] hover:opacity-90`
- `ghost`: `text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]`
- `link`: `text-[var(--accent-primary)] underline-offset-4 hover:underline`

### 4b. Create `ui/src/components/ui/badge.tsx`

Standard shadcn Badge with variants: `default`, `secondary`, `destructive`, `outline`, `success`, `warning`, `stuck`.

Color mapping (Ocean Blue palette):
- `default`: `bg-[var(--accent-primary-muted)] text-[var(--accent-primary)] border-[var(--border-accent)]`
- `secondary`: `bg-[var(--surface-overlay)] text-[var(--text-primary)] border-[var(--border-default)]`
- `destructive`: use `var(--status-error)` for text/border with a soft tinted background
- `outline`: `border-[var(--border-default)] text-[var(--text-primary)]`
- `success`: use `var(--status-success)` for text/border with a soft tinted background
- `warning`: use `var(--status-warning)` for text/border with a soft tinted background
- `stuck`: same palette as `warning`, with the existing pulse animation hook if needed

### 4c. Create `ui/src/components/ui/tabs.tsx`

Wrap `@radix-ui/react-tabs`. Style:
- Tab list: `border-b border-[var(--border-default)] bg-transparent`
- Tab trigger inactive: `text-[var(--text-muted)] hover:text-[var(--text-primary)]`
- Tab trigger active: `border-b-2 border-[var(--accent-primary)] text-[var(--accent-primary)]`
- Tab content: standard padding

### 4d. Create `ui/src/components/ui/input.tsx`

Standard shadcn Input. Style:
- `border-[var(--border-default)] bg-[var(--surface-overlay)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]`
- Focus: `focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)] focus-visible:border-[var(--accent-primary)]`

### 4e. Create `ui/src/components/ui/select.tsx`

Wrap `@radix-ui/react-select`. Style:
- Trigger: `border-[var(--border-default)] bg-[var(--surface-overlay)] text-[var(--text-primary)]`
- Content: `bg-[var(--surface-raised)] border-[var(--border-default)] shadow-lg`
- Item: `text-[var(--text-primary)] focus:bg-[var(--surface-overlay)]`
- Item selected indicator: `text-[var(--accent-primary)]`

### 4f. Create `ui/src/components/ui/dropdown-menu.tsx`

Wrap `@radix-ui/react-dropdown-menu`. Style:
- Menu content: `bg-[var(--surface-raised)] border-[var(--border-default)] shadow-xl`
- Menu item: `text-[var(--text-primary)] focus:bg-[var(--surface-overlay)]`
- Menu separator: `bg-[var(--border-subtle)]`

### 4g. Create `ui/src/components/ui/tooltip.tsx`

Wrap `@radix-ui/react-tooltip`. Style:
- `bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)] text-xs shadow-lg`

### 4h. Create `ui/src/components/ui/scroll-area.tsx`

Wrap `@radix-ui/react-scroll-area`. Style scrollbar thumb as `bg-[var(--text-secondary)] hover:bg-[var(--accent-primary)]`.

### 4i. Create `ui/src/components/ui/separator.tsx`

Wrap `@radix-ui/react-separator`. Style: `bg-[var(--border-subtle)]`.

### 4j. Create `ui/src/components/ui/card.tsx`

Standard shadcn Card. Style:
- Card: `bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-primary)]`
- CardHeader: `pb-2`
- CardTitle: `text-[var(--text-primary)] text-sm font-semibold`
- CardDescription: `text-[var(--text-secondary)] text-xs`

### 4k. Create `ui/src/components/ui/sheet.tsx`

Wrap `@radix-ui/react-dialog` as a slide-out panel. Support `side` prop: `left`, `right`, `top`, `bottom`. Style:
- Overlay: use a darkened `--surface-primary` overlay, not pure black
- Content: `bg-[var(--surface-raised)] border-[var(--border-default)]`
- Default width right/left: `w-[440px]`

### 4l. Create `ui/src/components/ui/command.tsx`

Wrap `cmdk`. This powers the Cmd+K palette. Style:
- Dialog overlay: use a darkened `--surface-primary` overlay, not pure black
- Dialog content: `bg-[var(--surface-raised)] border-[var(--border-default)] shadow-2xl`
- Input: `bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]`
- Group heading: `text-[var(--text-muted)] text-xs uppercase tracking-widest`
- Item: `text-[var(--text-primary)] aria-selected:bg-[var(--surface-overlay)]`
- Item selected accent: `text-[var(--accent-primary)]`

### 4m. Create `ui/src/components/ui/table.tsx`

Standard shadcn Table primitives (Table, TableHeader, TableBody, TableRow, TableHead, TableCell). Style:
- Header: `bg-[var(--surface-raised)] text-[var(--text-muted)] text-xs uppercase tracking-widest`
- Head cell: `py-2 px-3 font-semibold`
- Row: `border-b border-[var(--border-subtle)] hover:bg-[var(--surface-overlay)] cursor-pointer`
- Row selected: `bg-[var(--accent-primary-muted)]`
- Cell: `text-[var(--text-primary)] py-2 px-3 text-sm`

### 4n. Create `ui/src/components/ui/toggle.tsx`

Wrap `@radix-ui/react-toggle`. Style:
- Off: `bg-[var(--surface-overlay)] text-[var(--text-secondary)] border-[var(--border-default)]`
- On: `bg-[var(--accent-primary-muted)] text-[var(--accent-primary)] border-[var(--border-accent)]`

### Verification

```bash
cd ui && bunx tsc -b --pretty false && bun run build
```

Must compile without errors. All components must be importable from `@/components/ui/...`.

---

## Task 5: Add Design Tokens to CSS

Align `ui/src/index.css` with `ui/DESIGN-SYSTEM.md`. Replace the current `:root` and `:root[data-theme='light']` blocks with the design-system tokens, while preserving compatibility aliases that the current canvas and animation code already uses.

### 5a. Replace `:root` block

The dark-mode `:root` block should:
- Set `font-family` to `var(--font-sans)`
- Add the design-system surface, border, text, accent, status, typography, and spacing tokens
- Keep compatibility aliases such as `--color-active`, `--color-edge`, `--color-marker`, `--color-canvas-dot`, `--glow-success`, and `--ping-border` so the current UI keeps working without component edits

Use this block:

```css
:root {
  font-family: var(--font-sans);
  line-height: 1.5;
  font-weight: 400;
  color: #f1f5f9;
  background-color: #020617;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  /* ── Palette: Slate Refined · Ocean Blue (dark) ── */
  /* Accent: #42a5f5 — Material Blue-400, hue 210°, no violet */

  /* Surfaces */
  --surface-primary: #020617;
  --surface-raised: #06101f;
  --surface-overlay: #0a1e38;
  --surface-inset: #000d1a;

  /* Borders */
  --border-default: rgba(30, 58, 95, 0.7);
  --border-subtle: rgba(30, 58, 95, 0.4);
  --border-accent: rgba(66, 165, 245, 0.4);

  /* Text */
  --text-primary: #f1f5f9;
  --text-secondary: #4d7fa8;
  --text-muted: #2d5986;

  /* Accent */
  --accent-primary: #42a5f5;
  --accent-primary-hover: #64b5f6;
  --accent-primary-muted: rgba(66, 165, 245, 0.15);

  /* Status */
  --status-success: #34d399;
  --status-warning: #fbbf24;
  --status-error: #f87171;
  --status-active: #42a5f5;
  --status-idle: #4d7fa8;

  /* Glows */
  --glow-active: oklch(67% 0.18 210);
  --glow-success: oklch(72% 0.19 160);
  --glow-error: oklch(65% 0.22 25);
  --glow-warning: oklch(75% 0.18 70);
  --glow-idle: oklch(22% 0.05 210 / 0.5);
  --ping-border: oklch(67% 0.18 210 / 0.6);

  /* Canvas */
  --canvas-bg: #020617;
  --canvas-dot: rgba(30, 58, 95, 0.6);

  /* Typography */
  --font-sans: 'Inter', 'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', 'SF Mono', 'Fira Code', ui-monospace, monospace;

  /* Spacing */
  --panel-padding: 16px;
  --panel-gap: 12px;
  --card-padding: 12px;

  /* Compatibility aliases for the current canvas implementation */
  --color-active: var(--status-active);
  --color-edge: #1e3a5f;
  --color-edge-dimmed: #0f2340;
  --color-edge-dashed: var(--status-warning);
  --color-marker: var(--text-muted);
  --color-marker-dashed: var(--text-secondary);
  --color-canvas-dot: var(--canvas-dot);
}
```

### 5b. Replace `:root[data-theme='light']` block

```css
:root[data-theme='light'] {
  color: #0a1929;
  background-color: #f0f7ff;

  /* ── Palette: Slate Refined · Ocean Blue (light) ── */

  /* Surfaces */
  --surface-primary: #f0f7ff;
  --surface-raised: #dbeafe;
  --surface-overlay: #bfdbfe;
  --surface-inset: #e3f2fd;

  /* Borders */
  --border-default: #90caf9;
  --border-subtle: #bbdefb;
  --border-accent: rgba(21, 101, 192, 0.28);

  /* Text */
  --text-primary: #0a1929;
  --text-secondary: #1e3a5f;
  --text-muted: #4d7fa8;

  /* Accent */
  --accent-primary: #1565c0;
  --accent-primary-hover: #1976d2;
  --accent-primary-muted: rgba(21, 101, 192, 0.08);

  /* Status */
  --status-success: #2e7d32;
  --status-warning: #f57c00;
  --status-error: #c62828;
  --status-active: #1565c0;
  --status-idle: #90caf9;

  /* Compatibility glow values for the current canvas implementation */
  --glow-active: oklch(42% 0.18 210);
  --glow-success: oklch(38% 0.2 160);
  --glow-error: oklch(40% 0.24 18);
  --glow-warning: oklch(55% 0.18 70);
  --glow-idle: oklch(75% 0.04 210 / 0.4);
  --ping-border: oklch(42% 0.18 210 / 0.5);

  /* Compatibility canvas aliases */
  --canvas-bg: #f0f7ff;
  --canvas-dot: #bbdefb;
  --color-active: var(--status-active);
  --color-edge: #90caf9;
  --color-edge-dimmed: #bbdefb;
  --color-edge-dashed: var(--status-warning);
  --color-marker: var(--text-muted);
  --color-marker-dashed: var(--accent-primary);
  --color-canvas-dot: var(--canvas-dot);
}
```

### 5c. Update body background colors

Update `body` and `body[data-theme='light']` to use the new design-system surface/text tokens:
```css
body {
  background: var(--surface-primary);
  color: var(--text-primary);
}
body[data-theme='light'] {
  background: var(--surface-primary);
  color: var(--text-primary);
}
```

### 5d. Install Inter font

Add to `<head>` in `ui/index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300..700;1,14..32,300..400&display=swap" rel="stylesheet">
```

### Verification

```bash
cd ui && bun run build
```

Must exit 0. Then run `bun run dev` and confirm the app loads. The app will pick up the deeper Ocean Blue token set and Inter typography, but there should still be no component-level redesign in this phase.

---

## Task 5.5: Create Theme Token File

Create `ui/src/lib/theme.ts` — the typed TypeScript companion to the CSS tokens. This file is imported by components that need token values at runtime (for example React Flow nodes/edges and SVG-driven effects that cannot rely on CSS variables alone).

```ts
/**
 * ResQ-Flow Design Tokens — Slate Refined · Ocean Blue
 *
 * Hue 210° accent: unambiguously blue, no violet.
 * Dark mode: deep navy surfaces, ocean blue glow.
 * Light mode: blue-tinted white, deep ocean accent.
 *
 * These values must stay in sync with the CSS variables in index.css.
 * When changing a color, update BOTH this file AND index.css.
 */

export const themeTokens = {
  dark: {
    surfacePrimary: '#020617',
    surfaceRaised: '#06101f',
    surfaceOverlay: '#0a1e38',
    surfaceInset: '#000d1a',
    accentPrimary: '#42a5f5',
    accentPrimaryHover: '#64b5f6',
    accentPrimaryMuted: 'rgba(66, 165, 245, 0.15)',
    borderDefault: 'rgba(30, 58, 95, 0.7)',
    borderSubtle: 'rgba(30, 58, 95, 0.4)',
    borderAccent: 'rgba(66, 165, 245, 0.4)',
    textPrimary: '#f1f5f9',
    textSecondary: '#4d7fa8',
    textMuted: '#2d5986',
    statusSuccess: '#34d399',
    statusWarning: '#fbbf24',
    statusError: '#f87171',
    statusActive: '#42a5f5',
    statusIdle: '#4d7fa8',
    glowActive: 'oklch(67% 0.18 210)',
    glowSuccess: 'oklch(72% 0.19 160)',
    glowError: 'oklch(65% 0.22 25)',
    glowWarning: 'oklch(75% 0.18 70)',
    glowIdle: 'oklch(22% 0.05 210 / 0.5)',
    canvasBg: '#020617',
    canvasDot: 'rgba(30, 58, 95, 0.6)',
    edgeDefault: '#1e3a5f',
    edgeDimmed: '#0f2340',
    edgeDashed: '#fbbf24',
    marker: '#2d5986',
    markerDashed: '#4d7fa8',
  },
  light: {
    surfacePrimary: '#f0f7ff',
    surfaceRaised: '#dbeafe',
    surfaceOverlay: '#bfdbfe',
    surfaceInset: '#e3f2fd',
    accentPrimary: '#1565c0',
    accentPrimaryHover: '#1976d2',
    accentPrimaryMuted: 'rgba(21, 101, 192, 0.08)',
    borderDefault: '#90caf9',
    borderSubtle: '#bbdefb',
    borderAccent: 'rgba(21, 101, 192, 0.28)',
    textPrimary: '#0a1929',
    textSecondary: '#1e3a5f',
    textMuted: '#4d7fa8',
    statusSuccess: '#2e7d32',
    statusWarning: '#f57c00',
    statusError: '#c62828',
    statusActive: '#1565c0',
    statusIdle: '#90caf9',
    glowActive: 'oklch(42% 0.18 210)',
    glowSuccess: 'oklch(38% 0.2 160)',
    glowError: 'oklch(40% 0.24 18)',
    glowWarning: 'oklch(55% 0.18 70)',
    glowIdle: 'oklch(75% 0.04 210 / 0.4)',
    canvasBg: '#f0f7ff',
    canvasDot: '#bbdefb',
    edgeDefault: '#90caf9',
    edgeDimmed: '#bbdefb',
    edgeDashed: '#f57c00',
    marker: '#4d7fa8',
    markerDashed: '#1565c0',
  },
  typography: {
    fontSans: "'Inter', 'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif",
    fontMono: "'IBM Plex Mono', 'SF Mono', 'Fira Code', ui-monospace, monospace",
  },
  spacing: {
    panelPadding: 16,
    panelGap: 12,
    cardPadding: 12,
  },
} as const

export type ThemeMode = keyof Pick<typeof themeTokens, 'dark' | 'light'>
export type ThemeTokenScale = keyof typeof themeTokens
```

### Verification

```bash
cd ui && bunx tsc -b --pretty false
```

Must compile. Verify `import { themeTokens } from '@/lib/theme'` works.

---

## Task 6: Create Component Index

Create `ui/src/components/ui/index.ts` that re-exports all components for convenient imports:

```ts
export { Button, buttonVariants } from './button'
export { Badge, badgeVariants } from './badge'
export { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs'
export { Input } from './input'
export {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from './select'
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from './dropdown-menu'
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './tooltip'
export { ScrollArea } from './scroll-area'
export { Separator } from './separator'
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card'
export {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from './sheet'
export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from './command'
export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './table'
export { Toggle } from './toggle'
```

### Verification

```bash
cd ui && bunx tsc -b --pretty false && bun run build
```

Must compile. All exports must resolve.

---

## Task 7: Smoke Test

Create a smoke test at `ui/src/components/ui/__tests__/smoke.test.tsx` that does two things:
- Verifies the full `@/components/ui` surface exports are defined
- Renders representative non-portal primitives so the basic styling wrappers compile and mount cleanly

For portal-backed components (`Select`, `DropdownMenu`, `Tooltip`, `Sheet`, `CommandDialog`), keep this test lightweight and assert exports are defined rather than forcing interaction-heavy behavior into a smoke test.

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import * as ui from '../index'

describe('shadcn component smoke tests', () => {
  it('exports the planned primitives', () => {
    expect(ui.Button).toBeDefined()
    expect(ui.Badge).toBeDefined()
    expect(ui.Tabs).toBeDefined()
    expect(ui.Input).toBeDefined()
    expect(ui.Select).toBeDefined()
    expect(ui.DropdownMenu).toBeDefined()
    expect(ui.Tooltip).toBeDefined()
    expect(ui.ScrollArea).toBeDefined()
    expect(ui.Separator).toBeDefined()
    expect(ui.Card).toBeDefined()
    expect(ui.Sheet).toBeDefined()
    expect(ui.CommandDialog).toBeDefined()
    expect(ui.Table).toBeDefined()
    expect(ui.Toggle).toBeDefined()
  })

  it('renders representative primitives', () => {
    const { getByRole, getByText } = render(
      <div>
        <ui.Button>Click</ui.Button>
        <ui.Badge>Status</ui.Badge>
        <ui.Input placeholder="test" />
        <ui.Tabs defaultValue="overview">
          <ui.TabsList>
            <ui.TabsTrigger value="overview">Overview</ui.TabsTrigger>
          </ui.TabsList>
          <ui.TabsContent value="overview">Tab content</ui.TabsContent>
        </ui.Tabs>
        <ui.Separator />
        <ui.Card>
          <ui.CardHeader>
            <ui.CardTitle>Title</ui.CardTitle>
          </ui.CardHeader>
          <ui.CardContent>Content</ui.CardContent>
        </ui.Card>
        <ui.ScrollArea className="h-16">
          <div>Scrollable content</div>
        </ui.ScrollArea>
        <ui.Table>
          <ui.TableHeader>
            <ui.TableRow>
              <ui.TableHead>Column</ui.TableHead>
            </ui.TableRow>
          </ui.TableHeader>
          <ui.TableBody>
            <ui.TableRow>
              <ui.TableCell>Cell</ui.TableCell>
            </ui.TableRow>
          </ui.TableBody>
        </ui.Table>
        <ui.Toggle pressed>Toggle</ui.Toggle>
      </div>,
    )

    expect(getByRole('button', { name: 'Click' })).toHaveTextContent('Click')
    expect(getByText('Status')).toBeInTheDocument()
    expect(getByRole('textbox')).toBeInTheDocument()
    expect(getByText('Title')).toBeInTheDocument()
    expect(getByText('Content')).toBeInTheDocument()
    expect(getByText('Tab content')).toBeInTheDocument()
    expect(getByText('Cell')).toBeInTheDocument()
    expect(getByText('Toggle')).toBeInTheDocument()
  })
})
```

Execution note: when this plan was executed on current `main`, rendering both `<ui.Button>` and `<ui.Toggle>` made the original generic `getByRole('button')` assertion ambiguous. The implemented smoke test therefore narrows the query to `getByRole('button', { name: 'Click' })` to preserve the intended assertion without introducing a false-negative test failure.

### Verification

```bash
cd ui && bun test
```

All tests must pass, including the existing tests AND the new smoke tests.

---

## Final Verification Checklist

Run these commands in order from `ui/`:

```bash
bunx tsc -b --pretty false   # TypeScript compiles across app + vite config
bun run build                # Vite builds successfully
bun test                     # All tests pass (existing + new)
```

All three must exit 0.

## What NOT To Do

- Do NOT modify any existing components (BottomLogPanel, FlowSelector, NodeDetailPanel, TraceDetailPanel, FlowCanvas, etc.)
- Do NOT change component-level CSS classes or existing animations in current UI files
- Do NOT delete any files
- Do NOT redesign the app's structure or interaction patterns in this plan
- Do NOT add any new routes or pages
- Do NOT modify the flow/node/edge logic
- Do NOT change test configuration beyond adding the new smoke test
- Do NOT regress existing run/journey/history behavior already on `main`
- The global token/font update in `ui/src/index.css` is expected and allowed

## Output

After completing all tasks, the codebase should have:
- Path aliases working (`@/` -> `./src/`)
- 14 shadcn-style component files in `ui/src/components/ui/`
- Design-system tokens added to CSS, with current canvas aliases preserved
- Inter font loaded
- Motion, TanStack Table, TanStack Query, Zustand, React Router, and the required Radix dependencies installed via Bun
- All existing tests still passing
- New smoke test passing
- Build succeeds with no errors
- Existing run/journey/history UX still working exactly as before, aside from token/font adoption and new foundation files becoming available for later migration
