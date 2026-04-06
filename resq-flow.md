# resq-flow Notes

Quick local doc map:

- `README.md`
- `ARCHITECTURE.md`
- `docs/shared-flow-event-contract.md`
- `docs/adding-a-flow.md`
- `docs/cli.md`

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

For manual CLI-emitted logs, scope stays explicit:

- `logs emit --flow <id>` emits `type: "log"` with `attributes.flow_id = <id>`
- `logs emit --global` emits an unscoped `type: "log"` with no flow assignment
- unscoped logs do not appear in any flow UI

## WebSocket Model

The live WebSocket protocol uses envelopes:

- `snapshot`
- `batch`

This keeps reconnect behavior predictable and avoids replay-style lag in live mode.

The client ingests those envelopes append-only, keeps a bounded buffer, and ignores duplicate snapshot events on reconnect by sequence number.

## CLI

The CLI is the headless `resq-flow` surface for relay status checks plus `logs list`, `logs tail`, `logs emit`, and `runs explain`.
It lives in `cli/` and uses the same relay APIs and WebSocket envelopes as the UI.
Use it when you want quick terminal inspection, agent-friendly JSON/JSONL output, or ad hoc local logs without opening the browser.
See `README.md` and `docs/cli.md` for build steps, command examples, and supported arguments.

The CLI scope model is explicit and should stay explicit:

- `logs list` and `logs tail` require exactly one of `--flow <id>` or `--all`
- `logs emit` requires exactly one of `--flow <id>` or `--global`
- neither the CLI nor the UI should silently treat unscoped logs as belonging to a requested flow

## Vector Contract

The applied runtime config lives in the `fullstack` repo at:

- `observability/vector/vector.yaml`

The example snippet lives in:

- `examples/vector/resq-flow-fanout.yaml`

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

## Smoke Checks

`resq-flow` now includes two simple OTLP smoke commands:

- `make smoke-vector-fanout`
- `make smoke-relay-ingest`

`make smoke-vector-fanout` sends a protobuf OTLP log to Vector on `:4318` and waits for the relay ingest counters to move.

`make smoke-relay-ingest` sends the same shape directly to the relay and waits for relay ingest counters to move.

These are meant to be operational checks, not replacements for real producer traffic.

## Adding A New Flow

See `docs/adding-a-flow.md` for the current contributor checklist and the split between `resq-agent` and `resq-flow`.

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
