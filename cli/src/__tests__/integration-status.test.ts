import { describe, expect, it } from "bun:test";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "node:net";

const cliDir = fileURLToPath(new URL("../../", import.meta.url));
const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const relayDir = join(repoDir, "relay");
const relayBinaryPath = join(
  relayDir,
  "target",
  "debug",
  process.platform === "win32" ? "resq-flow-relay.exe" : "resq-flow-relay",
);

describe("CLI integration: status", () => {
  it(
    "runs the compiled status command against a real relay",
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

      try {
        const human = await runCli(["status", "--url", relay.baseUrl]);
        expect(human.exitCode).toBe(0);
        expect(human.stdout).toContain("Relay: reachable");
        expect(human.stdout).toContain(`Base URL: ${relay.baseUrl}`);
        expect(human.stderr).toBe("");

        const json = await runCli(["status", "--url", relay.baseUrl, "--json"]);
        expect(json.exitCode).toBe(0);
        expect(json.stderr).toBe("");
        expect(JSON.parse(json.stdout)).toMatchObject({
          relayReachable: true,
          status: "ok",
          baseUrl: relay.baseUrl,
        });
      } finally {
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
