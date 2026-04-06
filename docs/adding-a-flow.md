# Adding a flow

When someone adds a new flow, the job is split across two repos:

- `resq-agent` owns the runtime truth, queue and worker boundaries, and emitted telemetry
- `resq-flow` owns contract matching, graph presentation, replay fixtures, and flow-specific tests

The mail pipeline is the current best reference implementation.

## Start with the spec, not the graph

The preferred workflow is:

1. validate the real code path
2. classify first-class nodes, visible detail, and hidden detail
3. write the flow spec
4. update `resq-agent`
5. update `resq-flow`

For agent-assisted work, the local skill split is:

- `flow-cli-create`
  scaffold a brand-new flow
- `flow-cli-write`
  add or change logs on an existing flow
- `flow-cli-read`
  validate the result in `resq-flow`

If the spec is vague, the implementation will drift.

## What gets added on the resq-agent side

`resq-agent` is where the flow becomes real.

That means queue boundaries, worker boundaries, and emitted telemetry have to exist before `resq-flow` can render anything honestly.

### Standard producer-side file shape

Current standard:

- `definition.rs`
- `node_context.rs`
- `schema.rs`
- `tracing_emit.rs`
- optional `touchpoints.rs`

What that means:

- `definition.rs`
  flow identity, node catalog, resolver helpers, run binding
- `node_context.rs`
  what a bound node can emit
- `schema.rs`
  stable action and step vocabulary plus detail structs
- `tracing_emit.rs`
  how records actually hit tracing / flow logs
- `touchpoints.rs`
  optional durable-write helpers for flows that need them

### Runtime checklist

On the `resq-agent` side, you usually need:

- queue names
- function names
- worker names
- handler registration
- shared flow identity fields
- node logs for the main flow backbone
- step logs where attached detail is worth surfacing

The graph should not invent boundaries that the runtime does not actually own.

## What gets added on the resq-flow side

`resq-flow` has two layers today:

- one shared JSON contract
- one optional TypeScript flow view

### Required implementation touchpoints

```text
ui/src/flow-contracts/<flow-id>.json
ui/src/flows/<flow-id>.ts
ui/src/flows/index.ts
ui/src/test/fixtures/<flow-id>-replay.json
relay/tests/*.rs
ui/src/core/**/__tests__/*.test.ts*
```

### What each layer is doing

- `ui/src/flow-contracts/<flow-id>.json`
  stable flow ID, telemetry match rules, and context retention
- `ui/src/flows/<flow-id>.ts`
  optional graph nodes, edges, span mapping, and layout details
- `ui/src/flows/index.ts`
  flow registration
- replay fixture
  realistic event stream for UI and relay tests
- relay tests
  verify matching, retention, and publish behavior
- UI tests
  verify mapping, animation, and view behavior

## Minimal checklist for a new flow

1. Write the flow telemetry spec.
2. Make the runtime boundaries real in `resq-agent`.
3. Add the `resq-flow` contract JSON.
4. Add a TS flow view if the flow needs a graph now.
5. Add a replay fixture.
6. Add one relay test.
7. Add one UI test.

## Naming and model reminders

- `component_id` is the first-class node identity
- `step_id` is attached detail under that node

In simpler terms:

- node logs define the main flow structure
- step logs are attached to nodes and show what happened around that node's work
