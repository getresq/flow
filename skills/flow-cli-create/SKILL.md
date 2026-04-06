---
name: flow-cli-create
description: Use this skill when the user wants to create or scaffold a new flow that should show up in resq-flow. It helps developers define the flow boundary, choose flow and node names, add the core node logs the flow needs, add any clearly requested initial step logs, create the matching resq-flow contract, and validate the result with resq-flow. Do not use it for raw infrastructure logs or for simple log additions to an already existing flow.
---

# resq-flow Flow Creation

Use this skill when the task is about creating a brand-new flow that should show up in `resq-flow`.

This is the producer-side scaffolding companion to:

- `flow-cli-read` for inspecting logs
- `flow-cli-write` for adding or changing logs in an existing flow

## What this skill is for

Use it to:

- create a new flow boundary and flow identity
- choose or confirm node and component names
- add the core node logs the flow needs
- add any clearly requested initial step logs
- create the matching `resq-flow` contract
- validate the result with `resq-flow`

Do not use it for:

- raw Docker or service logs
- Datadog or Victoria-only log searches
- simple incremental logging changes inside an already existing flow; use `flow-cli-write`

## Quick Context

Start with the local repo docs:

- `README.md`
- `ARCHITECTURE.md`
- `resq-flow.md`
- `docs/shared-flow-event-contract.md`
- `docs/adding-a-flow.md`
- `docs/cli.md`
- `ui/src/flow-contracts/*.json`

## First step

Figure out the minimum flow definition:

1. what is the flow for
2. what should the flow be called
3. what are the main nodes or components
4. what execution identity scopes the flow, such as thread, run, job, or request

Infer these from context when the codebase already makes them obvious. If something important is still unclear, ask one short question.

## Default rule

When creating a new flow, add the core node logs first.

That means the stable backbone of the flow should exist from the start:

- queue enqueue
- worker pickup
- worker result
- core step outcomes such as `final_result`

If the user also wants smaller local visibility points, add those as step logs after the backbone exists.

## Node logs vs step logs during flow creation

When a create-flow request includes both major flow steps and smaller local logs:

- use node logs for the main flow backbone
- use step logs for the smaller local visibility points

The user should not have to split that request up manually. Do the decomposition in the implementation.

## Workflow

1. Find the nearest existing runtime and telemetry patterns in the producer repo.
2. Choose a simple flow name and stable node names that match existing naming patterns.
3. Add the producer-side telemetry scaffold using the standard base shape:
   - `definition.rs`
   - `node_context.rs`
   - `schema.rs`
   - `tracing_emit.rs`
   - optional `touchpoints.rs`
4. Add the producer-side flow context and core node logs.
5. Add one or more initial step logs only when they were clearly requested or obviously useful.
6. Create the matching `resq-flow` contract.
7. Validate the new flow with `resq-flow`.

## Rules

- Reuse the normal flow telemetry path in the producer app.
- Do not create a second telemetry pipeline.
- Keep flow scope explicit.
- Keep `flow_id` simple and stable.
- Keep node ownership explicit.
- Treat node logs as the default for new-flow scaffolding.
- Use step logs only for smaller local visibility points, not as a replacement for the flow backbone.

## Naming guidance

Prefer:

- simple stable `flow_id`
- explicit node or component names
- child-step `step_id` values

Do not encode the whole node path into `step_id` when the node identity already exists separately.

## Validation workflow

After the new flow is scaffolded, validate with `resq-flow`:

```bash
resq-flow status
resq-flow logs tail --flow <flow-id>
resq-flow logs list --flow <flow-id> --window 15m --jsonl
```

If the flow includes a natural run identifier, use it to narrow inspection:

```bash
resq-flow logs list --flow <flow-id> --attr run_id=<run-id> --jsonl
```

## Mail-focused first pass

For `resq-mail`, prefer the existing mail telemetry path and naming style as the reference pattern.

If the task is mail-specific and the user is not truly creating a new flow boundary, do not use this skill. Use `flow-cli-write` instead.
