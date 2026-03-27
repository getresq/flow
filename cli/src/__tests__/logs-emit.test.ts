import { describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";

import { runCli } from "../index.js";

class MockWritableSocket extends EventEmitter {
  sent: string[] = [];

  close(): void {
    this.emit("close");
  }

  send(data: string, cb?: (error?: Error) => void): void {
    this.sent.push(data);
    cb?.();
    queueMicrotask(() => {
      this.close();
    });
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

function createEmitSocket(): MockWritableSocket {
  const socket = new MockWritableSocket();
  queueMicrotask(() => {
    socket.emit("open");
  });
  return socket;
}

describe("resq-flow logs emit", () => {
  it("emits a flow-scoped log with explicit flow_id", async () => {
    const buffered = createBufferedIo();
    const socket = createEmitSocket();

    const exitCode = await runCli(
      [
        "logs",
        "emit",
        "--flow",
        "mail-pipeline",
        "--message",
        "picked thread for analysis",
        "--attr",
        "run_id=thread-301",
        "--attr",
        "stage_id=analyze.decision",
        "--attr",
        "status=ok",
      ],
      buffered.io,
      {
        websocketFactory: () => socket,
      },
    );

    expect(exitCode).toBe(0);
    expect(buffered.readStdout()).toContain("Emitted flow log to mail-pipeline.");
    expect(buffered.readStderr()).toBe("");
    expect(socket.sent).toHaveLength(1);

    const payload = JSON.parse(socket.sent[0]!);
    expect(payload).toMatchObject({
      type: "log",
      message: "picked thread for analysis",
      attributes: {
        flow_id: "mail-pipeline",
        run_id: "thread-301",
        stage_id: "analyze.decision",
        status: "ok",
      },
    });
    expect(typeof payload.timestamp).toBe("string");
  });

  it("emits a global log without flow_id", async () => {
    const buffered = createBufferedIo();
    const socket = createEmitSocket();

    const exitCode = await runCli(
      [
        "logs",
        "emit",
        "--global",
        "--message",
        "debug checkpoint before oauth refresh",
        "--attr",
        "subsystem=mail-auth",
      ],
      buffered.io,
      {
        websocketFactory: () => socket,
      },
    );

    expect(exitCode).toBe(0);
    expect(buffered.readStdout()).toContain("Emitted global log.");
    expect(buffered.readStderr()).toBe("");

    const payload = JSON.parse(socket.sent[0]!);
    expect(payload).toMatchObject({
      type: "log",
      message: "debug checkpoint before oauth refresh",
      attributes: {
        subsystem: "mail-auth",
      },
    });
    expect(payload.attributes.flow_id).toBeUndefined();
  });

  it("requires exactly one of --flow or --global", async () => {
    const missing = createBufferedIo();
    const missingCode = await runCli(
      ["logs", "emit", "--message", "hello"],
      missing.io,
    );
    expect(missingCode).toBe(2);
    expect(missing.readStderr()).toContain(
      "exactly one of --flow <flow-id> or --global is required",
    );

    const conflicting = createBufferedIo();
    const conflictingCode = await runCli(
      ["logs", "emit", "--flow", "mail-pipeline", "--global", "--message", "hello"],
      conflicting.io,
    );
    expect(conflictingCode).toBe(2);
    expect(conflicting.readStderr()).toContain(
      "exactly one of --flow <flow-id> or --global is required",
    );
  });

  it("rejects --attr flow_id to keep scope source-of-truth explicit", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(
      [
        "logs",
        "emit",
        "--global",
        "--message",
        "hello",
        "--attr",
        "flow_id=mail-pipeline",
      ],
      buffered.io,
    );

    expect(exitCode).toBe(2);
    expect(buffered.readStderr()).toContain(
      "flow scope is controlled by --flow or --global",
    );
  });
});
