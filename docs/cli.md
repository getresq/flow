# Using the CLI

The `resq-flow` CLI is the headless interface for the product.

Use it when you want to:

- check whether the relay is reachable without opening the UI
- inspect recent flow logs from a terminal
- tail live flow logs while you replay traffic or debug a worker
- explain what happened in a specific run without manually scanning logs
- give an agent stable JSON or JSONL instead of browser state

## What the CLI is for

The CLI is a thin headless client over the existing relay.

It is not:

- a second control plane
- a second flow model
- the normal producer-side logging path

## Install locally

Build the CLI from the `resq-flow` repo root:

```bash
make build-cli
```

If you want the `resq-flow` command available on your shell `PATH`, link it once:

```bash
cd cli
npm link
resq-flow --help
```

The tools have different jobs:

- Bun builds and tests the CLI package locally
- the built output is a Node-compatible executable
- `npm link` only makes the `resq-flow` command available on your shell `PATH`

If you skip `npm link`, the CLI still builds normally, but `resq-flow` will usually not be available as a shell command.
Use the built entrypoint directly instead:

```bash
node cli/dist/index.js --help
```

## Current command set

```bash
resq-flow status
resq-flow logs errors --flow <flow-id>
resq-flow logs list --flow <flow-id>
resq-flow logs tail --flow <flow-id>
resq-flow runs explain --flow <flow-id> --run <run-id>
resq-flow runs explain --flow <flow-id> --thread <thread-id>
```

## Scope model

Scope stays explicit:

- `logs errors`, `logs list`, and `logs tail` require exactly one of `--flow <id>` or `--all`
- `runs explain` requires `--flow <id>` plus exactly one of `--run <run-id>` or `--thread <thread-id>`

A log belongs to a flow only if it explicitly declares that flow through:

- `attributes.flow_id`
- or relay-assigned `matched_flow_ids`

Unscoped logs are global and do not silently belong to a flow.

## Best command for each question

- `resq-flow status`
  use for relay reachability and ingest health
- `resq-flow logs errors`
  use first for "what is failing or needs attention?" in the flow-aware view
- `resq-flow logs list`
  use for bounded recent history
- `resq-flow logs tail`
  use for live flow activity
- `resq-flow runs explain`
  use for "why did this run stop, fail, or complete?"
- regular Victoria or raw service logs
  use when the flow-aware `resq-flow` views do not surface enough evidence and you need broader infrastructure or service context

## Developer workflows

Use `resq-flow` with three primary workflows:

- new first-class flow in `resq-flow`
  - use the `flow-cli-create` skill
- durable logging changes for an existing flow
  - use the `flow-cli-write` skill
- validation and troubleshooting for an existing flow
  - use the `flow-cli-read` skill

If the work is only "add some logs" and the user does not want a new flow:

- use `flow-cli-write` only when an existing flow already fits
- otherwise treat it as ordinary application logging, not a `resq-flow` task

Principle:

- do not create a new flow unless the user clearly wants a new first-class flow
- do not force generic application logs into `resq-flow`

## Error troubleshooting

`logs errors` is the first troubleshooting command for agents and terminal workflows when the question is about failures, retries, or attention-worthy conditions.

It uses the existing history query path and returns only rows that match the CLI troubleshooting heuristics:

- `error`
  - `status=error`
  - `error_type`
  - `error_message`
- `critical`
  - `retryable=true`

Use `--hard-only` when you only want terminal-looking failures and want to exclude retryable critical rows.

Examples:

```bash
resq-flow logs errors --flow mail-pipeline
resq-flow logs errors --all --window 30m
resq-flow logs errors --flow mail-pipeline --attr run_id=thread-201
resq-flow logs errors --flow mail-pipeline --hard-only --json
resq-flow logs errors --flow mail-pipeline --jsonl
resq-flow logs errors --flow mail-pipeline --timeout 10000
```

JSON and JSONL output include:

- the original row fields
- `classification`
  - `error` or `critical`
- `matchReasons`
  - exact deterministic reasons such as `status=error`, `error_type`, `error_message`, or `retryable=true`

Use `--timeout <ms>` when you need a longer history query budget against a slow local stack.

Recommended troubleshooting flow:

1. `resq-flow status`
2. `resq-flow logs errors --flow <flow-id>`
3. If empty or inconclusive, broaden with `resq-flow logs list --flow <flow-id>`
4. If one run or thread is implicated, use `resq-flow runs explain --flow <flow-id> --run <run-id>` or `--thread <thread-id>`
5. If the issue is happening right now, use `resq-flow logs tail --flow <flow-id>`
6. If the flow-aware views still do not explain the problem, widen to regular Victoria or raw service logs in your normal log tooling

Why this escalation exists:

- `resq-flow` is intentionally flow-aware and selective
- it is good at surfacing the execution spine and the most relevant flow logs
- it is not intended to replace broad raw log investigation for every infrastructure or service-level issue

## CLI setup for validation

Before using the CLI for validation or troubleshooting:

1. check whether the command already works:
   - `resq-flow --help`
2. if not, build it:
   - `make build-cli`
3. either link it once:
   - `cd cli && npm link`
4. or use the built entrypoint directly:
   - `node cli/dist/index.js --help`
5. make sure the relay is running:
   - `make dev-relay`
   - or `make dev`
6. sanity check:
   - `resq-flow status`

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

## Advanced manual utility

`logs emit` still exists as a low-level manual utility, but it is not part of the recommended create/write/read workflow.

Use it only for one-off local debugging when you intentionally want to inject a live relay log without changing producer code.

Flow-scoped example:

```bash
resq-flow logs emit --flow mail-pipeline --message "analyze finalized reply branch" --attr run_id=thread-301 --attr component_id=analyze-decision --attr step_id=final-result
```

Global example:

```bash
resq-flow logs emit --global --message "relay smoke check"
```

Do not shell out to the CLI from runtime code just to create normal product logs.
Normal producer-side logging should still go through the application telemetry path.
