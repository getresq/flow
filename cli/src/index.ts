#!/usr/bin/env node

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { runLogsCommand, LOGS_HELP } from "./commands/logs.js";
import { runStatusCommand, STATUS_HELP } from "./commands/status.js";
import {
  EXIT_CODES,
  BadArgumentError,
  toCliError,
} from "./lib/errors.js";
import {
  createDefaultIo,
  renderHelp,
  writeStderr,
  writeStdout,
  type CliIo,
} from "./lib/output.js";

const MAIN_HELP = renderHelp({
  usage: `Usage:
  resq-flow <command> [options]`,
  sections: [
    {
      title: "Commands:",
      lines: [
        "  status              Show relay status and ingest health",
        "  logs                List, tail, or emit logs",
      ],
    },
    {
      title: "Global Options:",
      lines: [
        "  --help              Show help",
        "  --version           Show version",
      ],
    },
  ],
});

export interface CliRuntime {
  fetchImpl?: typeof fetch | undefined;
  websocketFactory?: import("./lib/ws.js").WebSocketFactory | undefined;
}

export async function runCli(
  argv: string[],
  io: CliIo = createDefaultIo(),
  runtime: CliRuntime = {},
): Promise<number> {
  try {
    const firstArg = argv[0];

    if (firstArg === undefined || firstArg === "--help") {
      writeStdout(io, MAIN_HELP.trimEnd());
      return EXIT_CODES.OK;
    }

    if (firstArg === "--version") {
      writeStdout(io, readCliVersion());
      return EXIT_CODES.OK;
    }

    if (firstArg.startsWith("-")) {
      throw new BadArgumentError(`unknown flag: ${firstArg}`);
    }

    const [command, ...rest] = argv;

    switch (command) {
      case "status":
        return await runStatusCommand(rest, io, {
          fetchImpl: runtime.fetchImpl,
        });
      case "logs":
        return await runLogsCommand(rest, io, {
          fetchImpl: runtime.fetchImpl,
          websocketFactory: runtime.websocketFactory,
        });
      default:
        throw new BadArgumentError(`unknown command: ${command}`);
    }
  } catch (error) {
    const cliError = toCliError(error);
    writeStderr(io, cliError.message);
    return cliError.exitCode;
  }
}

export function readCliVersion(): string {
  const packageJsonUrl = new URL("../package.json", import.meta.url);
  const raw = readFileSync(packageJsonUrl, "utf8");
  const parsed = JSON.parse(raw) as { version?: unknown };
  return typeof parsed.version === "string" ? parsed.version : "0.0.0";
}

async function main(): Promise<void> {
  const exitCode = await runCli(process.argv.slice(2));
  process.exitCode = exitCode;
}

export function isCliEntrypoint(argvPath: string | undefined, moduleUrl: string): boolean {
  if (!argvPath) {
    return false;
  }

  const entryPath = fileURLToPath(moduleUrl);

  try {
    return realpathSync(argvPath) === realpathSync(entryPath);
  } catch {
    return argvPath === entryPath;
  }
}

if (isCliEntrypoint(process.argv[1], import.meta.url)) {
  void main();
}

export { STATUS_HELP, LOGS_HELP, MAIN_HELP };
