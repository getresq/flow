import { describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";

import { runCli } from "../index.js";

class MockSocket extends EventEmitter {
  close(): void {
    this.emit("close");
  }
}

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

function createStreamingSocket(messages: unknown[]): MockSocket {
  const socket = new MockSocket();

  queueMicrotask(() => {
    socket.emit("open");
    for (const message of messages) {
      socket.emit("message", Buffer.from(JSON.stringify(message)));
    }
    socket.emit("close");
  });

  return socket;
}

describe("resq-flow logs tail", () => {
  it("prints human-readable streaming output", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(
      ["logs", "tail", "--flow", "mail-pipeline"],
      buffered.io,
      {
        websocketFactory: () =>
          createStreamingSocket([
            {
              type: "snapshot",
              events: [
                {
                  type: "log",
                  seq: 1,
                  timestamp: "2026-03-23T18:45:02.014Z",
                  message: "classified thread as needs-reply",
                  attributes: {
                    flow_id: "mail-pipeline",
                    run_id: "thread-201",
                    stage_id: "analyze.decision",
                    status: "ok",
                  },
                },
              ],
            },
          ]),
      },
    );

    expect(exitCode).toBe(0);
    expect(buffered.readStdout()).toContain("[18:45:02]");
    expect(buffered.readStdout()).toContain("analyze.decision");
    expect(buffered.readStdout()).toContain("thread-201");
    expect(buffered.readStdout()).toContain("classified thread as needs-reply");
    expect(buffered.readStderr()).toBe("");
  });

  it("applies attr and flow filtering", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(
      [
        "logs",
        "tail",
        "--flow",
        "mail-pipeline",
        "--attr",
        "thread_id=thread-201",
      ],
      buffered.io,
      {
        websocketFactory: () =>
          createStreamingSocket([
            {
              type: "snapshot",
              events: [
                {
                  type: "log",
                  seq: 1,
                  timestamp: "2026-03-23T18:45:02.014Z",
                  message: "classified thread as needs-reply",
                  attributes: {
                    flow_id: "mail-pipeline",
                    run_id: "thread-201",
                    thread_id: "thread-201",
                    stage_id: "analyze.decision",
                    status: "ok",
                  },
                },
                {
                  type: "log",
                  seq: 2,
                  timestamp: "2026-03-23T18:45:03.014Z",
                  message: "sent Gmail reply",
                  attributes: {
                    flow_id: "mail-pipeline",
                    run_id: "thread-202",
                    thread_id: "thread-202",
                    stage_id: "send.provider_call",
                    status: "ok",
                  },
                },
                {
                  type: "log",
                  seq: 3,
                  timestamp: "2026-03-23T18:45:04.014Z",
                  message: "other flow event",
                  attributes: {
                    flow_id: "other-flow",
                    run_id: "thread-999",
                    thread_id: "thread-201",
                    stage_id: "send.provider_call",
                    status: "ok",
                  },
                },
              ],
            },
          ]),
      },
    );

    expect(exitCode).toBe(0);
    expect(buffered.readStdout()).toContain("thread-201");
    expect(buffered.readStdout()).not.toContain("thread-202");
    expect(buffered.readStdout()).not.toContain("other flow event");
  });

  it("emits JSONL output", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(
      ["logs", "tail", "--flow", "mail-pipeline", "--jsonl"],
      buffered.io,
      {
        websocketFactory: () =>
          createStreamingSocket([
            {
              type: "snapshot",
              events: [
                {
                  type: "log",
                  seq: 1,
                  timestamp: "2026-03-23T18:45:02.014Z",
                  message: "classified thread as needs-reply",
                  attributes: {
                    flow_id: "mail-pipeline",
                    run_id: "thread-201",
                    stage_id: "analyze.decision",
                    status: "ok",
                  },
                },
              ],
            },
            {
              type: "batch",
              events: [
                {
                  type: "log",
                  seq: 2,
                  timestamp: "2026-03-23T18:45:05.941Z",
                  message: "sent Gmail reply",
                  attributes: {
                    flow_id: "mail-pipeline",
                    run_id: "thread-201",
                    stage_id: "send.provider_call",
                    status: "ok",
                  },
                },
              ],
            },
          ]),
      },
    );

    expect(exitCode).toBe(0);
    const lines = buffered
      .readStdout()
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      flowId: "mail-pipeline",
      runId: "thread-201",
      stageId: "analyze.decision",
    });
    expect(lines[1]).toMatchObject({
      stageId: "send.provider_call",
      message: "sent Gmail reply",
    });
  });
});
