# Trace Improvements Plan (resq-flow + resq-agent)

## Goal

Make mail pipeline traces easy to understand for humans:

- "Where is this email/thread right now?"
- "What happened before it failed/stopped?"
- "Which node/queue is the bottleneck?"

This doc records:

1. Current telemetry audit in `resq-agent`
2. Gaps blocking truly great trace UX in `resq-flow`
3. Refined plan for deterministic, digestible trace journey UI
4. Recommended instrumentation sections (what to trace first)

---

## 1) Current Telemetry Audit (`resq-agent`)

Repo audited:

- `/Users/jeremyrojas/worktrees/resq-agent/ai-email-batch-extraction-phase-1`

### What is already good

1. OTLP traces + OTLP logs are wired for local docker flows.
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` and `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` are present in docker-compose env wiring.

2. Structured `mail_e2e_event` logs exist and are useful.
- `crates/resq-mail/src/util/mail_e2e_event.rs` emits:
  - `event=mail_e2e_event`
  - `action` (`enqueue`, `worker_pickup`, `worker_result`, `threads_written`, `metadata_written`, `cursor_updated`)
  - `queue_name`, `function_name`, `worker_name`
  - `job_id`, `request_id`, `attempt`, `queue_wait_ms`, `duration_ms`
  - `provider`, `mailbox_owner`
  - `outcome`, `error_type`, `error_message`

3. Enqueue/pickup/result events are emitted at the right places.
- Enqueue logging via `RrqQueueClient` in `crates/resq-mail/src/queue/mod.rs`
- Worker pickup/result via `crates/resq-mail/src/bin/resq-mail-runner.rs`
- Domain events:
  - threads written
  - metadata written
  - cursor updated
  in `incoming.rs`, `backfill.rs`, `cron_tick.rs`

4. Job payloads already include strong domain keys.
- `thread_id`, `s3_key`, `content_hash`, `reply_draft_id`, `mailbox_owner`, `provider`
- source: `crates/resq-mail/src/queue/jobs.rs`

### Important gaps (high impact)

1. `MAIL_E2E_EVENT_LOGS` is opt-in.
- If not set to `1`, relay gets fewer useful logs.

2. `resq-flow` relay currently only ingests OTLP logs where `event == mail_e2e_event`.
- Many useful `tracing::info!/warn!` records in analyze/send paths are excluded.

3. Potential trace continuity gap across queue boundaries in `resq-mail`.
- `agent-runtime` has robust trace context propagation (`EnqueueOptions.trace_context`, W3C headers), but `resq-mail` queue client directly uses `rrq_producer::EnqueueOptions::default()` and does not explicitly attach trace context.
- Consequence risk: one email journey may appear as multiple separate traces instead of one connected trace tree.

4. Some high-value IDs are not emitted in `mail_e2e_event` fields today.
- Example candidates to add: `thread_id`, `reply_draft_id`, `s3_key`, `content_hash`.
- These IDs exist in job payloads, but are not consistently present in the `mail_e2e_event` schema.

5. Stage semantics are implicit.
- We infer stage from `action + function_name + queue_name`, but there is no first-class `stage_id` emitted from workers.

---

## 2) What This Means for "One Email End-to-End"

Today, with current setup, you can usually see significant flow activity, but:

- You may not get a single clean, continuous trace from start to finish for one email/thread.
- Some useful events are visible only as logs, not as trace stages.
- Node-level traces in UI can feel repetitive/fragmented because we don't yet present a "trace journey" abstraction.

So: good foundation, not yet "top notch trace storytelling."

---

## 3) Refined Implementation Plan (resq-flow)

## 3.1 Trace Journey model (new)

Create a domain-shaped model in UI:

- `TraceJourney`
  - `traceId`
  - `rootEntity` (thread/mailbox/draft when available)
  - `startedAt`, `endedAt`, `durationMs`
  - `status` (`running|success|error|partial`)
  - `stages: TraceStage[]`
  - `nodePath: string[]`
  - `errorSummary`

- `TraceStage`
  - `stageId` (normalized, deterministic key)
  - `label`
  - `nodeId`
  - `startSeq`, `endSeq`
  - `startTs`, `endTs`, `durationMs`
  - `status`
  - `attempt`
  - `attrs` (minimal + raw reference)

Build from:

- canonical relay events (`seq`, `event_kind`, `node_key`, `queue_delta`)
- spans (`trace_id`, `span_id`, `parent_span_id`)
- `mail_e2e_event` logs for queue + outcome signals

## 3.2 New bottom "Traces" tab

In/near `BottomLogPanel`:

- Add tabs: `Logs | Traces`
- Traces table columns:
  - Trace
  - Entity (thread/mailbox/draft)
  - Current stage
  - Status
  - Duration
  - Last update
  - Error

Interactions:

- Click trace row:
  - filter canvas to that trace path
  - filter logs to that trace
  - open details drawer to trace timeline

## 3.3 Trace Details drawer (right panel)

Add trace-focused drawer view:

- Tab 1: `Timeline` (human-readable stage list, durations, attempts, errors)
- Tab 2: `Attributes` (raw telemetry for deep debugging)
- Chips when present:
  - `mailbox_owner`
  - `provider`
  - `thread_id`
  - `reply_draft_id`
  - `job_id`
  - `request_id`
  - `content_hash`

## 3.4 Determinism rules

1. Always order by `seq` first, timestamp second.
2. Stage transitions should use explicit event kind + known mappings.
3. Avoid time-window heuristics for stage ordering.
4. Keep queue depth visual independent from trace journey status.

## 3.5 Mapping upgrades needed in `resq-flow`

Extend mapping candidate keys beyond current set:

- `rrq.function`
- `rrq.queue`
- `messaging.destination.name`
- `messaging.operation`

This helps real RRQ spans map cleanly even when `function_name`/`queue_name` are absent.

---

## 4) `resq-agent` Changes (Single Source of Truth)

No code changes were applied in this task. This is the implementation list for `resq-agent`.

Repository for all changes in this section:

1. `/Users/jeremyrojas/worktrees/resq-agent/ai-email-batch-extraction-phase-1`

### 4.1 Visibility rules (important)

1. `MAIL_E2E_EVENT_LOGS=1` controls only structured `mail_e2e_event` logs.
2. It does not control OTLP trace span emission (traces still emit when OTLP traces are configured).
3. For events to appear in both `resq-flow` and Victoria UIs, telemetry must be fanned out to both sinks:
   - `resq-flow relay` (`http://localhost:4200/v1/logs` and `/v1/traces`)
   - `Victoria ingest path` (via Vector/Collector at `:4318` to VictoriaLogs/VictoriaTraces)

### 4.2 Required changes (P0)

1. Queue trace continuity across mail workers.
- Update `resq-mail` enqueue paths to propagate current trace context on every queue hop.
- Target: one email/thread journey remains connected across enqueue -> pickup -> worker spans.

2. Expand `mail_e2e_event` schema with entity IDs.
- Add fields when available:
  - `thread_id`
  - `reply_draft_id`
  - `s3_key`
  - `content_hash`
- Keep existing fields (`queue_name`, `function_name`, `worker_name`, `job_id`, `request_id`, etc.).

3. Emit explicit stage tags.
- Add `stage_id` and `stage_name` to key events/spans.
- Initial stage set:
  - `incoming.write_threads`
  - `incoming.write_metadata`
  - `incoming.cursor_update`
  - `analyze.decision`
  - `analyze.draft_insert`
  - `analyze.autosend_enqueue`
  - `extract.upsert_contacts`
  - `send.precheck`
  - `send.provider_call`
  - `send.finalize`

4. Dev ergonomics for mail debugging.
- Make `MAIL_E2E_EVENT_LOGS=1` default for `make dev-mail` (while keeping env override support).
- Keep gate available for non-mail/low-noise environments.

### 4.3 High-value follow-ups (P1)

1. Standardize error payload fields.
- Add `error_class`, `error_code`, `retryable` to failure outcomes where possible.

2. Promote high-value non-`mail_e2e_event` logs into structured flow events.
- Either emit them as `mail_e2e_event` or add a compatible structured event contract.

### 4.4 Nice-to-have (P2)

1. Add a stable journey key.
- `journey_key` example: `provider/mailbox_owner/thread_id`
- Useful when one logical journey spans multiple traces.

### 4.5 Contract tests required with these changes

1. Enqueue propagation test: enqueue includes W3C trace context headers.
2. Queue-hop continuity test: downstream worker span links to upstream trace.
3. Event schema test: new IDs and stage tags appear in emitted `mail_e2e_event` logs.
4. Local smoke test: single email can be queried in both Victoria and `resq-flow` with matching identifiers.

---

## 5) Best Sections to Trace (Staff-level recommendation)

If we want maximum value quickly, prioritize these sections:

## Section A: Incoming fan-out (highest ROI)

`handle_mail_cron_tick` + `handle_mail_incoming_check`

Why:

- This is where mailbox-level activity becomes thread-level fan-out.
- Most "why didn’t downstream happen?" questions start here.

Must capture:

- mailbox selection reason/count
- cursor baseline/update
- threads written + metadata writes
- enqueue counts to analyze/extract

## Section B: Analyze decision path (highest product impact)

`handle_mail_analyze_reply`

Why:

- This drives "skip vs needs_review vs draft/autosend".
- Most user-facing quality/debugging questions land here.

Must capture:

- decision action + reason
- confidence
- inserted draft yes/no
- autosend enqueue success/failure
- `thread_id`, `reply_draft_id`

## Section C: Extract path (data quality + enrichment)

`handle_mail_extract`

Why:

- Critical for contact extraction and downstream opportunity logic.

Must capture:

- extract start/end
- contacts upsert success/failure
- count of contacts found/upserted
- durable write outcome

## Section D: Send path (business outcome)

`handle_mail_send_reply`

Why:

- Final state users care about: sent / failed / stale.

Must capture:

- pre-send validation outcomes
- provider API send outcome
- retryable vs terminal
- final status transition
- `reply_draft_id`, `thread_id`

## Section E: Backfill (operational health)

`handle_mail_backfill_start` + `handle_mail_backfill_chunk`

Why:

- Less user-facing per-message, but key for throughput and recovery/debug.

Must capture:

- chunk size, scanned/stored counts
- cursor/page token movement
- extract fan-out enqueue counts

---

## 6) Autonomous Execution Runbook (Strict Sequence)

Execution rule:

1. Follow steps `1 -> 8` in order.
2. Do not start a step until the previous step exit criteria pass.
3. If any step fails, fix that step before continuing.

### Step 1: Preconditions

Do:

1. Confirm local observability services are healthy (`Vector`, `VictoriaLogs`, `VictoriaTraces`).
2. Confirm telemetry fan-out path exists to both sinks:
   - Victoria ingest path (`:4318`)
   - `resq-flow` relay (`:4200/v1/logs`, `:4200/v1/traces`)
3. Confirm mail runtime can run one controlled email scenario.

Exit criteria:

1. A test OTLP trace + OTLP log is visible in both Victoria UI and relay-backed `resq-flow`.

### Step 2: Implement `resq-agent` P0 Contract (First)

Do:

1. Implement all items in `4.2 Required changes (P0)`:
   - queue trace continuity across enqueue/pickup hops
   - expanded `mail_e2e_event` IDs
   - explicit `stage_id` / `stage_name`
   - `make dev-mail` ergonomics for `MAIL_E2E_EVENT_LOGS`
2. Keep schema changes additive/backward-compatible.

Exit criteria:

1. Code compiles and local dev flow starts cleanly.
2. P0 fields are emitted in structured events.

### Step 3: Validate `resq-agent` with Tests

Do:

1. Run `resq-agent` unit tests for telemetry mapping/helpers.
2. Run `resq-agent` integration tests for queue propagation and schema contract (`4.5` items 1-3).
3. Capture proof artifacts (test names + pass status) for handoff.

Exit criteria:

1. All targeted `resq-agent` telemetry tests pass.
2. Queue-hop trace continuity is verified by tests.

### Step 4: Cross-Tool Telemetry Validation (Pre-UI)

Do:

1. Run one-email end-to-end smoke flow.
2. Verify the same journey is queryable in:
   - VictoriaLogs
   - VictoriaTraces
   - `resq-flow` live stream
3. Verify identifier consistency (`thread_id`, `job_id`, `reply_draft_id` when present).
4. Save one canonical trace/log query example for regression reruns.

Exit criteria:

1. One journey is followable across incoming -> analyze/extract -> send in all sinks.
2. Identifiers match between `resq-agent` events, Victoria, and `resq-flow`.

### Step 5: Implement `resq-flow` V1

Do:

1. Implement `3.1` through `3.5`:
   - Trace Journey model
   - `Logs | Traces` panel
   - Trace details drawer timeline
   - deterministic ordering rules
   - mapping key upgrades
2. Add/extend tests for journey derivation and trace filtering.

Exit criteria:

1. Selecting a trace isolates canvas path + logs for that trace.
2. Timeline ordering is deterministic across replays.
3. Relay/UI test suite passes.

### Step 6: Bind New Contract Fields in UI

Do:

1. Wire new stage tags and IDs from `resq-agent` into stage rows/chips.
2. Improve error cards using standardized fields (`error_class`, `error_code`, `retryable`).

Exit criteria:

1. Operator can identify failing stage + key IDs in one view, without opening raw JSON.

### Step 7: Optional P1/P2 Hardening

Do:

1. Implement follow-ups from `4.3` and `4.4`.
2. Add high-throughput UX polish (trace pin/follow, stuck-trace surfacing).

Exit criteria:

1. Trace UX remains understandable under burst load.
2. No deterministic ordering regressions are introduced.

### Step 8: Final Human Live E2E Smoke (Last Step)

Do:

1. Run one controlled real-email flow in live-like local env.
2. Confirm end-to-end readability in `resq-flow` (trace, timeline, logs, highlights).
3. Confirm same journey is queryable in VictoriaLogs + VictoriaTraces.
4. Record pass/fail with trace/log links.

Exit criteria:

1. Human operator confirms one email is easy to follow from incoming to final state.
2. No blocking telemetry or UX gaps remain for live usage.

---

## 7) Acceptance Criteria

For a single sent email, an operator should be able to:

1. Search/select one trace or journey and see only relevant nodes/edges.
2. See clear stage progression from incoming -> analyze/extract -> send.
3. Identify exact failing stage + error summary in under 10 seconds.
4. Confirm key IDs (thread/draft/mailbox) without opening raw VMUI JSON.
5. Replay events deterministically with identical stage ordering each run.

---

## 8) Practical Notes for Local Validation

1. Ensure `MAIL_E2E_EVENT_LOGS=1` before running local mail flows.
2. Ensure OTLP logs + traces endpoints are set to local collector (`:4318`).
3. Validate with one controlled email thread first, then with burst traffic.

---

## 9) KISS Testing Strategy (Unit + Integration + Live E2E)

Goal: smallest reliable set of tests that gives high confidence live flow will work.

### 9.1 Unit tests (fast)

1. `resq-agent`: stage mapping and emitted field shaping (`stage_id`, IDs, outcome flags).
2. `resq-flow`: trace journey derivation from relay events (`seq` ordering and stage status resolution).
3. `resq-flow`: deterministic edge/node highlight reducer logic.

Pass rule:

1. All unit tests pass in local CI loop.

### 9.2 Integration tests (contract)

1. Queue enqueue includes trace context headers.
2. Worker pickup span continues the same trace.
3. `mail_e2e_event` schema contains required IDs/stage tags when present.
4. Relay ingest maps spans/logs to expected node keys.

Pass rule:

1. All contract tests pass with stable snapshots/fixtures.

### 9.3 Live E2E smoke test (single email, final human step)

1. Start local stack (`resq-agent`, relay, Vector, Victoria).
2. Send one controlled test email through mail pipeline.
3. Verify in `resq-flow`:
   - one journey visible in Traces tab
   - timeline shows incoming -> analyze/extract -> send progression
   - log filtering by selected trace works
4. Verify in Victoria UIs:
   - trace is queryable in VictoriaTraces
   - matching logs queryable in VictoriaLogs
5. Verify IDs match across all views (`trace_id`, `job_id`, and `thread_id` when present).

Pass rule:

1. All five checks pass without manual data patching.

### 9.4 Release gate (simple)

Ship only when all are true:

1. Unit suite green.
2. Integration suite green.
3. Live single-email E2E smoke green.
4. Acceptance criteria in Section 7 satisfied.
