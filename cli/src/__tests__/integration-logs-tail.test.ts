import { describe, expect, it } from "bun:test";
import { createServer } from "node:net";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
const cliDir = fileURLToPath(new URL("../../", import.meta.url));
const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const relayDir = join(repoDir, "relay");
const relayBinaryPath = join(
  relayDir,
  "target",
  "debug",
  process.platform === "win32" ? "resq-flow-relay.exe" : "resq-flow-relay",
);

describe("CLI integration: logs tail", () => {
  it(
    "delivers flow-scoped emits to flow-scoped tail",
    async () => {
      ensureBuild("bun", ["run", "build"], cliDir, "CLI build failed");
      ensureBuild(
        "cargo",
        ["build", "--bin", "resq-flow-relay"],
        relayDir,
        "relay build failed",
      );

      const port = await getFreePort();
      const relay = await startRelay(port);
      const tail = startCliTail([
        "logs",
        "tail",
        "--flow",
        "mail-pipeline",
        "--url",
        relay.baseUrl,
        "--jsonl",
      ]);

      try {
        await delay(250);
        const firstEmit = await runBuiltCli([
          "logs",
          "emit",
          "--flow",
          "mail-pipeline",
          "--message",
          "classified thread as needs-reply",
          "--attr",
          "run_id=thread-201",
          "--attr",
          "thread_id=thread-201",
          "--attr",
          "stage_id=analyze.decision",
          "--attr",
          "status=ok",
          "--url",
          relay.baseUrl,
        ]);
        expect(firstEmit.exitCode).toBe(0);

        const secondEmit = await runBuiltCli([
          "logs",
          "emit",
          "--flow",
          "mail-pipeline",
          "--message",
          "sent Gmail reply",
          "--attr",
          "run_id=thread-201",
          "--attr",
          "thread_id=thread-201",
          "--attr",
          "stage_id=send.provider_call",
          "--attr",
          "status=ok",
          "--url",
          relay.baseUrl,
        ]);
        expect(secondEmit.exitCode).toBe(0);

        await waitForOutput(tail, (stdout) => stdout.trim().split("\n").length >= 2);
        tail.child.kill("SIGINT");
        const result = await tail.result;

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe("");

        const lines = result.stdout
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
      } finally {
        if (tail.child.exitCode === null && !tail.child.killed) {
          tail.child.kill("SIGINT");
          await tail.result.catch(() => undefined);
        }
        await relay.stop();
      }
    },
    120_000,
  );

  it(
    "shows global emits in --all and keeps them out of flow tails",
    async () => {
      ensureBuild("bun", ["run", "build"], cliDir, "CLI build failed");
      ensureBuild(
        "cargo",
        ["build", "--bin", "resq-flow-relay"],
        relayDir,
        "relay build failed",
      );

      const port = await getFreePort();
      const relay = await startRelay(port);
      const allTail = startCliTail(["logs", "tail", "--all", "--url", relay.baseUrl, "--jsonl"]);
      const flowTail = startCliTail([
        "logs",
        "tail",
        "--flow",
        "mail-pipeline",
        "--url",
        relay.baseUrl,
        "--jsonl",
      ]);

      try {
        await delay(250);
        const emit = await runBuiltCli([
          "logs",
          "emit",
          "--global",
          "--message",
          "debug checkpoint before oauth refresh",
          "--attr",
          "subsystem=mail-auth",
          "--url",
          relay.baseUrl,
        ]);
        expect(emit.exitCode).toBe(0);

        await waitForOutput(allTail, (stdout) => stdout.trim().split("\n").length >= 1);
        await delay(250);

        allTail.child.kill("SIGINT");
        flowTail.child.kill("SIGINT");
        const allResult = await allTail.result;
        const flowResult = await flowTail.result;

        expect(allResult.exitCode).toBe(0);
        expect(flowResult.exitCode).toBe(0);
        expect(allResult.stderr).toBe("");
        expect(flowResult.stderr).toBe("");

        const lines = allResult.stdout
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        expect(lines).toHaveLength(1);
        expect(lines[0].flowId).toBeUndefined();
        expect(lines[0]).toMatchObject({
          message: "debug checkpoint before oauth refresh",
          attributes: {
            subsystem: "mail-auth",
          },
        });
        expect(flowResult.stdout.trim()).toBe("");
      } finally {
        if (allTail.child.exitCode === null && !allTail.child.killed) {
          allTail.child.kill("SIGINT");
          await allTail.result.catch(() => undefined);
        }
        if (flowTail.child.exitCode === null && !flowTail.child.killed) {
          flowTail.child.kill("SIGINT");
          await flowTail.result.catch(() => undefined);
        }
        await relay.stop();
      }
    },
    120_000,
  );
});

function ensureBuild(
  command: string,
  args: string[],
  cwd: string,
  label: string,
): void {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(
      `${label}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

async function getFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("failed to resolve free port"));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function startRelay(port: number): Promise<{
  baseUrl: string;
  stop(): Promise<void>;
}> {
  const child = spawn(relayBinaryPath, [], {
    cwd: relayDir,
    env: {
      ...process.env,
      RESQ_FLOW_BIND: `127.0.0.1:${port}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk.toString();
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl, child, () => logs);

  return {
    baseUrl,
    async stop() {
      if (child.exitCode !== null || child.killed) {
        return;
      }

      child.kill("SIGINT");
      const exited = await waitForExit(child, 5_000);
      if (!exited) {
        child.kill("SIGKILL");
        await once(child, "exit");
      }
    },
  };
}

async function waitForHealth(
  baseUrl: string,
  child: ChildProcessWithoutNullStreams,
  readLogs: () => string,
): Promise<void> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`relay exited before becoming healthy\n${readLogs()}`);
    }

    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // keep polling until timeout
    }

    await delay(100);
  }

  throw new Error(`timed out waiting for relay /health at ${baseUrl}\n${readLogs()}`);
}

function startCliTail(args: string[]): {
  child: ChildProcessWithoutNullStreams;
  readStdout(): string;
  result: Promise<{ exitCode: number; stdout: string; stderr: string }>;
} {
  const child = spawn(
    "node",
    ["dist/index.js", ...args],
    {
      cwd: cliDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  return {
    child,
    readStdout() {
      return stdout;
    },
    result: once(child, "exit").then(([exitCode]) => ({
      exitCode: (exitCode as number | null) ?? 0,
      stdout,
      stderr,
    })),
  };
}

async function waitForOutput(
  tail: { readStdout(): string },
  predicate: (stdout: string) => boolean,
): Promise<void> {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    if (predicate(tail.readStdout())) {
      return;
    }

    await delay(50);
  }

  throw new Error(`timed out waiting for tail output\n${tail.readStdout()}`);
}

async function waitForExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode !== null) {
    return true;
  }

  try {
    await Promise.race([
      once(child, "exit"),
      delay(timeoutMs).then(() => {
        throw new Error("exit timeout");
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function runBuiltCli(args: string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const child = spawn("node", ["dist/index.js", ...args], {
    cwd: cliDir,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const [exitCode] = await once(child, "exit");
  return {
    exitCode: (exitCode as number | null) ?? 0,
    stdout,
    stderr,
  };
}
