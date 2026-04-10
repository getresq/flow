# Runs Spec

This document defines what a `Run` means in `resq-flow` at the product level.

The goal is to keep the model:

- generic across flows
- calm by default
- coherent across canvas, logs, metrics, history, and run detail

## Purpose

`Runs` present the execution stories of a flow.

The default `Runs` surface should answer:

- what units of work happened
- which ones succeeded, failed, or exited early
- where each one stopped
- what path each one took through the flow

`Runs` should not be a second copy of the full activity stream.

## Core Model

### Flow-visible event

A flow-visible event is telemetry that belongs to a flow.

Flow visibility comes from the relay's contract-based matching:

- explicit `flow_id`
- or relay-assigned `matched_flow_ids`

If an event is flow-visible, it may appear in broad product surfaces such as:

- canvas
- logs
- node detail
- history

### Run

A `Run` is one coherent execution story for a concrete unit of work.

A run:

- has a stable producer-owned execution identity
- contains an ordered sequence of steps
- may complete fully or terminate early
- ends with an outcome or is still in progress

The canonical run identity is `run_id`.

`trace_id` may still be used as a compatibility fallback in implementation where
legacy producer data has no `run_id`, but that is not the north-star product
definition.

The north-star rule is:

- producer-declared `run_id` is the curation boundary for the `Runs` surface

### Step

A `Step` is one ordered stage within a run.

Steps are what users inspect when they open a run.

The run detail view should show the steps that actually happened, in order,
including partial paths.

### Trace

A `Trace` is a telemetry implementation detail.

A trace may back a run, help explain a run, or contribute technical context for
debugging, but a trace is not the product definition of a run.

## Visibility vs Prominence

This is the key product principle:

- visibility answers: should this be available somewhere in the flow experience?
- prominence answers: should this become a top-level row in `Runs`?

Those are different decisions.

The relay's contract-based filter determines visibility.

The producer's `run_id` determines run prominence.

That means:

- all flow-visible telemetry can still be visible
- not all flow-visible telemetry should become a run

This keeps the product calm without hiding important reality.

## Relationship Between Runs and Flow Units

Each flow has a natural unit of work:

- one document
- one request
- one job
- one conversation
- one sync operation
- one task execution

The `Runs` list for that flow is a list of those units of work, not a list of
all ambient flow activity.

## Product Principles

### The relay defines flow membership

If telemetry passes the relay's contract-based filtering and reaches the UI, it
earned its place in the flow experience.

The relay decides what belongs to the flow.

### The producer defines run identity

The producer is the only layer that actually knows when real work begins.

So:

- the producer decides when `run_id` exists
- the UI should not guess execution identity with domain-specific heuristics

### Runs show stories

The `Runs` list is a product surface, not a raw telemetry dump.

It shows execution stories for concrete units of work.

### Broad surfaces stay broad

Canvas, logs, node detail, and history can still show flow-visible events that
do not belong to a top-level run.

Examples may include:

- scheduler activity
- polling
- heartbeat-style checks
- queue maintenance
- discovery before concrete work exists

### Partial paths still count

A run does not need to reach the end of the flow.

If work started and then exited early, it is still a valid run if it has a
`run_id` and an observable outcome or stop point.

### Avoid classification soup

Do not introduce extra taxonomy fields such as:

- `is_background`
- `is_primary`
- `show_in_runs`

The split between flow visibility and producer-owned `run_id` should be enough
for the product model.

## Filtering Within Runs

When users want to narrow the runs list, use generic filters that work across
all flows without domain vocabulary:

- status (error, success, running)
- duration range
- step count
- time window

These filters apply to runs that already exist.

They are not a replacement for producer-owned run identity.

## Run Identity

The product model expects a stable `run_id`.

Implementation may still fall back to `trace_id` for legacy flows while
adopting this model, but new and upgraded flows should treat `run_id` as the
real execution identity.

By default, flows should prefer a simple opaque run ID minted once when real
work begins and then carried through the lifecycle.

Deterministic run IDs are optional and should be used only when a flow has a
real need for recomputable or snapshot-based identity semantics.

Once a run ID format is adopted for a flow, it should remain stable over time.
If the minting algorithm changes later, old IDs remain valid historically and
new IDs apply only going forward.

## Run Labels

The human-readable label for a run should come from the flow contract, not from
hardcoded per-flow logic in shared UI code.

Each flow contract should declare which attributes form the run label. Example:

```json
{
  "run_label": {
    "keys": ["thread_subject", "mailbox_owner", "thread_id"]
  }
}
```

The UI reads the declared keys from the contract and formats the label
generically.

Flow-specific identifier waterfalls should not exist in shared presentation
code.

## Telemetry Requirements Per Flow

To support this model cleanly, each flow should provide:

- a stable run identity (`run_id`) for concrete units of work
- step-level events with `component_id` and `step_id` that can be ordered
  within that run
- an outcome or terminal reason when the run ends or exits early
  (`final-result` convention)
- stable business attributes that support labeling and filtering
- a `run_label` declaration in the flow contract specifying which attributes
  form the human-readable run label

Some flow-visible events may intentionally not have `run_id`.

That does not make them invisible.
It makes them non-run activity.

## UI Guidance

### Main Runs List

Show run-backed execution stories by default.

Each row should show:

- run label
- current status
- latest step
- timing
- issue or outcome summary when relevant

Visual weight should follow the run's own data:

- step count
- duration
- status
- terminal outcome

### Canvas

Canvas is a broad activity surface.

It can show mapped flow activity whether or not that activity belongs to a
top-level run.

### Logs

Logs are a broad evidence surface.

They can show all emitted flow logs, not only run-backed logs.

### Node Detail

Node detail should explain meaning before exhaust.

It can include important recent outcomes, side effects, timing, and local logs,
including ambient activity that is not a top-level run.

### History

History should preserve the same semantics as live mode:

- same flow membership rules
- same node vocabulary
- same run identity model

## Ambient Health Responsibility

Keeping ambient flow activity out of the `Runs` list does not remove the
product's responsibility to notice when background machinery goes quiet.

Over time, flow health, node health, or canvas indicators should help surface
signals like:

- last successful poll
- last scheduler activity
- stale queue or worker activity

Those should become health signals, not noisy run rows.

## Non-Goals

This spec does not define:

- exact telemetry field names for every flow
- a requirement that one run equals exactly one trace
- domain-specific visibility heuristics in the UI
- a second classification system for background vs primary events

## Decision Summary

The model is:

- relay matching determines flow visibility
- producer-owned `run_id` determines run identity
- broad surfaces can show all flow-visible telemetry
- `Runs` shows coherent execution stories

That is the cleanest path toward a calmer, more intentional, more
world-class `resq-flow` product.
