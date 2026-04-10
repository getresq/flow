# Refactor: Drawer content by click intent

## Problem

Clicking a log row and clicking a node on the canvas both produce the same sidebar content (node aggregate view). The user loses the specificity of the event they clicked. The node drawer also never surfaces the actual `error_message` text — it says *that* something failed, not *what* failed. The Timing tab is noise for default troubleshooting.

## Goal

The `InspectorPanel` shell stays the same. The **content** rendered inside it changes based on what the user clicked:

| User action | URL state set | Content rendered |
|---|---|---|
| Click a run (Runs table) | `?run=<traceId>` | `TraceDetailContent` (no changes) |
| Click a log row (Logs table) | `?log=<seq>` | `EventDetailContent` (new) |
| Click a node (canvas) | `?node=<nodeId>` | `NodeDetailContent` (simplified) |

Priority cascade in FlowView: `run` > `log` > `node`.

## Test runner

```bash
cd ui && npm test
```

All existing tests must pass after each phase. New tests are added where noted.

---

## Phase 1: Add `selectedLogEntry` to URL state + FlowView wiring

**What:** Introduce `?log=<seq>` URL param. Wire a new selection path through FlowView so that clicking a log row stores the specific `LogEntry` and the drawer priority cascade includes it.

### 1a. Add `log` param to `useUrlState.ts`

**File:** `ui/src/core/hooks/useUrlState.ts`

- Add `log?: string | null` to the `UrlStateUpdate` interface.
- Parse `searchParams.get('log')` into `selectedLogSeq: string | undefined` (the seq number as a string).
- Add a `setSelectedLogSeq` callback that calls `updateUrlState({ log: ... })`.
- In the `updateUrlState` function, handle the `'log'` key the same way `'node'` and `'run'` are handled (lines 57-65).
- Export `selectedLogSeq` and `setSelectedLogSeq`.

### 1b. Wire `selectedLogEntry` through FlowView

**File:** `ui/src/core/components/FlowView.tsx`

- Import `selectedLogSeq` and `setSelectedLogSeq` from `useUrlState`.
- Derive `selectedLogEntry` by looking up `selectedLogSeq` in `logStream.globalLogs` — find the `LogEntry` where `String(entry.seq) === selectedLogSeq`. Memoize this.
- Update the rendering cascade (lines 523-570) to add a middle branch:
  ```
  if (selectedJourney)    → TraceDetailContent (existing)
  else if (selectedLogEntry) → EventDetailContent (Phase 2)
  else if (selectedNode)  → NodeDetailContent (existing)
  ```
  For now, render a placeholder `<div>Event: {selectedLogEntry.message}</div>` inside `InspectorPanel` so the wiring can be tested before Phase 2.
- Update `handleSelectNode` to also clear `log` (set `log: null` alongside existing `run: null`).
- Update `handleSelectTrace` to also clear `log` (set `log: null`).

### 1c. Change `onSelectLog` to set the log param

**File:** `ui/src/core/components/BottomLogPanel.tsx`

- Change the `onSelectLog` callback (lines 432-439). Instead of calling `onSelectTrace(executionId)` + `onSelectNode(entry.nodeId)`, it should now:
  - If the entry has a `seq`, call a new prop `onSelectLog(entry)` that sets `?log=<seq>` and clears `node` and `run`.
  - If no `seq`, fall back to existing behavior (select run).
- Add `onSelectLog: (entry: LogEntry) => void` to `BottomLogPanelProps` and pass it from FlowView.

**File:** `ui/src/core/components/FlowView.tsx`

- Create `handleSelectLog` callback:
  ```ts
  const handleSelectLog = useCallback((entry: LogEntry) => {
    if (entry.seq != null) {
      updateUrlState({ log: String(entry.seq), node: null, run: null }, { replace: true })
    } else {
      // fallback: open run
      const executionId = entry.runId ?? entry.traceId
      if (executionId) handleSelectTrace(executionId)
    }
  }, [updateUrlState, handleSelectTrace])
  ```
- Pass `onSelectLog={handleSelectLog}` to `BottomLogPanel`.

**File:** `ui/src/core/components/LogsView.tsx` (the non-graph flow logs view)

- Apply the same pattern: change `onSelectLog` in the `LogsTable` callback (lines 243-249) to call a new `onSelectLog` prop instead of `onSelectTrace` + `onSelectNode`.
- Add `onSelectLog: (entry: LogEntry) => void` to `LogsViewProps`.
- Wire from FlowView.

### 1d. Clear log on session reset

**File:** `ui/src/core/components/FlowView.tsx`

- In the `clearAll` callback (line 262), add `log: null` to the `updateUrlState` call.
- In the session key reset effect (line 256), add `log: null` to the `updateUrlState` call.

### Phase 1 tests

**File:** `ui/src/core/components/__tests__/BottomLogPanel.test.tsx`

- Add test: clicking a log row with a `seq` calls `onSelectLog` with the entry (not `onSelectTrace` + `onSelectNode`).

**File:** `ui/src/core/components/__tests__/LogsTable.test.tsx`

- Existing `onSelectLog` tests should still pass — the `LogsTable` component itself doesn't change, only its parent's handler.

**Verify:** `cd ui && npm test` — all tests pass.

---

## Phase 2: Build `EventDetailContent`

**What:** Create a lightweight component that shows one specific log event. Replace the Phase 1 placeholder.

### 2a. Create `EventDetailContent` component

**New file:** `ui/src/core/components/EventDetailContent.tsx`

Props:
```ts
interface EventDetailContentProps {
  entry: LogEntry
  nodeLabel?: string
  onOpenRun?: (traceId: string) => void
}
```

Content (top to bottom, single scrollable area, no tabs):
1. **Node + timestamp line:** Node label as a styled chip (reuse the same chip style from `LogsTable` — `var(--chip-{family}-bg)`), formatted timestamp via `formatEasternTime(entry.timestamp, { precise: true })`, and a `DurationBadge` if `entry.durationMs` exists.
2. **Error block (conditional):** Only render if `entry.level === 'error'` or `entry.attributes?.error_message` exists. Red-tinted card using the same style as the error cards in `TraceDetailContent` (lines 289-293):
   ```
   border border-[var(--status-error)] px-3 py-2 text-sm
   [background-color:color-mix(in_srgb,var(--status-error)_12%,transparent)]
   ```
   Content: `entry.attributes?.error_message` if it exists as a string, otherwise `entry.message`.
3. **Message:** If an error block was shown and the message differs from error_message, show the full `getLogDisplayMessage(entry)` as secondary text below. Otherwise, show `getLogDisplayMessage(entry)` as the primary message.
4. **Step info (conditional):** If `entry.stepName` or `entry.stepId` exists, show as muted text: `"Step: {stepName ?? stepId}"`.
5. **"See full run" link:** A text button styled as a link. Only show if `entry.runId ?? entry.traceId` exists. On click, call `onOpenRun(runId ?? traceId)`.
6. **Collapsible attributes:** A `<details>` element, closed by default, summary text "Attributes". Inside: `<pre>` with `JSON.stringify(entry.attributes ?? {}, null, 2)`. Same styling as the existing raw attributes in `NodeDetailPanel` Timing tab (line 487-489).

Keep it simple. No tabs. No cards grid. Target ~80-100 lines.

### 2b. Create `EventInspectorPresentation` helper

**New file:** `ui/src/core/components/EventInspectorPresentation.tsx`

Similar to `NodeInspectorPresentation.tsx` and `TraceInspectorPresentation.tsx`. Returns `{ title, description, headerContent }` for the `InspectorPanel` header.

```ts
export function getEventInspectorPresentation(
  entry: LogEntry,
  nodeLabel?: string,
): { title: string; description: string; headerContent: ReactNode } {
  return {
    title: nodeLabel ?? entry.nodeId ?? 'Event',
    description: formatEasternTime(entry.timestamp, { precise: true }),
    headerContent: null,  // keep header minimal — the content body handles everything
  }
}
```

### 2c. Wire into FlowView

**File:** `ui/src/core/components/FlowView.tsx`

Replace the Phase 1 placeholder with the real component:

```tsx
if (selectedLogEntry) {
  const nodeLabel = currentFlow.nodes.find(n => n.id === selectedLogEntry.nodeId)?.label
  const presentation = getEventInspectorPresentation(selectedLogEntry, nodeLabel)

  return (
    <AnimatePresence initial={false}>
      <InspectorPanel
        title={presentation.title}
        description={presentation.description}
        headerContent={presentation.headerContent}
        onClose={() => setSelectedLogSeq(undefined, { replace: true })}
      >
        <EventDetailContent
          entry={selectedLogEntry}
          nodeLabel={nodeLabel}
          onOpenRun={(traceId) => handleSelectTrace(traceId)}
        />
      </InspectorPanel>
    </AnimatePresence>
  )
}
```

### Phase 2 tests

**New file:** `ui/src/core/components/__tests__/EventDetailContent.test.tsx`

Tests:
1. Renders the log message text.
2. Shows error block with `error_message` attribute when entry is level=error and has `attributes.error_message`.
3. Shows "See full run" link when `runId` is present. Clicking it calls `onOpenRun`.
4. Hides "See full run" link when no `runId` or `traceId`.
5. Attributes section is collapsed by default (details element without `open`).
6. Shows `DurationBadge` when `durationMs` is present.

**Verify:** `cd ui && npm test` — all tests pass.

---

## Phase 3: Simplify `NodeDetailContent`

**What:** Add a "Latest failure" block to the node Overview, simplify the card grid, and replace the Timing tab with a Debug tab.

### 3a. Add "Latest failure" block to Overview

**File:** `ui/src/core/components/NodeDetailPanel.tsx`

In the Overview tab content (after the insights section, around line 383):

- The code already computes `latestErrorLog` (line 247). Extract the error message from it:
  ```ts
  const latestErrorMessage =
    (typeof latestErrorLog?.attributes?.error_message === 'string'
      ? latestErrorLog.attributes.error_message
      : undefined) ?? latestErrorLog?.message
  ```
- Render a "Latest failure" section **only when `latestErrorLog` exists**. Place it between the insights section and the "Recent Activity" section:
  ```
  LATEST FAILURE                                   {relative time}
  ──────────────────────────────────────────────────────────────────
  {latestErrorMessage}

  See full run →
  ```
  Styling: same red-tinted card as `TraceDetailContent` error cards. The "See full run" link calls a new optional prop `onOpenRun?: (traceId: string) => void` with `latestErrorLog.runId ?? latestErrorLog.traceId`.
- Add `onOpenRun?: (traceId: string) => void` to `NodeDetailContentProps`.

**File:** `ui/src/core/components/FlowView.tsx`

- Pass `onOpenRun={(traceId) => handleSelectTrace(traceId)}` to `NodeDetailContent`.

### 3b. Simplify the card grid

**File:** `ui/src/core/components/NodeDetailPanel.tsx`

- Replace the two-card grid ("Latest Run" + "Last Seen", lines 348-368) with a single inline status line. Instead of two `Card` components, render one line:
  ```tsx
  <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
    <span>{formatDurationText(latestSpan?.durationMs) ?? 'No runs yet'}</span>
    <span className="text-[var(--text-muted)]">{lastSeenLabel ?? ''}</span>
  </div>
  ```
  Keep the `showRuntimeCards` gate — only show this line for the same semantic roles.

### 3c. Simplify Recent Activity cards

**File:** `ui/src/core/components/NodeDetailPanel.tsx`

In the Recent Activity section (lines 400-423):
- Remove the `Badge` from each activity card (the one showing `entry.signal`).
- Keep: relative timestamp + message text. Optionally keep the run label when multiple runs are present.
- Cap the list at 5 entries: change `.slice(0, 50)` on line 264 to `.slice(0, 5)`.

### 3d. Replace Timing tab with Debug tab

**File:** `ui/src/core/components/NodeDetailPanel.tsx`

- Rename the `TabKey` type: change `'timing'` to `'debug'`.
- Rename the tab trigger (line 340): change label from `"Timing"` to `"Debug"`.
- Replace the Timing tab content (lines 428-493) with:
  1. **Latest telemetry attributes** — the existing `<details>` block with `JSON.stringify(latestAttributes)` (currently lines 485-489). Move it here as the first item, open by default if there's an error, closed otherwise.
  2. **Timing breakdown** — the existing span-per-trace view (currently lines 440-483). Wrap it in a `<details>` element, closed by default, summary: "Span timing".
- Remove the `showTimingTab` gate — show Debug tab for all node types (it's harmless when empty and useful for all roles).

### Phase 3 tests

**File:** `ui/src/core/components/__tests__/NodeDetailPanel.test.tsx`

Add tests:
1. Shows "Latest failure" block with error message when node has a recent error log with `attributes.error_message`.
2. Does not show "Latest failure" block when all logs are info level.
3. "See full run" link in the failure block calls `onOpenRun` with the error log's `runId`.
4. Recent activity is capped at 5 entries.

Update existing tests if needed — the card grid layout changed so any assertions about "Latest Run" or "Last Seen" card text need updating to match the new inline format.

**Verify:** `cd ui && npm test` — all tests pass.

---

## Phase 4: Clean up insights and remove dead code

**What:** Tighten the insights to only say things the user can't already see.

### 4a. Improve node insights

**File:** `ui/src/core/components/NodeDetailPanel.tsx`

In the `insights` computation (lines 271-329):
- When `latestSpan?.status === 'error'`: change the insight text from "The latest execution failed after {duration}" to include the actual error if available. For example: "Failed: {first 80 chars of error_message}". If no error_message available, keep the current text.
- Remove the slow-execution insight ("The latest execution was slow at {duration}") — this restates the duration badge. Only keep the failure insight and the "still active" insight.
- Keep the "No telemetry" and "N recent failures" insights as-is.

### 4b. Remove unused imports

After all changes, clean up any unused imports across modified files (`AlertTriangle`, `CheckCircle2`, etc. if no longer referenced).

### Phase 4 tests

**Verify:** `cd ui && npm test` — all tests pass. No new tests needed; existing insight tests should be updated if assertion text changed.

---

## Phase 5: Final integration test

Run the full test suite and lint:

```bash
cd ui && npm test && npm run lint
```

Fix any lint errors introduced by new files (unused variables, missing types, etc.).

Manually verify (if possible) by running `npm run dev` and:
1. Click a red error log row → Event drawer opens with error_message text visible.
2. Click "See full run" → Run drawer opens.
3. Click a node on canvas → Node drawer opens. If node has recent errors, "Latest failure" block is visible with the error text.
4. Click the Debug tab on a node → see raw attributes and collapsible span timing.

---

## Files changed summary

| File | Action |
|---|---|
| `ui/src/core/hooks/useUrlState.ts` | Add `log` param |
| `ui/src/core/components/FlowView.tsx` | Wire selectedLogEntry, add handleSelectLog, update cascade |
| `ui/src/core/components/BottomLogPanel.tsx` | Add onSelectLog prop, change log click handler |
| `ui/src/core/components/LogsView.tsx` | Add onSelectLog prop, change log click handler |
| `ui/src/core/components/EventDetailContent.tsx` | **New** — event drawer content |
| `ui/src/core/components/EventInspectorPresentation.tsx` | **New** — event drawer header |
| `ui/src/core/components/NodeDetailPanel.tsx` | Add failure block, simplify cards, replace Timing with Debug |
| `ui/src/core/components/__tests__/EventDetailContent.test.tsx` | **New** — event drawer tests |
| `ui/src/core/components/__tests__/NodeDetailPanel.test.tsx` | Add failure block tests, update existing |
| `ui/src/core/components/__tests__/BottomLogPanel.test.tsx` | Add onSelectLog test |

## Open questions

1. **Seq uniqueness:** The plan uses `entry.seq` as the log URL param. If `seq` is not globally unique across the session (e.g., reset on reconnect), the lookup could match the wrong entry. Verify that `seq` is monotonically increasing and unique within a session. If not, consider using `${entry.seq}-${entry.timestamp}` as the key.

2. **Non-graph flows:** `LogsView.tsx` is used for flows without a canvas. The same `onSelectLog` pattern applies, but there's no canvas sidebar — the `InspectorPanel` would need to render somewhere. Confirm that the InspectorPanel renders correctly in the non-graph layout (it currently doesn't render at all for non-graph flows since lines 454-474 have no sidebar). This may need a follow-up to add the sidebar to the non-graph layout.

3. **"See full run" in Event drawer when no journey exists:** If the clicked log belongs to a run that hasn't been assembled into a `TraceJourney` yet (e.g., too recent or not enough events), clicking "See full run" would set `?run=<traceId>` but find no journey, so nothing would render. Consider showing a "Run not yet available" state in `TraceDetailContent`, or hiding the link when the journey doesn't exist.
