import { describe, expect, it } from "bun:test";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createNetServer } from "node:net";
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

describe("CLI integration: runs explain", () => {
  it(
    "runs the compiled explain command against a real relay and history backend",
    async () => {
      ensureBuild("bun", ["run", "build"], cliDir, "CLI build failed");
      ensureBuild(
        "cargo",
        ["build", "--bin", "resq-flow-relay"],
        relayDir,
        "relay build failed",
      );

      const historyPort = await getFreePort();
      const historyServer = await startHistoryServer(historyPort);
      const relayPort = await getFreePort();
      const relay = await startRelay(relayPort, {
        RESQ_FLOW_VLOGS_QUERY_URL: `http://127.0.0.1:${historyPort}/select/logsql/query`,
        RESQ_FLOW_VTRACES_BASE_URL: `http://127.0.0.1:${historyPort}`,
      });

      try {
        const human = await runCli([
          "runs",
          "explain",
          "--flow",
          "mail-pipeline",
          "--thread",
          "thread-201",
          "--url",
          relay.baseUrl,
        ]);
        expect(human.exitCode).toBe(0);
        expect(human.stdout).toContain("Run: thread-201");
        expect(human.stdout).toContain("Outcome: failed");
        expect(human.stdout).toContain("Path: incoming-worker -> extract-worker -> send-worker");
        expect(human.stdout).toContain("First failure was at send-worker");
        expect(human.stderr).toBe("");

        const json = await runCli([
          "runs",
          "explain",
          "--flow",
          "mail-pipeline",
          "--run",
          "thread-202",
          "--url",
          relay.baseUrl,
          "--json",
        ]);
        expect(json.exitCode).toBe(0);
        expect(json.stderr).toBe("");
        expect(JSON.parse(json.stdout)).toMatchObject({
          flowId: "mail-pipeline",
          runId: "thread-202",
          outcome: "completed",
          furthestNode: "send-worker",
        });
      } finally {
        await relay.stop();
        await historyServer.stop();
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
    const server = createNetServer();
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

async function startHistoryServer(port: number): Promise<{
  stop(): Promise<void>;
}> {
  const server = createServer((request, response) => {
    routeHistoryRequest(request, response, port);
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, "127.0.0.1", (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  return {
    async stop() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

function routeHistoryRequest(
  request: IncomingMessage,
  response: ServerResponse,
  port: number,
): void {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/select/logsql/query") {
    const lines = [
      {
        _time: "2026-03-23T18:41:02.110Z",
        event: "flow_event",
        flow_id: "mail-pipeline",
        run_id: "thread-201-old",
        thread_id: "thread-201",
        component_id: "incoming-worker",
        step_id: "incoming.enqueue",
        status: "ok",
        message: "older run queued",
      },
      {
        _time: "2026-03-23T18:41:06.901Z",
        event: "flow_event",
        flow_id: "mail-pipeline",
        run_id: "thread-201",
        thread_id: "thread-201",
        component_id: "incoming-worker",
        step_id: "incoming.fetch_threads",
        status: "ok",
        message: "fetched 12 Gmail threads",
      },
      {
        _time: "2026-03-23T18:41:07.901Z",
        event: "flow_event",
        flow_id: "mail-pipeline",
        run_id: "thread-201",
        thread_id: "thread-201",
        component_id: "extract-worker",
        step_id: "extract.final_result",
        status: "ok",
        message: "extract completed",
      },
      {
        _time: "2026-03-23T18:41:08.901Z",
        event: "flow_event",
        flow_id: "mail-pipeline",
        run_id: "thread-201",
        thread_id: "thread-201",
        component_id: "send-worker",
        step_id: "send.provider_call",
        status: "error",
        message: "Gmail API timeout",
      },
      {
        _time: "2026-03-23T18:41:09.901Z",
        event: "flow_event",
        flow_id: "mail-pipeline",
        run_id: "thread-202",
        thread_id: "thread-202",
        component_id: "send-worker",
        step_id: "send.final_result",
        status: "ok",
        reply_status: "sent",
        draft_status: "sent",
        message: "sent Gmail reply",
      },
    ];

    const query = url.searchParams.get("query") ?? "";
    const backendRunId = query.match(/run_id:"([^"]+)"/)?.[1];
    const backendThreadId = query.match(/thread_id:"([^"]+)"/)?.[1];
    let filteredLines = query.includes('flow_id:"mail-pipeline"')
      ? lines.filter((line) => line.flow_id === "mail-pipeline")
      : lines;

    if (backendRunId) {
      filteredLines = filteredLines.filter((line) => line.run_id === backendRunId);
    }

    if (backendThreadId) {
      filteredLines = filteredLines.filter((line) => line.thread_id === backendThreadId);
    }

    response.writeHead(200, { "content-type": "text/plain" });
    response.end(filteredLines.map((line) => JSON.stringify(line)).join("\n") + "\n");
    return;
  }

  if (url.pathname === "/select/jaeger/api/services") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: [] }));
    return;
  }

  if (url.pathname === "/select/jaeger/api/traces") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: [] }));
    return;
  }

  response.writeHead(404, { "content-type": "text/plain" });
  response.end("not found");
}

async function startRelay(
  port: number,
  extraEnv: Record<string, string>,
): Promise<{
  baseUrl: string;
  stop(): Promise<void>;
}> {
  const child = spawn(relayBinaryPath, [], {
    cwd: relayDir,
    env: {
      ...process.env,
      RESQ_FLOW_BIND: `127.0.0.1:${port}`,
      ...extraEnv,
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

async function runCli(args: string[]): Promise<{
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

  const [exitCode] = (await once(child, "exit")) as [number | null];
  return {
    exitCode: exitCode ?? 0,
    stdout,
    stderr,
  };
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
