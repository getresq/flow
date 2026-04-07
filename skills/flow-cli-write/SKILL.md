---
name: flow-cli-write
description: Use this skill when the user wants to add or change flow-visible logs for an existing flow. It helps developers find the right existing flow, choose between node logs and step logs, reuse the normal flow telemetry path, keep scope explicit, and validate the result with the resq-flow CLI. Do not use it for raw infrastructure logs or brand-new flow scaffolding.
---

# resq-flow Runtime Logs

Use this skill when the task is about writing logs into `resq-flow`.

This is the producer-side companion to `flow-cli-read`.

## What this skill is for

Use it to:

- add flow-visible runtime logs in existing code for an existing flow
- change existing flow-visible runtime logs
- identify the right existing flow and flow context
- choose the right log style for the change
- keep flow scope explicit
- validate the result with `resq-flow`

Do not use it for:

- raw Docker or service logs
- Datadog or Victoria-only log searches
- inventing a second telemetry pipeline
- scaffolding a brand-new flow from scratch; use `flow-cli-create` for that
- logging work that should stay outside `resq-flow`

## Quick Context

Start with the local repo docs:

- `AGENTS.md`
- `README.md`
- `ARCHITECTURE.md`
- `docs/flow-event-contract.md`
- `docs/cli.md`
- `ui/src/flow-contracts/*.json`

## First step

Figure out which of these the user wants:

1. add runtime logs to an existing flow
2. inspect whether an existing runtime log is already visible in a flow
3. add ordinary logs that should not be flow-visible

If the user names a flow, use it.

If the user does not name a flow, infer it from repo context when it is obvious. If not obvious, ask one short question.

Routing rule:

- if the request clearly needs a brand-new flow, stop and use `flow-cli-create`
- if an existing flow already fits, continue with this skill
- if no existing flow fits and the user does not want a new one, stop and treat it as ordinary application logging, not `resq-flow`

## Node logs vs step logs

This skill should choose between two structural log types:

- node logs
- step logs

Use node logs when the event defines the main flow structure:

- queue enqueue
- worker pickup or result
- core step outcomes such as `final-result`
- stable business or lifecycle events the flow will rely on long-term at the primary node level

Use step logs when the event is attached to a node and helps show what happened around that node's work:

- one extra branch or decision log
- one extra save or write log
- a smaller local visibility point attached to a node

Implementation rule:

- node logs usually use the existing typed telemetry path
- step logs can use either the existing typed step pattern or the small helper path
- prefer the helper path when you are adding one incremental step log and do not need to expand the typed contract

The user usually should not have to choose. Infer the right path from the request.

## Runtime instrumentation workflow

1. Find the existing flow contract and the nearest producer-side telemetry seam.
2. Reuse the normal flow telemetry path already used by that flow.
3. Keep flow scope explicit with the existing flow identity and run identity.
4. Choose the right log style:
   - use the existing typed path for node logs and stable step logs
   - use the helper path for simple new step logs attached to an existing node
5. Add a clear step id and message. Let flow and node identity come from the bound context.
   - use kebab-case child-only `step_id` values such as `resolve-identity` or `final-result`
   - when humans need one exact reference, use `component_id.step_id`
6. Validate the result with `resq-flow`.

## Rules

- Reuse the existing flow telemetry / tracing path in the producer app.
- Keep flow scope explicit.
- Do not shell out to `resq-flow logs emit` from runtime code.
- Do not create a second CLI-specific telemetry path.
- Do not route to `flow-cli-create` when the user explicitly does not want a new flow.
- Do not force generic application logs into `resq-flow` when no existing flow fits.
- Prefer existing bound flow or node contexts over hand-rolled logging.
- Do not pass `flow_id`, `run_id`, or `component_id` manually when the bound context already knows them.
- Prefer the smallest callsite that still preserves correct scope.

## Good runtime log shape

For runtime code, aim for a small, useful record:

- flow
- run
- step
- message

For simple step-log additions, prefer the tiny helper shape:

- `step_ok(step_id, message)`
- `step_err(step_id, message, error_message)`

Use the existing typed telemetry pattern instead when the log is a primary node event or an already-established typed step event.

## CLI validation prereqs

Before validating with the CLI, make sure the local tools are available:

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

## Validation workflow

After adding instrumentation, validate with `resq-flow`:

```bash
resq-flow logs tail --flow mail-pipeline
resq-flow logs list --flow mail-pipeline --query extract
resq-flow logs list --flow mail-pipeline --attr thread_id=<thread_id> --jsonl
resq-flow runs explain --flow mail-pipeline --thread <thread_id>
```

Use `--all` only when the user explicitly wants to inspect global or cross-flow logs.

## Mail-focused first pass

For `resq-mail`, prefer the existing mail telemetry path and node context helpers. The normal path is already flow-scoped and is what should power mail runtime logs in `resq-flow`.

If a change is mail-specific, default to `mail-pipeline` unless the code clearly belongs to another flow.

For existing mail flow work:

- use typed telemetry for queue, worker, and core node or step lifecycle events
- use the helper for simple step logs such as `resolve-identity`
