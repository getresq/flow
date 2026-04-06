# Using the CLI

The `resq-flow` CLI is the headless interface for the product.

Use it when you want to:

- check whether the relay is reachable without opening the UI
- inspect recent flow logs from a terminal
- tail live flow logs while you replay traffic or debug a worker
- explain what happened in a specific run without manually scanning logs
- emit one quick structured debug log for local validation
- give an agent stable JSON or JSONL instead of browser state

## What the CLI is for

The CLI is a thin headless client over the existing relay.

It is not:

- a second control plane
- a second flow model
- the normal producer-side logging path

## Current command set

```bash
resq-flow status
resq-flow logs list --flow <flow-id>
resq-flow logs tail --flow <flow-id>
resq-flow logs emit --flow <flow-id> --message "<text>"
resq-flow runs explain --flow <flow-id> --run <run-id>
resq-flow runs explain --flow <flow-id> --thread <thread-id>
```

## Scope model

Scope stays explicit:

- `logs list` and `logs tail` require exactly one of `--flow <id>` or `--all`
- `logs emit` requires exactly one of `--flow <id>` or `--global`
- `runs explain` requires `--flow <id>` plus exactly one of `--run <run-id>` or `--thread <thread-id>`

A log belongs to a flow only if it explicitly declares that flow through:

- `attributes.flow_id`
- or relay-assigned `matched_flow_ids`

Unscoped logs are global and do not silently belong to a flow.

## Best command for each question

- `resq-flow status`
  use for relay reachability and ingest health
- `resq-flow logs list`
  use for bounded recent history
- `resq-flow logs tail`
  use for live flow activity
- `resq-flow runs explain`
  use for "why did this run stop, fail, or complete?"
- `resq-flow logs emit`
  use for one manual local debug log

## Explain command

`runs explain` is deterministic and rules-based in v1.

It should:

- identify the target run
- summarize the node path reached
- point out where work stopped, failed, or completed
- show the key evidence rows

Examples:

```bash
resq-flow runs explain --flow mail-pipeline --run thread-201
resq-flow runs explain --flow mail-pipeline --thread 19d637994c1a7912
resq-flow runs explain --flow mail-pipeline --thread 19d637994c1a7912 --json
```

## Manual debug logs

Use `logs emit` only for manual debugging.

Flow-scoped example:

```bash
resq-flow logs emit --flow mail-pipeline --message "picked thread for analysis" --attr run_id=thread-301 --attr step_id=analyze.decision
```

Global example:

```bash
resq-flow logs emit --global --message "relay smoke check"
```

Do not shell out to the CLI from runtime code just to create normal product logs.
Normal producer-side logging should still go through the application telemetry path.
