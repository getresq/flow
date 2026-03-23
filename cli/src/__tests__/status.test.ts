import { describe, expect, it } from "bun:test";

import { runCli } from "../index.js";

function createBufferedIo() {
  let stdout = "";
  let stderr = "";

  return {
    io: {
      stdout(text: string) {
        stdout += text;
      },
      stderr(text: string) {
        stderr += text;
      },
    },
    readStdout() {
      return stdout;
    },
    readStderr() {
      return stderr;
    },
  };
}

function createJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function createFetchMock(
  routes: Record<string, Response | (() => Promise<Response>)>,
): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const route = routes[url];
    if (!route) {
      throw new TypeError(`unexpected URL: ${url}`);
    }

    if (typeof route === "function") {
      return route();
    }

    return route;
  }) as typeof fetch;
}

describe("resq-flow status", () => {
  it("prints the default health summary", async () => {
    const buffered = createBufferedIo();
    const fetchImpl = createFetchMock({
      "http://localhost:4200/health": createJsonResponse({ status: "ok" }),
      "http://localhost:4200/health/ingest": createJsonResponse({
        status: "ok",
        trace_count_total: 10,
        log_count_total: 20,
        trace_count_last_60s: 3,
        log_count_last_60s: 5,
        last_trace_at: "2026-03-23T18:44:11.902Z",
        last_log_at: "2026-03-23T18:44:12.381Z",
        traces_recent: true,
        logs_recent: true,
        recent_buffer_size: 12,
        ws_lagged_events_total: 0,
      }),
      "http://localhost:4200/capabilities": createJsonResponse({
        service: "resq-flow-relay",
        bind: "0.0.0.0:4200",
        supported_ingest: {
          traces_path: "/v1/traces",
          logs_path: "/v1/logs",
          ws_path: "/ws",
        },
        recommended_mode: "collector-compatible",
        supported_modes: ["collector-compatible", "direct"],
      }),
    });

    const exitCode = await runCli(["status"], buffered.io, { fetchImpl });

    expect(exitCode).toBe(0);
    expect(buffered.readStdout()).toContain("Relay: reachable");
    expect(buffered.readStdout()).toContain("Status: ok");
    expect(buffered.readStdout()).toContain("Logs active: yes");
    expect(buffered.readStdout()).toContain("Traces active: yes");
    expect(buffered.readStdout()).toContain(
      "Base URL: http://localhost:4200",
    );
    expect(buffered.readStderr()).toBe("");
  });

  it("prints JSON output", async () => {
    const buffered = createBufferedIo();
    const fetchImpl = createFetchMock({
      "http://example.com/health": createJsonResponse({ status: "ok" }),
      "http://example.com/health/ingest": createJsonResponse({
        status: "ok",
        trace_count_total: 1,
        log_count_total: 2,
        trace_count_last_60s: 0,
        log_count_last_60s: 1,
        last_trace_at: null,
        last_log_at: "2026-03-23T18:44:12.381Z",
        traces_recent: false,
        logs_recent: true,
        recent_buffer_size: 4,
        ws_lagged_events_total: 0,
      }),
      "http://example.com/capabilities": createJsonResponse({
        service: "resq-flow-relay",
        bind: "0.0.0.0:4200",
        supported_ingest: {
          traces_path: "/v1/traces",
          logs_path: "/v1/logs",
          ws_path: "/ws",
        },
        recommended_mode: "collector-compatible",
        supported_modes: ["collector-compatible", "direct"],
      }),
    });

    const exitCode = await runCli(
      ["status", "--url", "http://example.com", "--json"],
      buffered.io,
      { fetchImpl },
    );

    expect(exitCode).toBe(0);
    expect(buffered.readStderr()).toBe("");

    const parsed = JSON.parse(buffered.readStdout());
    expect(parsed).toEqual({
      relayReachable: true,
      status: "ok",
      logsActive: true,
      tracesActive: false,
      logCountLast60s: 1,
      traceCountLast60s: 0,
      lastLogAt: "2026-03-23T18:44:12.381Z",
      lastTraceAt: null,
      baseUrl: "http://example.com",
    });
  });

  it("reports relay unreachable errors", async () => {
    const buffered = createBufferedIo();
    const fetchImpl = (async () => {
      throw new TypeError("connect ECONNREFUSED 127.0.0.1:4200");
    }) as typeof fetch;

    const exitCode = await runCli(["status"], buffered.io, { fetchImpl });

    expect(exitCode).toBe(1);
    expect(buffered.readStdout()).toBe("");
    expect(buffered.readStderr()).toContain("request failed");
  });

  it("reports timeout errors", async () => {
    const buffered = createBufferedIo();
    const fetchImpl = (() =>
      new Promise<Response>(() => {
        // Intentionally unresolved to exercise the real request timeout path.
      })) as typeof fetch;

    const exitCode = await runCli(
      ["status", "--timeout", "10"],
      buffered.io,
      { fetchImpl },
    );

    expect(exitCode).toBe(1);
    expect(buffered.readStderr()).toContain("request timed out");
  });

  it("rejects unknown flags", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(["status", "--wat"], buffered.io);

    expect(exitCode).toBe(2);
    expect(buffered.readStdout()).toBe("");
    expect(buffered.readStderr()).toContain("unknown flag: --wat");
  });
});
