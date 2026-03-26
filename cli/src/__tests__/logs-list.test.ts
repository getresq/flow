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

function createJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

function createHistoryFetchMock(): typeof fetch {
  return (async () =>
    createJsonResponse({
      from: "2026-03-23T18:00:00.000Z",
      to: "2026-03-23T18:15:00.000Z",
      flow_id: "mail-pipeline",
      events: [
        {
          type: "log",
          timestamp: "2026-03-23T18:41:02.110Z",
          trace_id: "trace-incoming-201",
          message: "fetched 12 Gmail threads",
          attributes: {
            flow_id: "mail-pipeline",
            run_id: "thread-201",
            thread_id: "thread-201",
            stage_id: "incoming.fetch_threads",
            status: "ok",
          },
        },
        {
          type: "log",
          timestamp: "2026-03-23T18:41:06.901Z",
          trace_id: "trace-send-201",
          message: "Gmail API timeout",
          attributes: {
            flow_id: "mail-pipeline",
            run_id: "thread-201",
            thread_id: "thread-201",
            stage_id: "send.provider_call",
            status: "error",
            worker_name: "send-worker",
          },
        },
        {
          type: "log",
          timestamp: "2026-03-23T18:41:09.901Z",
          trace_id: "trace-send-202",
          message: "sent Gmail reply",
          attributes: {
            flow_id: "mail-pipeline",
            run_id: "thread-202",
            thread_id: "thread-202",
            component_id: "send-worker",
            status: "ok",
          },
        },
      ],
      log_count: 3,
      span_count: 0,
      truncated: false,
      warnings: [],
    })) as typeof fetch;
}

function createAllHistoryFetchMock(): typeof fetch {
  return (async () =>
    createJsonResponse({
      from: "2026-03-23T18:00:00.000Z",
      to: "2026-03-23T18:15:00.000Z",
      events: [
        {
          type: "log",
          timestamp: "2026-03-23T18:41:02.110Z",
          trace_id: "trace-debug-201",
          message: "oauth refresh checkpoint",
          attributes: {
            subsystem: "mail-auth",
          },
        },
        {
          type: "log",
          timestamp: "2026-03-23T18:41:06.901Z",
          trace_id: "trace-send-201",
          message: "Gmail API timeout",
          attributes: {
            flow_id: "mail-pipeline",
            run_id: "thread-201",
            thread_id: "thread-201",
            stage_id: "send.provider_call",
            status: "error",
          },
        },
      ],
      log_count: 2,
      span_count: 0,
      truncated: false,
      warnings: [],
    })) as typeof fetch;
}

describe("resq-flow logs list", () => {
  it("prints the default human-readable output", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(
      ["logs", "list", "--flow", "mail-pipeline"],
      buffered.io,
      { fetchImpl: createHistoryFetchMock() },
    );

    expect(exitCode).toBe(0);
    expect(buffered.readStdout()).toContain("2026-03-23T18:41:02.110Z");
    expect(buffered.readStdout()).toContain("mail-pipeline");
    expect(buffered.readStdout()).toContain("thread-201");
    expect(buffered.readStdout()).toContain("incoming.fetch_threads");
    expect(buffered.readStdout()).toContain("Gmail API timeout");
    expect(buffered.readStderr()).toBe("");
  });

  it("prints JSON output", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(
      ["logs", "list", "--flow", "mail-pipeline", "--json"],
      buffered.io,
      { fetchImpl: createHistoryFetchMock() },
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(buffered.readStdout());
    expect(parsed).toHaveLength(3);
    expect(parsed[1]).toMatchObject({
      flowId: "mail-pipeline",
      runId: "thread-201",
      stageId: "send.provider_call",
      status: "error",
      message: "Gmail API timeout",
    });
  });

  it("prints JSONL output", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(
      ["logs", "list", "--flow", "mail-pipeline", "--jsonl"],
      buffered.io,
      { fetchImpl: createHistoryFetchMock() },
    );

    expect(exitCode).toBe(0);
    const lines = buffered
      .readStdout()
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines).toHaveLength(3);
    expect(lines[2]).toMatchObject({
      runId: "thread-202",
      componentId: "send-worker",
      message: "sent Gmail reply",
    });
  });

  it("filters with repeated --attr", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(
      [
        "logs",
        "list",
        "--flow",
        "mail-pipeline",
        "--attr",
        "thread_id=thread-201",
        "--attr",
        "status=error",
        "--json",
      ],
      buffered.io,
      { fetchImpl: createHistoryFetchMock() },
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(buffered.readStdout());
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      runId: "thread-201",
      status: "error",
      message: "Gmail API timeout",
    });
  });

  it("filters with --query", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(
      [
        "logs",
        "list",
        "--flow",
        "mail-pipeline",
        "--query",
        "timeout",
        "--json",
      ],
      buffered.io,
      { fetchImpl: createHistoryFetchMock() },
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(buffered.readStdout());
    expect(parsed).toHaveLength(1);
    expect(parsed[0].message).toBe("Gmail API timeout");
  });

  it("handles empty results", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(
      [
        "logs",
        "list",
        "--flow",
        "mail-pipeline",
        "--attr",
        "thread_id=missing-thread",
      ],
      buffered.io,
      { fetchImpl: createHistoryFetchMock() },
    );

    expect(exitCode).toBe(0);
    expect(buffered.readStdout()).toContain("No matching logs found.");
    expect(buffered.readStderr()).toBe("");
  });

  it("supports explicit global reads with --all", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(
      ["logs", "list", "--all", "--json"],
      buffered.io,
      { fetchImpl: createAllHistoryFetchMock() },
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(buffered.readStdout());
    expect(parsed).toHaveLength(2);
    expect(parsed[0].flowId).toBeUndefined();
    expect(parsed[0].message).toBe("oauth refresh checkpoint");
    expect(parsed[1]).toMatchObject({
      flowId: "mail-pipeline",
      message: "Gmail API timeout",
    });
  });

  it("requires exactly one of --flow or --all", async () => {
    const buffered = createBufferedIo();

    const missingScopeCode = await runCli(
      ["logs", "list"],
      buffered.io,
      { fetchImpl: createHistoryFetchMock() },
    );
    expect(missingScopeCode).toBe(2);
    expect(buffered.readStderr()).toContain(
      "exactly one of --flow <flow-id> or --all is required",
    );

    const conflicting = createBufferedIo();
    const conflictingCode = await runCli(
      ["logs", "list", "--flow", "mail-pipeline", "--all"],
      conflicting.io,
      { fetchImpl: createHistoryFetchMock() },
    );
    expect(conflictingCode).toBe(2);
    expect(conflicting.readStderr()).toContain(
      "exactly one of --flow <flow-id> or --all is required",
    );
  });
});
