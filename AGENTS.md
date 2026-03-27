## Cursor Cloud specific instructions

### Overview

resq-flow is a local dev-only real-time flow visualization tool with two services:

- **Relay** (`relay/`): Rust (Axum) WebSocket server on port 4200 — receives OTLP traces/logs, broadcasts FlowEvents.
- **UI** (`ui/`): Vite + React 19 + TypeScript app on port 5173 — renders interactive flow diagrams.

### Prerequisites

- **Rust** ≥ 1.85 (edition 2024). The default rustup toolchain must be set to `stable` (`rustup default stable`).
- **Bun** (`~/.bun/bin/bun`). Ensure `~/.bun/bin` is on PATH.

### Running, testing, linting

See `Makefile` for all standard commands (`make dev`, `make test`, `make replay`).

- `cd relay && cargo test` — 4 integration tests (OTLP→WS, logs, broadcast).
- `cd ui && bun test` — 15 Vitest tests (hooks, components, span mapping).
- `cd ui && bun run lint` — ESLint. Pre-existing React Compiler warnings exist (not blocking).
- `cd ui && bun run build` — TypeScript check + Vite build.

### Non-obvious caveats

- The Rust relay must be compiled before `make dev` will work; first run takes ~15s to compile dependencies.
- `make replay` requires both the relay and UI to be running first — it sends fixture data through the relay WebSocket.
- No Docker, databases, or external services are required.

---

## Design System

**Full reference**: `ui/DESIGN-SYSTEM.md`

### Palette: Slate Refined · Ocean Blue

| Token | Dark | Light |
|-------|------|-------|
| `--surface-primary` | `#020617` | `#f0f7ff` |
| `--surface-raised` | `#06101f` | `#dbeafe` |
| `--surface-overlay` | `#0a1e38` | `#bfdbfe` |
| `--accent-primary` | `#42a5f5` (hue 210°) | `#1565c0` |
| `--text-primary` | `#f1f5f9` | `#0a1929` |
| `--text-secondary` | `#4d7fa8` | `#1e3a5f` |
| `--border-default` | `rgba(30,58,95,0.7)` | `#90caf9` |

Status colors (universal):
- Success: `#34d399` dark / `#2e7d32` light
- Warning: `#fbbf24` dark / `#f57c00` light
- Error: `#f87171` dark / `#c62828` light

### UI Component Rules

- **Always use shadcn components** from `@/components/ui/` — never hand-roll buttons, inputs, tabs, selects, badges, tooltips, dropdowns, scroll areas, or separators.
- **Never use inline `sky-*` or `blue-*` Tailwind utilities** for accent colors — use CSS variables or the typed tokens from `ui/src/lib/theme.ts`.
- **Monospace only for data** — trace IDs, attribute values, log messages, timestamps. Use `font-mono`. Everything else: `font-sans` (Inter).
- **Generous spacing** — panel padding minimum `px-4 py-3`. Row padding minimum `py-2`. No `text-[9px]` or `text-[10px]`.
- **Node canvas labels** may stay at `text-xs` / `text-[11px]` — they're in a zoomed visual context.

### Language Rules (from language spec)

Say: `Flow`, `Run`, `Node`, `Logs`, `Status`, `Timing`
Avoid in primary UI: `trace`, `span`, `event`, `telemetry` (reserve for Advanced tab)

### File Conventions

- New UI components: `ui/src/core/components/PascalCase.tsx`
- New shadcn components: `ui/src/components/ui/kebab-case.tsx`
- New hooks: `ui/src/core/hooks/useCamelCase.ts`
- Theme token file (runtime JS values): `ui/src/lib/theme.ts`
