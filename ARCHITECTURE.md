# Obsv Architecture

## One True Topology

`resq-flow` is a consumer of the shared local observability stack, not a parallel pipeline.

```text
producer(s) -> Vector -> VictoriaLogs
                     -> VictoriaTraces
                     -> VictoriaMetrics
                     -> resq-flow relay -> WebSocket -> UI
```

The core architectural rule is simple:

- producers emit OTLP to `Vector`
- `Vector` fans out
- `Victoria` remains primary storage/query
- `resq-flow` stays focused on live visualization and flow-oriented history/detail views

## Ownership

- `resq-flow` owns the relay, UI, normalized flow model, tests, and example fanout snippet
- `fullstack` owns the applied local Vector runtime config
- producers such as `resq-agent` send telemetry to Vector, not directly to `resq-flow`, in the normal path

## Responsibilities By Layer

### Vector

Vector is the collector/router.

Its job for `resq-flow` is intentionally limited:

- accept OTLP once
- keep Victoria sinks as the primary path
- apply coarse, cheap pre-filtering for the `resq-flow` fanout
- forward only traces/logs to `resq-flow`
- keep the `resq-flow` sink best-effort so relay issues do not endanger Victoria

### Relay

The relay is the contract-aware live consumer.

It:

- receives OTLP traces/logs
- normalizes them into `FlowEvent`
- loads flow contracts from `ui/src/flow-contracts`
- applies exact contract matching plus context retention
- tags kept events with `matched_flow_ids`
- stores a recent in-memory buffer for reconnect snapshots
- publishes WebSocket `snapshot` and `batch` envelopes
- uses the same contract-driven flow filtering for history fetches

### UI

The UI is the presentation layer.

It:

- consumes relay WebSocket envelopes in append-only batches
- uses `matched_flow_ids` instead of re-implementing coarse flow matching
- keeps live mode separate from paced history playback
- supports both graph-backed flows and headless flows

## The Two-Layer Flow Model

Each flow is split into two concerns.

### 1. Shared JSON contract

Location:

- `ui/src/flow-contracts/<flow-id>.json`

This is the shared boundary used by both relay and UI registry. It defines:

- flow identity
- telemetry matching rules
- context retention rules

Example responsibilities:

- `log_events`
- queue/function/worker/stage/span prefixes
- keep parent/root/error/unmapped context for kept traces

### 2. Optional TypeScript view config

Location:

- `ui/src/flows/<flow-id>.ts`

This is only for rich UI concerns:

- graph nodes and edges
- span-to-node mapping
- view-specific presentation

If the TypeScript view config is absent, the flow still exists as a headless flow. That keeps the normalized flow model reusable for logs, traces, reports, and future non-graph views.

## Filtering Model

Filtering happens in layers.

### Vector filtering

Vector performs coarse pre-filtering only.

For v1:

- metrics do not fan out to `resq-flow`
- logs fan out only when they contain the explicit mail event contract such as `mail_e2e_event`
- traces fan out only when they contain clear mail-oriented markers
- exact diagram-node or exact flow membership logic does not belong here

### Relay filtering

The relay performs exact flow-aware filtering.

It:

- evaluates all loaded flow contracts
- retains useful error/root/parent/unmapped context as allowed by the contract
- annotates each kept event with `matched_flow_ids`

That gives the UI one canonical selection mechanism for both live and history data.

## Live And History Paths

### Live path

```text
Vector -> relay ingest -> contract match -> matched_flow_ids -> WS snapshot/batch -> UI
```

Design goals:

- low-latency live updates
- bounded buffering
- reconnect snapshots without replay-style lag
- append-only client ingestion

### History path

```text
UI -> relay history API -> Victoria queries -> normalized events -> contract filter -> UI
```

History keeps the same flow semantics as live mode:

- `flow_id` is passed to the relay
- the relay applies the same contract model used for live ingest
- UI history views reuse the same normalized event/journey model

## Source-Agnostic Core

The current live path is Vector-backed by design, but the normalized model should stay source-agnostic enough that future adapters can feed history/detail experiences without a redesign.

That means:

- React Flow remains the first view, not the only view
- headless flows remain first-class
- future adapters like Datadog-backed history or imported traces/logs should be able to target the same normalized journey/detail layer

## Operational Rule Of Thumb

If telemetry is emitted once, routed cleanly, stored in Victoria, and then visualized in `resq-flow`, the architecture is doing the right thing.

## Related repo docs

For contributor-facing details that build on this architecture, see:

- `resq-flow.md`
- `docs/shared-flow-event-contract.md`
- `docs/adding-a-flow.md`
- `docs/cli.md`
