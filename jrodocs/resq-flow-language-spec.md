# Resq-Flow Language Spec

## Bottom Line

`resq-flow` should speak in product terms first:

- `Flow`
- `Run`
- `Node`
- `Logs`
- `Status`
- `Timing`

`Trace`, `span`, and `event` are real and important, but they are telemetry terms and should usually live in advanced or debug views.

## Core Model

### Flow

A `flow` is the static map of the system or process.

- A flow is composed of nodes and paths.
- A flow contains many runs.
- A flow is still a flow even when no graph view is registered yet.
- A flow is not composed of traces.

Examples:

- `mail-pipeline`
- `lead-enrichment`
- `sync-backfill`

### Run

A `run` is one observed execution through a flow.

- Runs move through a flow.
- A run may touch some or all nodes in the flow.
- A run is the primary user-facing unit of work.
- A run may be backed by one trace or multiple traces.

User-facing meaning:

- "What happened in this run?"
- "Where did this run fail?"
- "How long did this run spend in each node?"

### Node

A `node` is one box in the flow where work happens.

- A node participates in runs.
- A node may be a worker, queue, store, decision point, or external system.
- A node is not the same thing as a trace or a span.
- A trace may touch one or many nodes during a run.

### Log

A `log` is a human-readable breadcrumb.

- Logs explain what happened.
- Logs explain why something failed.
- Logs provide IDs, payload context, and error details.

Logs answer:

- "What happened?"
- "Why did it happen?"
- "What identifiers were involved?"

### Trace

A `trace` is the telemetry record behind a run.

- A trace correlates related technical work.
- A trace may touch one or many nodes.
- A run may be backed by one trace or multiple traces.
- A trace is not the main user-facing concept.

UI rule:

- Prefer `run` in primary UI copy.
- Expose raw trace IDs in advanced or debug views.

### Span

A `span` is a timed operation inside telemetry.

- A span has a start and an end.
- A span gives us timing, status, and nesting.
- A span is not the same thing as a node.
- A node may have zero, one, or many spans during a run.

UI rule:

- Spans power timing and stuck detection.
- Most users should not need to think in spans by default.

### Event

An `event` is a raw telemetry item.

- Example: a log record, a `span_start`, or a `span_end`
- `Event` is useful internally.
- `Event` should usually not be a primary UI term.

## Relationships

- A `flow` has many `runs`.
- A `run` may have one or many `traces`.
- A `trace` contains one or many `spans`.
- A `trace` may touch one or many `nodes`.
- `logs` and `spans` explain what happened during a `run`.

## Hierarchy

The product hierarchy should read like this:

1. `Flow` is the map.
2. `Run` is one observed execution through the flow.
3. `Node` is one box within the flow.
4. `Log` explains what happened.
5. `Trace` and `span` are telemetry behind the run.

## Instrumentation Contract

The desired contract for meaningful executable nodes is:

- Emit one primary span per execution at that node.
- Emit logs for meaningful milestones and failures.
- Carry correlation identifiers on logs whenever possible.
- Keep queue/storage/helper nodes flexible; they do not need to be perfectly symmetrical with worker nodes.

### Worker Example

If a worker node processes 5 jobs, the ideal default mental model is:

- 5 jobs
- 5 node executions
- 5 primary node spans

In other words: yes, each primary span represents the time it took that node to complete that job.

Important caveat:

- A single job may also emit additional child spans for internal operations.
- Those child spans are advanced detail, not the primary user-facing concept.

So the safe language is:

- "This worker completed 5 jobs."
- "We saw 5 executions at this node."
- "The latest execution took 6.7s."

Not:

- "This node has 5 spans."

That is technically possible, but too telemetry-shaped for primary UI.

## UI Principles

### Primary UI Should Answer

- Is telemetry arriving for this node?
- Did this run reach this node?
- Did it succeed, fail, slow down, or get stuck?
- What do the logs say?
- If needed, how long did work take here?

### Primary UI Vocabulary

Use these terms by default:

- `Flow`
- `Run`
- `Node`
- `Logs`
- `Status`
- `Timing`

### Advanced UI Vocabulary

Use these only in advanced or debug surfaces:

- `Trace ID`
- `Raw trace`
- `Span`
- `Attributes`
- `Raw telemetry`

## Timing Language

Prefer node/run language over span jargon.

Use:

- "This node was active for 6.7s in the latest run."
- "The latest run spent 6.7s in this node."
- "This node took 6.7s to complete."
- "This node is still running."
- "This node appears stuck."

Avoid:

- "This node spanned 6.7 seconds."
- "This node has a span of 6.7 seconds."

## Recommended Copy Patterns

Good:

- "12 recent runs included this node."
- "Latest run through this node: 342ms."
- "1 recent run failed here."
- "Recent logs."
- "Runs."
- "Run details."
- "Advanced telemetry."

Avoid:

- "194 events" in primary UI without qualification
- "This node has 12 traces"
- "The flow is composed of traces"
- "`Traces`" as the primary label for the run browser
- "Span tree" as the first thing a newcomer sees
- "A run is a trace"
- "A node is a span"

If raw counts are shown, qualify them clearly:

- "194 raw telemetry events"
- "12 trace IDs"

## Product Surface Guidance

### Canvas

The canvas should speak in node health and recency.

- active
- slow
- error
- stuck
- idle

### Node Sidebar

The node sidebar should start with an overview.

- Was this node seen recently?
- How did the latest run behave here?
- What logs explain the latest state?

Raw traces and spans should be secondary.

### Bottom Drawer

The bottom drawer is a browser, not the primary inspector.

- `Logs` should stay `Logs`.
- The run browser should be labeled `Runs` in primary UI.
- The drawer should help users scan and select a run.
- The drawer should not try to explain the full run inline.

The drawer should answer:

- Which runs are happening or recently happened?
- Which runs failed?
- Which runs were slow?
- Which run do I want to inspect next?

### Run View

The run view should explain the path and outcome of one run.

- where it went
- which nodes were reached
- where time was spent
- what failed

The run view should be the side-panel inspector opened from the `Runs` list.

Primary rule:

- Treat this as a `Run` inspector, not a `Trace` inspector.

#### Run Panel Structure

The run panel should use the same summary-first pattern as the node sidebar.

Default tab:

- `Overview`

Secondary tab:

- `Advanced telemetry`

#### Run Panel Header

The header should show:

- `Run`
- overall status
- total duration
- one or two key identifiers if available

Examples of helpful identifiers:

- mailbox owner
- thread ID
- reply draft ID
- job ID

Do not lead with raw trace ID in the header.

#### Run Overview Fields

The overview should answer the run-level questions first.

Recommended fields:

- `Status`
- `Duration`
- `Started` or `Last updated`
- `Failed in` if applicable
- `Slowest node` if applicable

These should stay lightweight and scannable, similar to the node sidebar cards.

#### Run Key Insights

The run panel should show only the most important one to three insights.

Good examples:

- "This run failed in `mail_extract`."
- "This run spent most of its time in `mail_incoming`."
- "This run is still active."
- "This run reached 4 nodes."

Avoid generic or repetitive copy:

- "Telemetry is arriving."
- "This trace has spans."
- "This run contains logs and traces."

#### Run Path

The run panel should include a clear path through the flow.

This should show:

- the nodes reached by the run
- their order
- their outcome
- their duration when helpful

This is the human-facing explanation of the run.

Use `node` language here, not raw span language.

Examples:

- `mail_incoming` -> success -> 6.7s
- `mail_extract` -> failed -> 412ms

#### Related Logs

The run panel may include a lightweight way to pivot into logs for the selected run.

Good options:

- a small log preview
- a button to filter the bottom drawer to this run

The run panel should not duplicate the full log browser.

#### Advanced Telemetry

The advanced tab can expose:

- raw trace ID(s)
- raw spans
- nested child spans
- raw attributes

This is where `trace` and `span` language belongs.

It should not be the default tab.

### Advanced Debug View

The advanced view can expose:

- raw trace IDs
- raw spans
- raw attributes
- low-level telemetry detail

## Language Rules

### Say This

- "Flow"
- "Run"
- "Node"
- "Logs"
- "This node took 6.7s to complete."
- "This run failed in `mail_incoming`."
- "This node was included in 12 recent runs."

### Not This

- "The node has a trace."
- "The flow is composed of traces."
- "This node spanned 6.7s."
- "Events" as a top-level noun for newcomers.
- "Span" as the first explanation of node activity.
- "`Traces`" as the primary name of the run browser.

## Decision

`resq-flow` should treat:

- `Flow` as the top-level system map
- `Run` as the primary user-facing execution unit
- `Node` as the primary place-based concept
- `Trace` and `span` as important but mostly advanced telemetry concepts

This keeps the product accurate without forcing newcomers to think in observability jargon.
