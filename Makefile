.PHONY: dev dev-relay dev-ui test test-relay test-ui build-cli test-cli replay replay-direct verify-ingest print-endpoints smoke-relay-ingest smoke-vector-fanout

RESQ_FLOW_BASE_URL ?= http://localhost:4200
RESQ_FLOW_VECTOR_LOGS_URL ?= http://localhost:4318/v1/logs

dev: ## Start both relay + UI
	@make -j2 dev-relay dev-ui

dev-relay: ## Start Rust WebSocket relay
	cd relay && cargo run --bin resq-flow-relay

dev-ui: ## Start Vite dev server
	cd ui && bun run dev

test: ## Run all tests
	@make -j2 test-relay test-ui

test-relay: ## Run Rust relay tests
	cd relay && cargo test

test-ui: ## Run frontend tests
	cd ui && bun test

build-cli: ## Build the CLI package
	cd cli && bun run build

test-cli: ## Run CLI tests
	cd cli && bun test

replay: ## Run mock event replay (start relay + ui first)
	cd ui && bun run replay

replay-direct: ## Run mock replay without relay (start ui first)
	cd ui && bun run replay:direct

verify-ingest: ## Check relay health and whether traces/logs have arrived recently
	@set -e; \
	health="$$(curl -fsS $(RESQ_FLOW_BASE_URL)/health)"; \
	ingest="$$(curl -fsS $(RESQ_FLOW_BASE_URL)/health/ingest)"; \
	bun -e 'const [healthRaw, ingestRaw] = process.argv.slice(1); const health = JSON.parse(healthRaw); const ingest = JSON.parse(ingestRaw); console.log("relay reachable: " + (health.status === "ok" ? "yes" : "no")); console.log("ingest active: " + ((ingest.traces_recent || ingest.logs_recent) ? "yes" : "no")); console.log("trace_count_last_60s: " + ingest.trace_count_last_60s); console.log("log_count_last_60s: " + ingest.log_count_last_60s); console.log("last_trace_at: " + (ingest.last_trace_at ?? "none")); console.log("last_log_at: " + (ingest.last_log_at ?? "none"));' "$$health" "$$ingest"

print-endpoints: ## Print relay and collector-compatible fanout endpoints
	@echo "Relay health:          $(RESQ_FLOW_BASE_URL)/health"
	@echo "Relay ingest health:   $(RESQ_FLOW_BASE_URL)/health/ingest"
	@echo "Relay capabilities:    $(RESQ_FLOW_BASE_URL)/capabilities"
	@echo "Relay traces endpoint: $(RESQ_FLOW_BASE_URL)/v1/traces"
	@echo "Relay logs endpoint:   $(RESQ_FLOW_BASE_URL)/v1/logs"
	@echo "Collector (Docker) fanout target: http://host.docker.internal:4200"
	@echo "Collector (native) fanout target: http://localhost:4200"

smoke-relay-ingest: ## Send a protobuf OTLP smoke log directly to the relay, then verify ingest health
	cd relay && OTLP_SMOKE_ENDPOINT=$(RESQ_FLOW_BASE_URL)/v1/logs OTLP_SMOKE_EXPECT_INGEST_URL=$(RESQ_FLOW_BASE_URL)/health/ingest cargo run --bin otlp_smoke

smoke-vector-fanout: ## Send a protobuf OTLP smoke log through Vector and confirm it reaches the relay
	cd relay && OTLP_SMOKE_ENDPOINT=$(RESQ_FLOW_VECTOR_LOGS_URL) OTLP_SMOKE_EXPECT_INGEST_URL=$(RESQ_FLOW_BASE_URL)/health/ingest cargo run --bin otlp_smoke
