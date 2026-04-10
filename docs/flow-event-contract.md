# Shared flow_event contract

This is the shared structured log contract for `resq-flow`.

Mail is the current real example, but the contract is not mail-specific. New flows should follow the same shape.

## Logs vs traces

For logs:

- use `event = flow_event`
- use `flow_id` to say which flow the log belongs to

For traces:

- do not require `event = flow_event`
- do carry the shared identity fields that help `resq-flow` understand the trace, especially `flow_id` and `component_id`

The shared event name is for logs.
The shared flow identity comes from `flow_id`.

## Required identifiers

### `flow_id`

Which flow this record belongs to.

Examples:

- `mail-pipeline`
- `nora-pipeline`
- `support-ai-pipeline`

### `run_id`

Which run or journey this record belongs to.

Use it to group one concrete execution path across multiple nodes.

This is required for run-backed events.

It may be absent for ambient flow-visible activity that belongs to the flow but
does not represent a concrete top-level run, such as polling, scheduler
activity, or other pre-work checks.

### `component_id`

The canonical identity of the first-class node.

This is the main node ID for queues, workers, decisions, processes, and other first-class flow nodes.

### `component_kind`

What kind of node `component_id` refers to.

Examples:

- `queue`
- `worker`
- `decision`
- `process`

### `step_id`

The child step under the owning `component_id`.

This is detail about what happened inside or under that node.

Use kebab-case child-only values such as:

- `final-result`
- `cursor-update`
- `write-metadata`

## Node logs vs step logs

Use this simple distinction when designing or reviewing flow logs:

- `component_id` identifies the primary node, so logs anchored there are node logs
- `step_id` identifies a step attached to that node, so logs that use it are step logs

That gives us one clean model:

- node logs define the main flow structure
- step logs show what happened around a node's work

## The key semantic rule

`component_id` is the node identity.

`step_id` is not a second node identity.

It is subordinate attached detail under that node.

If you need one combined detail identity, derive it as:

- `component_id.step_id`

That keeps the graph clean:

- the node stays first-class
- the step stays attached detail

## Troubleshooting attributes

These fields power the CLI troubleshooting path, especially `resq-flow logs errors`.

### Hard-error attributes

Any of these will surface a row as an `error`:

- `status=error`
- `error_type`
- `error_message`

### Critical retry attributes

This will surface a row as `critical`:

- `retryable=true`

If you want a row to be easy for humans and agents to troubleshoot from the CLI, prefer setting one of the hard-error fields for terminal failures and `retryable=true` for attention-worthy retries.

## Why the event name is shared

We use one shared event name so the stack can route flow logs generically.

That keeps `Vector` simple:

- one coarse flow-log rule
- no per-flow event names
- no per-flow regex blocks

The event name says the record is a structured flow log.

`flow_id` says which flow it belongs to.

## Example

```text
event=flow_event
flow_id=mail-pipeline
run_id=run_123
component_id=send-process
component_kind=process
step_id=final-result
```

This says:

- this is a structured flow log
- it belongs to the mail pipeline
- it belongs to one specific run
- the first-class node is `send-process`
- the child step is `final-result`
