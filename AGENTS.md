## Cursor Cloud specific instructions

### Overview

resq-flow is a local dev-only real-time flow visualization tool with two services:

- **Relay** (`relay/`): Rust (Axum) WebSocket server on port 4200 — receives OTLP traces/logs, broadcasts FlowEvents.
- **UI** (`ui/`): Vite + React 19 + TypeScript app on port 5173 — renders interactive flow diagrams.

### Prerequisites

- **Rust** ≥ 1.85 (edition 2024). The default rustup toolchain must be set to `stable` (`rustup default stable`).
- **Bun** (`~/.bun/bin/bun`). Ensure `~/.bun/bin` is on PATH.

### Running, testing, linting

See `Makefile` for all standard commands (`make dev`, `make test`, `make replay`, `make replay-direct`).

- `cd relay && cargo test` — 4 integration tests (OTLP→WS, logs, broadcast).
- `cd ui && bun test` — 15 Vitest tests (hooks, components, span mapping).
- `cd ui && bun run lint` — ESLint. Pre-existing React Compiler warnings exist (not blocking).
- `cd ui && bun run build` — TypeScript check + Vite build.

### Non-obvious caveats

- The Rust relay must be compiled before `make dev` will work; first run takes ~15s to compile dependencies.
- The UI can be tested independently of the relay using `make replay-direct` (direct fixture replay mode).
- `make replay` requires both the relay and UI to be running first — it sends fixture data through the relay WebSocket.
- No Docker, databases, or external services are required.
