# Bottom Panel Refactor: Whisper-Weight Bar

## Context

The original bottom log panel was an inline `<motion.div>` with a heavy collapsed state (7 UI elements) and a separate Flow/Logs tab toggle in the header that switched to a full-page `LogsView`. This created redundancy, wasted prime header real estate, and broke spatial hierarchy.

We tried **Plan A** (floating card sheet with rounded corners, horizontal inset, shadow) — it felt too "mobile-ported" on desktop: low contrast in dark mode, awkward side spacing, and the card identity dissolved at full height.

**Shipped**: Plan B — a whisper-weight full-width bar with three drag-snap states and an explicit expand/collapse chevron.

---

## What shipped

### Bottom panel (`BottomLogPanel.tsx`)

A fixed-position, full-width panel anchored to the bottom of the viewport. No rounded corners, no inset, no shadow — just a clean `border-t` separator.

| State | Height | Content shown |
|-------|--------|---------------|
| **Whisper** | 48px | Drag pill + "Logs" label + count badge + "Runs" label + count badge + expand chevron |
| **Partial** | ~30vh | Drag pill + full toolbar (Logs/Runs tabs, search, filters, Live) + collapse chevron + scrollable table |
| **Full** | viewport - header | Same as partial, fills available space |

Three interaction methods:
1. **Drag** — grab the pill handle, drag up/down, snaps to nearest state on release
2. **Chevron button** — explicit expand (whisper→partial) or collapse (partial/full→whisper) toggle
3. **Double-click** — on the drag handle, toggles between whisper and partial

### Header (`FlowSelector.tsx`)

Removed the Flow/Logs tab toggle from the center. Center column is empty — clean negative space.

```
┌─────────────────────────────────────────────────────────────┐
│  < Mail Pipeline  ● Connected                      ⤢   ⚙  │
└─────────────────────────────────────────────────────────────┘
  ↑ left cluster (unchanged)    ↑ center: empty     ↑ right
```

### Layout store (`stores/layout.ts`)

Replaced `bottomPanelHeight: number` with `bottomPanelSnap: 'whisper' | 'partial' | 'full'`. Helper functions `snapToHeight()` and `resolveSnapFromHeight()` live in the panel component.

### Flow view (`FlowView.tsx`)

- Removed `LogsView` rendering for graph flows (bottom panel replaces it)
- `LogsView` still renders for headless flows (no graph)
- Focus mode saves/restores snap state, sets whisper on activate
- URL sync: `?view=logs` → full snap, `?view=canvas` → partial/whisper

---

## Files changed

| File | Change |
|------|--------|
| `ui/src/core/components/BottomLogPanel.tsx` | Full rewrite — fixed-position `motion.div`, custom drag logic, whisper/partial/full snap states, chevron toggle |
| `ui/src/core/components/FlowSelector.tsx` | Removed center `<Tabs>` (Flow/Logs toggle). Removed related props. |
| `ui/src/core/components/FlowView.tsx` | Removed `LogsView` for graph flows. Added snap↔URL sync. Updated focus mode. |
| `ui/src/stores/layout.ts` | `bottomPanelSnap` replaces `bottomPanelHeight`. New types and helpers. |
| `ui/src/core/components/__tests__/BottomLogPanel.test.tsx` | Updated for snap-based state. Added whisper state test. |
| `ui/src/core/components/__tests__/CommandPalette.test.tsx` | Updated initial state to use `bottomPanelSnap`. |
| `ui/src/stores/__tests__/layout.test.ts` | Updated for snap-based state. |

### Removed

| File/Dependency | Reason |
|----------------|--------|
| `vaul` (npm) | Tried for Plan A card sheet, abandoned — portal/snap behavior conflicted with our layout. Uninstalled. |

---

## Manual test checklist

Run `make dev` and `make replay` to get live data flowing, then verify:

- [ ] **Whisper state**: Panel shows drag pill + "Logs" + count + "Runs" + count + expand chevron. Canvas fills viewport.
- [ ] **Click expand chevron**: Panel animates to partial (~30vh). Toolbar appears with tabs, search, filters, Live badge. Chevron rotates to "collapse".
- [ ] **Click collapse chevron**: Panel returns to whisper.
- [ ] **Drag to partial**: Panel expands smoothly. Log table visible with streaming data. Canvas still visible above.
- [ ] **Drag to full**: Panel fills content area. URL changes to `?view=logs`.
- [ ] **Drag back down**: Canvas reappears. URL changes to `?view=canvas`.
- [ ] **Double-click handle**: Toggles between whisper and partial.
- [ ] **Direct URL**: Navigate to `?view=logs` — panel opens at full. Navigate to `?view=canvas` — panel at partial/whisper.
- [ ] **Focus mode**: Activating focus mode snaps panel to whisper. Deactivating restores previous snap.
- [ ] **Header**: No Flow/Logs toggle in center. Clean empty space.
- [ ] **Both themes**: Panel styling works in dark and light mode.
- [ ] **Node click**: Clicking a node opens the right-side inspector. Panel and inspector coexist.
- [ ] **Headless flow**: Flows without a graph still render `LogsView` directly (not the bottom panel).

---

## Design decisions log

| Decision | Chosen | Rejected | Why |
|----------|--------|----------|-----|
| Card aesthetic (rounded corners, inset, shadow) | No | Yes | Felt "mobile-ported" on desktop. Low contrast in dark mode. Card identity dissolves at full height. |
| Vaul library | No | Yes | Portal system conflicted with fixed layout. Snap points unreliable. |
| Custom drag with `motion.div` | Yes | — | Full control over snap behavior, pointer capture, height animation. |
| Explicit chevron button | Yes | — | Users need a visible affordance beyond the drag handle. |
| Three snap states | Yes | — | Maps to three user intents: awareness (whisper), quick glance (partial), deep dive (full). |
| Full-width panel | Yes | — | Clean, desktop-native. No visual gimmicks. |
