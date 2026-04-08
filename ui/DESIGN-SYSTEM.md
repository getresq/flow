# resq-flow Design System

**Palette**: Slate Refined · Ocean Blue
**Stack**: React 19, Vite 8, Tailwind v4, shadcn/ui (copy-components), Radix UI primitives

---

## Color Tokens

All tokens are defined in `ui/src/index.css`. Runtime JS values (for React Flow nodes/edges) are in `ui/src/lib/theme.ts`.

### Dark Mode (`:root` default)

| CSS Variable | Value | Purpose |
|---|---|---|
| `--surface-primary` | `#020617` | App background (slate-950) |
| `--surface-raised` | `#06101f` | Panel backgrounds, cards |
| `--surface-overlay` | `#0a1e38` | Inputs, dropdowns, hover surfaces |
| `--accent-primary` | `#42a5f5` | Primary accent — Ocean Blue, hue 210° |
| `--accent-primary-hover` | `#64b5f6` | Hover state for accent elements |
| `--accent-primary-muted` | `rgba(66,165,245,0.15)` | Badge backgrounds, selected rows |
| `--border-default` | `rgba(30,58,95,0.7)` | All borders |
| `--border-accent` | `rgba(66,165,245,0.4)` | Focus rings, active borders |
| `--text-primary` | `#f1f5f9` | Headings, primary content |
| `--text-secondary` | `#4d7fa8` | Secondary labels, muted content |
| `--text-muted` | `#2d5986` | Placeholder text, disabled |
| `--glow-active` | `oklch(67% 0.18 210)` | Node active glow |
| `--glow-error` | `oklch(65% 0.22 25)` | Node error glow |
| `--glow-warning` | `oklch(75% 0.18 70)` | Node warning glow |
| `--canvas-bg` | `#020617` | React Flow canvas background |
| `--canvas-dot` | `rgba(30,58,95,0.6)` | React Flow grid dots |

### Light Mode (`:root[data-theme='light']`)

| CSS Variable | Value |
|---|---|
| `--surface-primary` | `#f0f7ff` |
| `--surface-raised` | `#ffffff` |
| `--surface-overlay` | `#f0f7ff` |
| `--accent-primary` | `#1565c0` |
| `--accent-primary-hover` | `#1976d2` |
| `--border-default` | `#90caf9` |
| `--text-primary` | `#0a1929` |
| `--text-secondary` | `#1e3a5f` |
| `--text-muted` | `#4d7fa8` |

### Status Colors (universal — same in both modes)

| State | Dark token | Light token |
|---|---|---|
| Success | `#34d399` | `#2e7d32` |
| Warning | `#fbbf24` | `#f57c00` |
| Error | `#f87171` | `#c62828` |
| Stuck | `#fbbf24` (pulsing) | `#f57c00` |
| Active | `#42a5f5` (glowing) | `#1565c0` |
| Idle | `#4d7fa8` | `#90caf9` |

---

## Typography

| Scale | Class | Size | Use |
|---|---|---|---|
| Display | `text-2xl font-semibold` | 24px | Stat card values |
| Title | `text-base font-medium` | 16px | Panel headings |
| Body | `text-sm` | 14px | Log rows, run rows, panel body |
| Label | `text-xs` | 12px | Column headers, badges, filter chips |
| Canvas | `text-[11px]` | 11px | Node labels only (canvas context) |

**Font families:**
- `font-sans` (Inter) — all UI labels, headings, copy
- `font-mono` — trace IDs, attribute values, log messages, timestamps, durations

**Never use:** `text-[9px]`, `text-[10px]` — these are illegible at normal screen DPI.

---

## Graph Block Naming

Graph blocks should stay short and easy to scan.

- block face = short title + optional short subtitle only
- titles should usually be 1 to 3 words
- process titles should usually be verb-first
- process blocks should usually omit subtitles
- decision titles should usually be short questions
- subtitles are optional and should show a short normalized technical alias when they add value
- do not put long business-rule sentences on the face of a block
- longer explanation belongs in sidebar `description`
- `notes` are only for short bullet caveats or gotchas

Examples:

- good titles:
  - `Analyze Queue`
  - `Reuse Batch`
  - `Fetch Thread`
  - `Auto Send?`
- good subtitles:
  - `mail-analyze`
  - `mail-reply-drafts`
  - `thread-store`
- avoid:
  - `if existing active action batch: reuse batch and stop`
  - `rrq:queue:mail-analyze`
  - `mail_reply_drafts`

## Graph Block Sizing

Use a small size system, not one-off widths.

- queue / worker / scheduler blocks: `240 × 72`
- process blocks: `200 × 72`
- detail / badge blocks: `200 × 44`
- trigger pills: `240 × 44`
- keep semantic exceptions:
  - decision nodes stay diamonds
  - datastore nodes stay cylinders

Rules:

- do not widen blocks to fit long prose — shorten the title first
- queue / worker / scheduler titles should be ≤28 characters
- process titles should be ≤24 characters
- use `description` in the sidebar for longer explanation
- use explicit per-node widths only when a real layout need remains after label cleanup
- branch outcome nodes (terminal states, simple write operations, error fallbacks) should use `detail`, not `process` — they should visually recede so the primary flow spine stands out

Grouped internals:

- inside groups, default child nodes to the detail family
- only promote a grouped child to a first-class process when users truly need to reason about it as a standalone step

---

## Spacing

| Token | Value | Use |
|---|---|---|
| Panel padding | `px-4 py-3` | NodeDetailPanel, TraceDetailPanel, BottomLogPanel |
| Row padding | `py-2` | Log rows, run rows |
| Button padding | `px-3 py-1.5` | Standard buttons |
| Card padding | `p-3` | Stat cards |
| Gap between chips | `gap-2` | Filter chip groups, badge groups |
| Header height | `48px` (fixed) | FlowSelector — never wraps |
| Side panel width | `w-[440px]` | Sheet/drawer panels |
| Bottom drawer default | `260px` height | BottomLogPanel |

---

## shadcn Component Usage Guide

Always import from `@/components/ui/`. Never hand-roll these primitives.

| Use case | Component |
|---|---|
| Any clickable control | `<Button variant="ghost|outline|default" size="icon|sm|default">` |
| Status label | `<Badge variant="default|secondary|destructive|outline">` |
| Text input / search | `<Input>` |
| Dropdown selector | `<Select>` + `<SelectTrigger>` + `<SelectContent>` + `<SelectItem>` |
| Tab navigation | `<Tabs>` + `<TabsList>` + `<TabsTrigger>` + `<TabsContent>` |
| Hover explanation | `<Tooltip>` + `<TooltipTrigger>` + `<TooltipContent>` |
| Settings/action menu | `<DropdownMenu>` + `<DropdownMenuTrigger>` + `<DropdownMenuContent>` |
| Scrollable container | `<ScrollArea>` |
| Section divider | `<Separator>` |
| Slide-in panel | `<Sheet side="right">` + `<SheetContent>` |
| Command palette | `<CommandDialog>` + `<CommandInput>` + `<CommandList>` |
| Data tables | `<Table>` + `<TableHeader>` + `<TableBody>` + `<TableRow>` + `<TableCell>` |
| Stat/insight card | `<Card>` + `<CardHeader>` + `<CardDescription>` + `<CardContent>` |

### Button Variants

| Variant | When to use |
|---|---|
| `default` | Primary action (playback start, history load) |
| `outline` | Toggle-style (active filter chip, active mode) |
| `ghost` | Icon-only controls (close, settings, pin, theme toggle) |
| `ghost size="icon"` | Icon-only without text |

### Badge Variants

| Variant | When to use |
|---|---|
| `default` | Accent-colored pill (event count, active state) |
| `secondary` | Neutral label (node kind, metadata) |
| `destructive` | Error / failed status |
| `outline` | Idle / inactive state |

Custom status variants (add in `badge.tsx`):
- `success` — emerald background
- `warning` — amber background
- `stuck` — amber pulsing

---

## Side Panel Pattern

Side panels (NodeDetailPanel, TraceDetailPanel) use `<Sheet side="right">`:

```tsx
<Sheet open={isOpen} onOpenChange={setIsOpen}>
  <SheetContent className="w-[440px] p-0 flex flex-col">
    <SheetHeader className="px-4 py-3 border-b border-[rgba(30,58,95,0.7)]">
      <SheetTitle>Node Name</SheetTitle>
    </SheetHeader>
    <ScrollArea className="flex-1">
      <div className="px-4 py-3 space-y-4">
        {/* content */}
      </div>
    </ScrollArea>
  </SheetContent>
</Sheet>
```

Benefits: canvas stays full-width, Escape closes, click-outside closes, focus trap is free.

---

## Node Visual States

| State | Border | Glow | Background |
|---|---|---|---|
| `idle` | `--border-default` | none | `--surface-raised` |
| `active` | `--accent-primary` | `--glow-active` | `--surface-overlay` |
| `success` | `#34d399` | subtle emerald | `--surface-raised` |
| `error` | `#f87171` | `--glow-error` | `--surface-raised` |
| `warning` | `#fbbf24` | `--glow-warning` | `--surface-raised` |
| `stuck` | `#fbbf24` | pulsing amber | `--surface-raised` |
| `selected` | `--accent-primary` | none | `--surface-overlay` |

Status transitions should use Motion's `animate` over 300ms — never abrupt class swaps.

---

## Canvas Shape Language

Default mapping:

| Semantic role | Default shape |
|---|---|
| Trigger | Pill |
| Queue | Rounded rectangle |
| Worker | Rounded rectangle |
| Scheduler / process | Rounded rectangle |
| Decision | Diamond |
| Resource | Cylinder |
| Visible detail | Rounded rectangle inside a group when possible |
| Note | Annotation |

Rules:

- Option D remains the base palette for all node families.
- Queue, worker, and process nodes should feel like one rounded-rectangle
  family, not unrelated widget types.
- Use pills only for external starting conditions.
- Avoid badges in the main graph unless a tiny inline callout is clearly the
  best choice.

---

## Node Color Roles

Colors are assigned **by semantic role**, not per-node. The factory in `ui/src/flows/nodeFactory.ts` derives `style.color` from `semanticRole` automatically — flow files should never set `color` manually.

### Role → Color Token Mapping

| Semantic Role | Color Token | Visual Intent |
|---|---|---|
| `trigger` | `trigger` | Green — external starting condition |
| `queue` | `queue` | Amber — queue boundary / backlog visibility |
| `worker` | `worker` | Ocean blue — worker execution family |
| `scheduler` | `cron` | Neutral slate — temporal scheduler boundary |
| `process` | `process` | Quieter blue — first-class business process |
| `decision` | `decision` | Violet — branching / conditional |
| `resource` | `resource` | Slate-teal — concrete storage/resource boundary |
| `detail` | `detail` | Muted subordinate row / child detail |
| `group` | `group` | Muted container |
| `note` | `detail` | Muted slate — annotations |

### Notes And Inspector Rules

- Notes default to the sidebar, not the canvas.
- Canvas annotations should be rare and reserved for graph-critical context.
- Process inspectors should be meaning-first:
  - purpose
  - notes / caveats
  - related resources / side effects
  - logs and timing after that
- Detail nodes should stay visually and semantically subordinate to process
  nodes.

### Resource Label Rules

Resource cylinders should use concrete resource type labels.

Preferred examples:

- `PG` + `postgres`
- `S3`
- `REDIS`

Avoid generic visible labels like `RES`, `Store`, or `Data`.

---

## Semantic Zoom Breakpoints

Pass zoom from React Flow's `useViewport()` via context to node components.

| Zoom level | What to show |
|---|---|
| `< 0.6x` | Shape + status color only. Hide all text, badges, icons. |
| `0.6x – 1.0x` | Label + status badge. Hide sublabel, bullets. |
| `> 1.0x` | Everything — label, sublabel, badge, icon, counter. |

Use CSS `transition: opacity 150ms ease-out` on the fading elements.

---

## Animation Targets

| Interaction | Duration | Easing |
|---|---|---|
| Panel open/close (Sheet) | 200ms | ease-out |
| Tab switch | 150ms | ease-out |
| Node status glow bloom | 300ms | ease-out |
| Node entrance stagger | 30ms per node | ease-out |
| Bottom drawer resize | 200ms | ease-out |
| Focus mode transition | 250ms | ease-in-out |
| Command palette open | 150ms | ease-out |

Use Motion's `<AnimatePresence>` for enter/exit. Use `animate` for value transitions.

---

## Anti-Patterns

- **Do not** use `sky-*`, `blue-*` Tailwind utilities for accent — use CSS variables or `theme.ts` tokens
- **Do not** use inline styles for colors — always use tokens
- **Do not** use `text-[9px]` or `text-[10px]` anywhere outside canvas nodes
- **Do not** hand-roll buttons, tabs, inputs, selects — use shadcn components
- **Do not** use the word "trace" or "span" in primary UI copy — use "run" and "node"
- **Do not** use `overflow-y-auto` on panel content areas — use `<ScrollArea>`
- **Do not** write `bg-black` or `bg-white` anywhere — minimum darks are `#020617`, minimum lights are `#f0f7ff`
- **Do not** add `!important` overrides to component styles

---

## Language Rules

| Say | Instead of |
|---|---|
| Run | Trace, Journey |
| Node | Span, Component |
| Logs | Events (as primary noun) |
| Advanced telemetry | Raw trace / span tree |
| Flow | Pipeline (as primary noun) |

Trace IDs and span details belong in the **Advanced** tab only.
