# resq-flow

`resq-flow` is a local development-only flow visualizer for ResQ telemetry.

It is built around one local contract:

- Producers send OTLP to `Vector` once.
- `Vector` fans out to `Victoria` and `resq-flow`.
- `Victoria` remains the storage and query source of truth.
- `resq-flow` renders a low-latency, flow-oriented live view on top of that stream.

## Topology

```text
producer(s) -> Vector -> VictoriaLogs / VictoriaTraces / VictoriaMetrics
                     \
                      -> resq-flow relay -> WebSocket -> UI
```

The applied local Vector runtime config lives in:

- `/Users/jeremyrojas/worktrees/fullstack/gmail-oauth-unified-handoff-fullstack/observability/vector/vector.yaml`

This repo keeps a discoverable example snippet in:

- `/Users/jeremyrojas/worktrees/resq-flow/examples/vector/resq-flow-fanout.yaml`

## Flow Model

Each flow has two layers:

- Shared JSON contract in `ui/src/flow-contracts/*.json`
- Optional TypeScript view config in `ui/src/flows/*.ts`

The JSON contract is the stable shared boundary. It defines:

- coarse telemetry matching rules
- context retention rules
- the flow identity/name used by the relay and UI

The TypeScript view config is optional. It provides rich UI concerns such as:

- React Flow nodes and edges
- node/span mapping
- graph-specific presentation

If a flow has no TypeScript view config yet, it still exists as a headless flow for history, logs, trace detail, and future non-graph views.

## Relay Behavior

The Rust relay:

- receives OTLP traces and logs on port `4200`
- loads flow contracts from `ui/src/flow-contracts`
- matches incoming telemetry against those contracts
- keeps additional trace context according to each flow contract
- tags kept events with `matched_flow_ids`
- publishes WebSocket `snapshot` and `batch` envelopes for live clients
- applies the same contract-driven filtering model to history queries via `flow_id`

The React Flow canvas is the first rich view, but the normalized event model stays compatible with headless and future non-graph experiences.

## Recommended Local Mode

Use `resq-flow` behind the shared Vector stack by default:

1. Start the shared observability stack from `fullstack`.
2. Start `resq-flow` with `make dev`.
3. Let Vector fan out a filtered copy of traces/logs to `http://host.docker.internal:4200`.
4. Verify endpoints with `make print-endpoints`.
5. Verify live ingest with `make verify-ingest`.

### Vector coarse-filter policy

For v1, the Vector layer stays coarse and cheap:

- Do not fan out metrics to `resq-flow`.
- Fan out logs only when they include the explicit mail telemetry event contract such as `mail_e2e_event`.
- Fan out traces when the OTLP batch clearly contains stable mail markers such as `rrq:queue:mail-`, `handle_mail_`, `mail_` worker names, or mail stage IDs like `incoming.*`, `analyze.*`, `extract.*`, and `send.*`.
- Treat `service.name` as a helpful secondary signal, not the only gate.
- Keep exact flow membership out of Vector. The relay owns exact contract matching and `matched_flow_ids`.

### Best-effort fanout

The `resq-flow` fanout sinks should be intentionally best-effort:

- sink health checks disabled
- sink retries disabled
- in-memory buffering with `drop_newest` when full
- Victoria path remains the primary path even if `resq-flow` is down

## Direct Mode

Direct-to-relay mode still exists for isolated debugging:

- traces: `http://localhost:4200/v1/traces`
- logs: `http://localhost:4200/v1/logs`

Use it only when you intentionally want to bypass the shared Vector path.

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

## Validation

Standard checks:

```bash
cd relay && cargo fmt
cd relay && cargo clippy -- -D warnings
cd relay && cargo test
cd ui && bun test
cd ui && bun run build
```
