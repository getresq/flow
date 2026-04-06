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
          trace_id: "trace-thread-201-old",
          message: "queued older run",
          attributes: {
            flow_id: "mail-pipeline",
            run_id: "thread-201-old",
            thread_id: "thread-201",
            component_id: "incoming-worker",
            step_id: "incoming.enqueue",
            status: "ok",
          },
        },
        {
          type: "log",
          timestamp: "2026-03-23T18:41:06.901Z",
          trace_id: "trace-thread-201",
          message: "fetched 12 Gmail threads",
          attributes: {
            flow_id: "mail-pipeline",
            run_id: "thread-201",
            thread_id: "thread-201",
            component_id: "incoming-worker",
            step_id: "incoming.fetch_threads",
            status: "ok",
          },
        },
        {
          type: "log",
          timestamp: "2026-03-23T18:41:07.901Z",
          trace_id: "trace-thread-201",
          message: "classified thread as needs-reply",
          attributes: {
            flow_id: "mail-pipeline",
            run_id: "thread-201",
            thread_id: "thread-201",
            component_id: "analyze-decision",
            step_id: "analyze.final_result",
            status: "ok",
            reply_status: "needs_review",
            draft_status: "needs_review",
            result_action: "draft_reply",
          },
        },
        {
          type: "log",
          timestamp: "2026-03-23T18:41:08.901Z",
          trace_id: "trace-thread-202",
          message: "sent Gmail reply",
          attributes: {
            flow_id: "mail-pipeline",
            run_id: "thread-202",
            thread_id: "thread-202",
            component_id: "send-worker",
            step_id: "send.final_result",
            status: "ok",
            reply_status: "sent",
            draft_status: "sent",
          },
        },
      ],
      log_count: 4,
      span_count: 0,
      truncated: false,
      warnings: [],
    })) as typeof fetch;
}

describe("resq-flow runs explain", () => {
  it("prints help for the explain subcommand", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(["runs", "explain", "--help"], buffered.io);

    expect(exitCode).toBe(0);
    expect(buffered.readStdout()).toContain("resq-flow runs explain");
    expect(buffered.readStderr()).toBe("");
  });

  it("requires --flow", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(["runs", "explain", "--run", "thread-201"], buffered.io);

    expect(exitCode).toBe(2);
    expect(buffered.readStderr()).toContain("--flow is required");
  });

  it("requires exactly one target selector", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(["runs", "explain", "--flow", "mail-pipeline"], buffered.io);

    expect(exitCode).toBe(2);
    expect(buffered.readStderr()).toContain("choose exactly one of --run or --thread");
  });

  it("rejects both --run and --thread together", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(
      [
        "runs",
        "explain",
        "--flow",
        "mail-pipeline",
        "--run",
        "thread-201",
        "--thread",
        "thread-201",
      ],
      buffered.io,
    );

    expect(exitCode).toBe(2);
    expect(buffered.readStderr()).toContain("choose exactly one of --run or --thread");
  });

  it("renders a human-readable explanation for a run", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(
      ["runs", "explain", "--flow", "mail-pipeline", "--run", "thread-201"],
      buffered.io,
      { fetchImpl: createHistoryFetchMock() },
    );

    expect(exitCode).toBe(0);
    expect(buffered.readStdout()).toContain("Run: thread-201");
    expect(buffered.readStdout()).toContain("Outcome: stopped");
    expect(buffered.readStdout()).toContain("Mail flow routed this thread to manual review before send.");
    expect(buffered.readStdout()).toContain("Path: incoming-worker -> analyze-decision");
    expect(buffered.readStderr()).toBe("");
  });

  it("selects the latest matching run for a thread", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(
      ["runs", "explain", "--flow", "mail-pipeline", "--thread", "thread-201", "--json"],
      buffered.io,
      { fetchImpl: createHistoryFetchMock() },
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(buffered.readStdout());
    expect(parsed).toMatchObject({
      flowId: "mail-pipeline",
      runId: "thread-201",
      outcome: "stopped",
      nodePath: ["incoming-worker", "analyze-decision"],
    });
  });
});
