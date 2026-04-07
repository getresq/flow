# resq-flow

`resq-flow` is a flow visualizer and log viewer for ResQ telemetry.

It sits on top of the shared observability stack and turns raw traces and logs into a flow-shaped product experience:

- a live graph of first-class runtime boundaries
- run- and node-level drill-down
- filtered logs that prioritize useful signal over telemetry exhaust
- replay and fixture support for UI and relay development

`Victoria` remains the durable storage and query source of truth. `resq-flow` is the flow-aware consumer and presentation layer.

## If you're new

Start with these three files:

1. `AGENTS.md`
2. `README.md`
3. `ARCHITECTURE.md`

Then use:

- `docs/flow-event-contract.md` for contract semantics
- `docs/cli.md` for CLI behavior
- `skills/README.md` for the create/write/read workflows

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

Traditional observability tools are still necessary, but they often make a business or worker flow hard to read quickly.

`resq-flow` exists to answer questions like:

- what path did this run take
- where is work currently sitting
- which boundary actually failed
- which details matter, and which ones are just exhaust

`resq-flow` makes the execution spine visible and keeps the underlying detail accessible.

## What resq-flow is not

`resq-flow` is not:

- a second observability database
- the primary storage or query layer
- a second control plane for producer logging
- a place to mirror every architecture box as a graph node

The normal model is still:

- producers emit once
- Vector fans out
- Victoria stores and serves history
- `resq-flow` consumes and presents the flow-shaped view

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

The TypeScript flow config is optional. It provides rich UI concerns such as:

- React Flow nodes and edges
- span and node mapping
- graph-specific presentation
- layout metadata such as lanes, grouping, and branch behavior

If a flow has no TypeScript view config yet, it still exists as a headless flow for history, logs, run detail, and future non-graph views.

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
make replay-direct
```

## CLI

The CLI is the headless `resq-flow` interface for relay checks, flow log inspection, run explanation, and ad hoc log emission.
It lives in `cli/` and builds to `cli/dist/`.

Scope is explicit:

- a log belongs to a flow only when it explicitly declares that flow with `attributes.flow_id` or relay-assigned `matched_flow_ids`
- unscoped logs are global
- unscoped logs never appear in a specific flow UI

Build and test it locally from the repo root:

```bash
make build-cli
make test-cli
```

`make test-cli` runs both the fast CLI unit tests and the integration tests that boot a real relay on random local ports. If you only want the integration subset, run `make test-cli-integration`.

Link it once if you want the normal executable name locally:

```bash
cd cli
npm link
```

Then use the built CLI:

```bash
resq-flow --help
resq-flow status
resq-flow logs errors --flow mail-pipeline
resq-flow logs list --flow mail-pipeline
resq-flow logs tail --flow mail-pipeline
resq-flow runs explain --flow mail-pipeline --thread <thread-id>
```

If you do not want to link it, the direct fallback still works:

```bash
node cli/dist/index.js --help
```

Available CLI commands:

- `resq-flow status`
- `resq-flow logs errors (--flow <flow-id> | --all)`
- `resq-flow logs list (--flow <flow-id> | --all)`
- `resq-flow logs tail (--flow <flow-id> | --all)`
- `resq-flow runs explain --flow <flow-id> (--run <run-id> | --thread <thread-id>)`

`logs errors` supports:

- exactly one of `--flow <flow-id>` or `--all`
- `--window <duration>` where duration is `<number><unit>` and unit is `s`, `m`, or `h`
- `--attr <key=value>` repeatable
- `--query <text>`
- `--limit <n>`
- `--hard-only`
- `--json`
- `--jsonl`
- `--url <base-url>`
- `--timeout <ms>`

`logs list` supports:

- exactly one of `--flow <flow-id>` or `--all`
- `--window <duration>` where duration is `<number><unit>` and unit is `s`, `m`, or `h`
- `--attr <key=value>` repeatable
- `--query <text>`
- `--limit <n>`
- `--json`
- `--jsonl`
- `--url <base-url>`

`logs tail` supports:

- exactly one of `--flow <flow-id>` or `--all`
- `--attr <key=value>` repeatable
- `--query <text>`
- `--jsonl`
- `--url <base-url>`

Recommended flow-scoped attributes are:

- `run_id`
- `thread_id`
- `step_id`
- `component_id`
- `function_name`
- `worker_name`
- `status`

Recommended skill routing:

- new first-class flow in `resq-flow`
  - use `skills/flow-cli-create/SKILL.md`
- durable logging changes for an existing flow
  - use `skills/flow-cli-write/SKILL.md`
- validation and troubleshooting for an existing flow
  - use `skills/flow-cli-read/SKILL.md`
- ordinary application logs that should not become flow-visible
  - do not use the `resq-flow` skills

Principle:

- do not create a new flow unless the user clearly wants a new first-class flow
- if an existing flow fits, add logs there
- if no existing flow fits and the user does not want a new one, this is ordinary logging work outside `resq-flow`

Troubleshooting flow for agents:

```bash
resq-flow status
resq-flow logs errors --flow mail-pipeline --json
resq-flow logs list --flow mail-pipeline --json
resq-flow runs explain --flow mail-pipeline --thread <thread-id>
```

`logs errors` is the default first stop for "what failed or needs attention?" It returns hard errors via `status=error`, `error_type`, or `error_message`, plus retryable critical rows via `retryable=true`. Use `--hard-only` when you only want terminal-looking failures.

If `logs errors` is empty or inconclusive, broaden to `logs list`, then `runs explain` or `logs tail` depending on whether the problem is historical or live. If the flow-aware `resq-flow` views still do not explain the problem, widen to regular Victoria or raw service logs in your normal tooling.

`logs emit` still exists as a low-level manual utility, but it is not part of the recommended create/write/read workflow.

If a flow-scoped log includes mappable fields such as `step_id`, `component_id`, `function_name`, or `worker_name`, it continues to drive the existing flow logs and canvas activity.

When you need one exact human-facing step reference, derive it as:

- `component_id.step_id`
- example: `analyze-decision.final-result`

## Validation

Standard checks:

```bash
cd relay && cargo fmt
cd relay && cargo clippy -- -D warnings
cd relay && cargo test
cd ui && bun test
cd ui && bun run build
```
