# resq-flow

`resq-flow` is a specialized flow visualizer and log viewer for ResQ telemetry.

It sits on top of the shared observability stack and turns raw traces and logs into a flow-shaped product experience:

- a live graph of first-class runtime boundaries
- run- and node-level drill-down
- filtered logs that prioritize useful signal over telemetry exhaust
- replay and fixture support for UI and relay development

In the product UI, people usually work in two complementary views:

- visualizer view
  - follow the execution path in the graph or canvas view and drill into the relevant node
- logs view
  - read the filtered flow logs directly in a logs-first view when the graph is not the fastest way to reason about the issue

`Victoria` remains the durable storage and query source of truth. `resq-flow` is the flow-aware consumer and presentation layer.

## Start Here

If you are a human or an agent, this `README.md` is the front door for the repo.

If you only read one file first, read this one.

> Agents and humans:
> If you are looking for next steps, use the routing below to decide whether this task is `flow-cli-create`, `flow-cli-write`, `flow-cli-read`, or ordinary non-`resq-flow` logging. If one of those workflows fits, open the matching `SKILL.md` and follow it.

Use it to answer:

- what `resq-flow` is for
- whether your task belongs in `resq-flow`
- which workflow or skill to use next
- which deeper docs to read only after the route is clear

### Quick routing

Use this routing before you dive into implementation details:

- brand-new first-class flow in `resq-flow`
  - use `skills/flow-cli-create/SKILL.md`
- durable logging changes for an existing flow
  - use `skills/flow-cli-write/SKILL.md`
- validation and troubleshooting for an existing flow
  - use `skills/flow-cli-read/SKILL.md`
- ordinary application, service, or infrastructure logs that should not become flow-visible
  - do not use the `resq-flow` skills; use normal logging tools

### Recommended read order

After this file:

1. `AGENTS.md` for repo guardrails and coding expectations
2. `skills/README.md` for the skill chooser
3. `docs/cli.md` for CLI behavior
4. `docs/flow-event-contract.md` only when you need contract semantics
5. `ARCHITECTURE.md` only when you need deeper topology and ownership detail

### One-line guidance to reuse

- "New flow?" use `flow-cli-create`
- "Existing flow needs logs?" use `flow-cli-write`
- "Need to validate or troubleshoot?" use `flow-cli-read`
- "Not actually a flow?" use normal logs, not `resq-flow`

## Topology

```text
resq-agent -> OTLP -> Vector -> Victoria
                           \
                            -> resq-flow relay -> WebSocket -> UI
```

The normal local mode is:

1. producers emit once
2. `Vector` fans out
3. `Victoria` remains primary storage and query
4. `resq-flow` focuses on visualization, history, and flow-aware detail

This repo keeps a discoverable Vector example in:

- `examples/vector/resq-flow-fanout.yaml`

## What resq-flow is solving

Traditional observability tools are still necessary, but their default posture is to show everything.

That is powerful, but it also means a developer usually has to know what to query, what to filter, and which low-level details to ignore before the real story becomes clear.

`resq-flow` is solving the opposite problem:

- show only the flow-relevant subset of telemetry
- make the execution path easy to see without custom querying first
- surface the logs and boundaries that matter to the flow
- keep low-value exhaust out of the default view until you intentionally drill down

In practice, `resq-flow` should make it faster to answer questions like:

- what path did this run take
- where is work currently sitting
- which boundary actually failed
- which details matter, and which ones are just exhaust

`resq-flow` is a specialized, flow-aware view over shared telemetry. It makes the execution spine visible, keeps the relevant detail accessible, and avoids drowning the user in everything else by default.

## What resq-flow is not

`resq-flow` is not:

- a second observability database
- the primary storage or query layer
- a second control plane for producer logging
- a raw "show me every log" tool
- a place to mirror every architecture box as a graph node

The normal model is still:

- producers emit once
- Vector fans out
- Victoria stores and serves history
- `resq-flow` consumes and presents the filtered flow-shaped subset that is relevant to the user’s flow

## Core principles

The current product direction is built around a few stable ideas:

- real queue and worker boundaries stay first-class by default
- meaningful decisions and processes can also be first-class when they deserve it
- the graph should stay sparse while drill-down stays rich
- notes default to the sidebar, not the canvas
- canvas detail and logs should share the same default filtering model
- default surfaces should prioritize `critical`, `meaningful`, and selected `operational` signal
- raw telemetry belongs behind advanced or show-all views
- one node should have one consistent visible name across canvas, sidebar, logs, filters, and run views

## Flow model

Each flow currently has two layers:

- shared JSON contract in `ui/src/flow-contracts/*.json`
- optional TypeScript view config in `ui/src/flows/*.ts`

The JSON contract is the stable shared boundary. It defines:

- coarse telemetry matching rules
- context retention rules
- the flow identity and name used by the relay and UI

`run_id` is producer-owned.

If the producer emits and carries one coherent `run_id`, `resq-flow` can show that execution as a top-level Run.

Flow-visible events without `run_id` can still appear in logs, canvas detail, and history, but they do not become top-level Runs.

The TypeScript flow config is optional. It provides rich UI concerns such as:

- React Flow nodes and edges
- span and node mapping
- graph-specific presentation
- layout metadata such as lanes, grouping, and branch behavior

If a flow has no TypeScript view config yet, it still exists as a headless flow for history, logs, run detail, and future non-graph views.

## What a Run is

A Run is one coherent execution story inside a flow.

In plain terms:

- one Run should answer "what happened for this one piece of work"
- not every flow-visible event should become a Run
- mailbox polling, scheduler activity, and other pre-work checks can still matter without becoming top-level Runs

`run_id` is how the producer tells `resq-flow` which events belong to that one story.

Without `run_id`, the UI would have to guess which events belong together.

## Relay behavior

The Rust relay:

- receives OTLP traces and logs on port `4200`
- loads flow contracts from `ui/src/flow-contracts`
- matches incoming telemetry against those contracts
- keeps additional trace context according to each flow contract
- tags kept events with `matched_flow_ids`
- publishes WebSocket `snapshot` and `batch` envelopes for live clients
- applies the same contract-driven filtering model to history queries via `flow_id`

The React Flow canvas is the first rich view, but the normalized event model is meant to stay compatible with headless and future non-graph experiences.

## Recommended local mode

Use `resq-flow` behind the shared Vector stack by default:

1. start the shared observability stack from `fullstack`
2. start `resq-flow` with `make dev`
3. let Vector fan out a filtered copy of traces and logs to `http://host.docker.internal:4200`
4. verify endpoints with `make print-endpoints`
5. verify live ingest with `make verify-ingest`

### Vector coarse-filter policy

For the current mail example, the Vector layer stays coarse and cheap:

- do not fan out metrics to `resq-flow`
- fan out logs only when they include the explicit mail telemetry event contract such as `mail_e2e_event`
- fan out traces when the OTLP batch clearly contains stable mail markers such as `rrq:queue:mail-`, `handle_mail_`, `mail_` worker names, or mail step IDs like `incoming.*`, `analyze.*`, `extract.*`, and `send.*`
- treat `service.name` as a helpful secondary signal, not the only gate
- keep exact flow membership out of Vector; the relay owns exact contract matching and `matched_flow_ids`

These filters describe the current mail-oriented coarse fanout example, not a permanent naming contract for every future flow.

### Best-effort fanout

The `resq-flow` fanout sinks should be intentionally best-effort:

- sink health checks disabled
- sink retries disabled
- in-memory buffering with `drop_newest` when full
- Victoria path remains the primary path even if `resq-flow` is down

## Direct mode

Direct-to-relay OTLP ingest mode still exists for isolated debugging:

- relay traces ingest: `http://localhost:4200/v1/traces`
- relay logs ingest: `http://localhost:4200/v1/logs`

Use it only when you intentionally want to bypass the shared Vector path.
These endpoints are for sending traces and logs to the relay, not for viewing stored data.

## Design and docs

Key references in this repo:

- `ARCHITECTURE.md`
- `docs/flow-event-contract.md`
- `docs/cli.md`
- `skills/README.md`
- `ui/DESIGN-SYSTEM.md`
- `examples/vector/resq-flow-fanout.yaml`

If you are adding a new flow, start with:

- `skills/flow-cli-create/SKILL.md`

If you change product direction, naming rules, filtering rules, or graph behavior, keep the surrounding docs and design references in sync with the code.

## Development

```bash
make dev
```

- Relay: `http://localhost:4200`
- UI: `http://localhost:5173`

Helpful commands:

```bash
make test
make print-endpoints
make verify-ingest
make smoke-vector-fanout
make smoke-relay-ingest
make replay
```

### Demo replay

`make replay` drives the public `demo-pipeline` sample flow.

Use it when you want to prove a fresh local setup is working without waiting on a real producer.

1. Start the relay and UI:

   ```bash
   make dev
   ```

2. Open the demo canvas in the browser:

   ```text
   http://localhost:5173/#/flows/demo-pipeline?mode=live&view=canvas
   ```

3. In another terminal, replay the demo traffic:

   ```bash
   make replay
   ```

What to expect:

- the `demo-pipeline` canvas should light up immediately
- the happy-path nodes and blue edges should animate from top to bottom
- this is synthetic setup/demo traffic, not producer-backed mail traffic

## CLI

The CLI is the headless `resq-flow` interface for relay checks, flow log inspection, and run explanation.
It lives in `cli/` and builds to `cli/dist/`.

Build it from the repo root:

```bash
make build-cli
```

Link it once if you want the normal executable name locally:

```bash
cd cli
npm link
resq-flow --help
```

If you do not want to link it, the direct fallback still works:

```bash
node cli/dist/index.js --help
```

The main commands most people need are:

- `resq-flow status`
- `resq-flow logs errors --flow <flow-id>`
- `resq-flow logs list --flow <flow-id>`
- `resq-flow logs tail --flow <flow-id>`
- `resq-flow runs explain --flow <flow-id> --thread <thread-id>`

Use `logs errors` first for "what failed or needs attention?" If it is empty or inconclusive, broaden to `logs list`, then `runs explain` or `logs tail`, and finally regular Victoria or raw service logs when you need wider context.

For full CLI behavior, flags, troubleshooting flow, and advanced utilities, see:

- `docs/cli.md`

## Validation

Standard checks:

```bash
cd relay && cargo fmt
cd relay && cargo clippy -- -D warnings
cd relay && cargo test
cd ui && bun test
cd ui && bun run build
```
