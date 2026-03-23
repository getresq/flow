import { describe, expect, it } from "bun:test";

import { readCliVersion, runCli } from "../index.js";

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

describe("CLI smoke", () => {
  it("prints top-level help", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(["--help"], buffered.io);

    expect(exitCode).toBe(0);
    expect(buffered.readStdout()).toContain("resq-flow <command> [options]");
    expect(buffered.readStdout()).toContain("status");
    expect(buffered.readStdout()).toContain("logs");
    expect(buffered.readStderr()).toBe("");
  });

  it("prints version", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(["--version"], buffered.io);

    expect(exitCode).toBe(0);
    expect(buffered.readStdout().trim()).toBe(readCliVersion());
    expect(buffered.readStderr()).toBe("");
  });

  it("rejects unknown commands", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(["wat"], buffered.io);

    expect(exitCode).toBe(2);
    expect(buffered.readStdout()).toBe("");
    expect(buffered.readStderr()).toContain("unknown command: wat");
  });

  it("shows logs command help", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(["logs", "--help"], buffered.io);

    expect(exitCode).toBe(0);
    expect(buffered.readStdout()).toContain("resq-flow logs <subcommand>");
  });

  it("shows status command help", async () => {
    const buffered = createBufferedIo();

    const exitCode = await runCli(["status", "--help"], buffered.io);

    expect(exitCode).toBe(0);
    expect(buffered.readStdout()).toContain("resq-flow status [options]");
  });
});
