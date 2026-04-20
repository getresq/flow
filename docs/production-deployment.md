# Production Deployment

`resq-flow` is a flow-aware consumer for OpenTelemetry traces and logs. In production it should sit beside an existing observability stack, not replace it.

The recommended production topology is:

```text
application task
  app container -> OTLP -> local OpenTelemetry Collector sidecar
                         -> primary observability backend
                         -> resq-flow relay

resq-flow UI -> resq-flow relay WebSocket/history API
resq-flow relay history -> existing observability backend API
```

The OpenTelemetry Collector sidecar fills the same role that the local Vector example fills in development: receive telemetry once, do cheap routing/filtering, and fan out a selected copy to `resq-flow`.

## Core Rule

Keep producers emitting once.

Do not make application code export directly to both the primary observability backend and `resq-flow`. Put fanout in a collector or routing layer so producer code stays simple and `resq-flow` remains a consumer.

## Components

### Relay

Run one central `resq-flow` relay service per environment.

The relay:

- accepts OTLP traces at `/v1/traces`
- accepts OTLP logs at `/v1/logs`
- serves runtime flow definitions at `/v1/flows`
- serves live WebSocket updates at `/ws`
- serves flow-aware history at `/v1/history`
- applies exact flow matching from `ui/src/flow-contracts`

Avoid running one relay sidecar per producer task. A per-task relay fragments live state, so the browser only sees whichever task it reaches. A central relay lets one UI see executions that cross API, queue, and worker boundaries.

### UI

Serve the UI as a normal static web app or from an application container. The browser needs a stable route to the relay WebSocket and history API.

For production, the relay URL must be deployment-configurable or same-origin. A hardcoded `ws://localhost:4200/ws` URL is only suitable for local development.

Flow definitions should be external JSON config. The UI bundle should not compile product-specific graph data. Use `RESQ_FLOW_CONFIG_DIR` to point the relay at the flow definition files and `RESQ_FLOW_CONTRACT_DIR` to point it at the telemetry contracts used for relay-side matching.

### Collector Sidecar

Use an OpenTelemetry Collector sidecar in producer tasks when the producer already exports OTLP to localhost.

The sidecar should:

- listen for OTLP HTTP, usually on `0.0.0.0:4318`
- export the full desired signal set to the primary observability backend
- export only flow-relevant traces/logs to `resq-flow`
- never forward metrics to `resq-flow`
- treat the `resq-flow` exporter as best-effort

The upstream OpenTelemetry Collector, the OpenTelemetry Collector contrib distribution, and AWS Distro for OpenTelemetry are all viable starting points. Choose the distribution that fits the deployment platform and required processors/exporters.

## FireLens And Existing Log Forwarders

The collector fanout path does not need to interfere with FireLens, Fluent Bit, or other stdout/stderr log forwarding.

Keep the paths separate:

```text
stdout/stderr logs -> FireLens or existing log forwarder -> primary log backend
OTLP traces/logs   -> OpenTelemetry Collector sidecar   -> primary backend and resq-flow
```

If the primary log backend already receives stdout/stderr logs through FireLens, do not also export OTLP logs from the collector to that same backend unless duplicate logs are intentional.

A common safe first cut is:

- keep FireLens as the primary raw log path
- export traces from the collector to the primary trace backend
- export flow-event OTLP logs only to `resq-flow`
- continue persisting the same structured flow log records through the existing stdout/stderr log path when history needs those records

## Collector Policy

Collector filtering should stay coarse and cheap.

Good `resq-flow` fanout filters:

- logs where `event = flow_event`
- spans with `flow_id`
- spans with known queue, worker, or operation markers for a configured flow

Avoid putting exact flow-contract logic in the collector. The relay owns exact matching through flow contracts and annotates kept events with `matched_flow_ids`.

## Failure Isolation

The `resq-flow` collector exporter must be bounded and droppable. Relay outages should not block producer telemetry ingestion or the primary observability path.

The exact collector settings vary by distribution, but the `resq-flow` exporter should use the equivalent of:

- a short timeout
- a bounded sending queue
- no unbounded retry loop
- drop-on-overflow behavior

Keep the primary backend exporter in a separate pipeline from the `resq-flow` exporter. That makes failure behavior easier to reason about and avoids coupling primary telemetry delivery to `resq-flow` availability.

## Minimal Collector Shape

This is an illustrative shape, not a complete config for every collector distribution:

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch: {}

  filter/resq_flow_logs:
    logs:
      log_record:
        - 'attributes["event"] != "flow_event"'

  filter/resq_flow_traces:
    traces:
      span:
        - 'attributes["flow_id"] == nil'

exporters:
  otlphttp/primary:
    endpoint: http://primary-otel-receiver:4318

  otlphttp/resq_flow:
    endpoint: http://resq-flow-relay.internal:4200
    timeout: 2s
    sending_queue:
      enabled: true
      queue_size: 256
    retry_on_failure:
      enabled: false
    headers:
      x-resq-flow-ingest-token: ${env:RESQ_FLOW_INGEST_TOKEN}

service:
  pipelines:
    traces/primary:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp/primary]

    traces/resq_flow:
      receivers: [otlp]
      processors: [filter/resq_flow_traces, batch]
      exporters: [otlphttp/resq_flow]

    logs/resq_flow:
      receivers: [otlp]
      processors: [filter/resq_flow_logs, batch]
      exporters: [otlphttp/resq_flow]
```

If the primary backend's local agent already listens on `4318`, move that receiver to another local port and let the collector take `4318`. Application containers can then keep their existing OTLP endpoint.

## History Backend

The relay's live path is source-agnostic, but history requires a query backend.

Production deployments should use the existing durable observability backend for history. The current relay implementation supports VictoriaLogs plus Jaeger-compatible trace APIs. Other backends such as Datadog, Honeycomb, Grafana Tempo/Loki, or a proprietary query API require a relay history adapter before `/v1/history` can query them.

The relay should normalize backend query results into the same `FlowEvent` model used for live ingest, then apply the same flow-contract filtering.

## Security

Do not expose unauthenticated OTLP ingest on the public internet.

Use one of:

- private networking for `/v1/traces` and `/v1/logs`
- an ingest token sent by the collector as an OTLP HTTP header and enforced by a proxy or relay-side validator
- a split listener or proxy setup where ingest is private and browser routes are authenticated separately

Browser-facing UI, WebSocket, and history routes should also sit behind the deployment's normal authentication or internal access control boundary.

## Rollout Checklist

1. Deploy the central relay service.
2. Make the UI relay URL production-configurable or same-origin.
3. Configure the relay history backend for the existing durable telemetry store.
4. Add a collector sidecar to one non-production producer service.
5. Keep the primary observability path working before enabling `resq-flow` fanout.
6. Enable flow-event OTLP logs only for the producer services that need flow-visible logs.
7. Verify `/health/ingest` increments after producer activity.
8. Verify the UI receives live events.
9. Verify CLI/history commands return backend-backed flow rows.
10. Roll collector fanout across additional producers.

## Operational Defaults

Start with one relay task unless high availability is more important than simple live-buffer behavior.

For multi-instance relays, add sticky routing, a shared live-event bus, or another coordination layer so WebSocket clients receive a coherent event stream.
