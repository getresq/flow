# resq-flow Notes

## Current Design

`resq-flow` is a local live flow visualizer that sits behind the shared Vector pipeline.

The intended local path is:

```text
producer -> Vector -> Victoria + resq-flow
```

Not:

```text
producer -> resq-flow directly
```

Direct-to-relay mode still exists as a debugging fallback, but it is not the default architecture.

## Why The Architecture Is Split

We want one telemetry pipeline and one storage/query source of truth.

That means:

- producers emit once to Vector
- Vector keeps Victoria working exactly as before
- `resq-flow` consumes a filtered live copy
- `resq-flow` does not become a second observability database

## Flow Authoring Model

Every flow is defined in two layers.

### Shared JSON contract

Location:

- `ui/src/flow-contracts/<flow-id>.json`

This contract is shared by the relay and UI registry.

It contains:

- stable flow identity
- telemetry matching rules
- context retention policy

Example:

```json
{
  "version": 1,
  "id": "mail-pipeline",
  "name": "Mail Pipeline",
  "telemetry": {
    "log_events": ["mail_e2e_event"],
    "queue_prefixes": ["rrq:queue:mail-"],
    "function_prefixes": ["handle_mail_"],
    "worker_prefixes": ["mail_"],
    "stage_prefixes": ["incoming.", "analyze.", "extract.", "send."],
    "span_prefixes": ["handle_mail_"],
    "span_names": ["insert_reply_draft"]
  },
  "keep_context": {
    "parent_spans": true,
    "root_spans": true,
    "error_events": true,
    "unmapped_events_for_kept_traces": true
  }
}
```

### Optional TypeScript view config

Location:

- `ui/src/flows/<flow-id>.ts`

This is where graph-specific UI lives:

- nodes
- edges
- span mapping
- layout and presentation details

If no TypeScript view exists, the flow still registers as a headless flow. That keeps history, logs, detail panels, and future report/table views available without forcing every flow to ship a graph on day one.

## Relay/UI Contract

The relay normalizes telemetry into `FlowEvent` values and tags kept events with:

```json
{
  "matched_flow_ids": ["mail-pipeline"]
}
```

This is the canonical flow-selection boundary.

The UI should not re-implement coarse flow matching in multiple places. Instead:

- live mode filters by `matched_flow_ids`
- history mode passes `flow_id` to the relay
- the relay applies the same contract model for both paths

## WebSocket Model

The live WebSocket protocol uses envelopes:

- `snapshot`
- `batch`

This keeps reconnect behavior predictable and avoids replay-style lag in live mode.

The client ingests those envelopes append-only, keeps a bounded buffer, and ignores duplicate snapshot events on reconnect by sequence number.

## Vector Contract

The applied runtime config lives in:

- `/Users/jeremyrojas/worktrees/fullstack/gmail-oauth-unified-handoff-fullstack/observability/vector/vector.yaml`

The example snippet lives in:

- `/Users/jeremyrojas/worktrees/resq-flow/examples/vector/resq-flow-fanout.yaml`

For v1, Vector filtering should stay coarse:

- do not fan out metrics
- fan out logs only for explicit flow event contracts like `mail_e2e_event`
- fan out traces only when a batch contains stable mail markers
- avoid encoding exact graph membership into Vector

The relay owns exact matching and context retention.

## Best-Effort Fanout

The `resq-flow` sinks in Vector should be intentionally low-risk:

- health checks disabled
- retries disabled
- memory buffer only
- `drop_newest` when full

That keeps Victoria as the primary path even if the relay is unavailable.

## Adding A New Flow

1. Add `ui/src/flow-contracts/<flow-id>.json`.
2. Add an optional `ui/src/flows/<flow-id>.ts` if the flow needs a graph view now.
3. Add a replay fixture for the flow.
4. Add one relay match/filter test for the flow.
5. Add one UI log/journey test for the flow.
6. If the flow has a graph view, add one basic mapping/render test for that view.

## Non-Goals

- `resq-flow` is not the storage layer.
- Vector is not where exact flow/diagram logic belongs.
- React Flow is the first rich view, not the only future view.
