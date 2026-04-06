import {
  DEFAULT_LOG_WINDOW,
  resolveBaseUrl,
  resolveOutputMode,
  resolveTimeout,
  resolveWindow,
} from "../lib/config.js";
import { buildRunExplainSummary, renderRunExplainSummary, selectTargetRun } from "../lib/explain.js";
import { BadArgumentError, EXIT_CODES } from "../lib/errors.js";
import { fetchHistoryRows } from "../lib/history.js";
import { printJson, writeStdout, type CliIo } from "../lib/output.js";
import type { RunExplainTarget } from "../types.js";

export const RUNS_HELP = `Usage:
  resq-flow runs <subcommand> [options]

Subcommands:
  explain             Explain a specific run from recent history
`;

export const RUNS_EXPLAIN_HELP = `Usage:
  resq-flow runs explain --flow <flow-id> (--run <run-id> | --thread <thread-id>) [options]

Options:
  --help              Show help
  --flow <flow-id>    Flow ID to inspect
  --run <run-id>      Exact run ID to explain
  --thread <thread-id>
                      Latest run for the given thread
  --window <window>   Time window (<number><unit>, where unit is s, m, or h)
  --json              Emit JSON output
  --url <base-url>    Relay base URL
  --timeout <ms>      Request timeout in milliseconds
`;

interface RunsExplainOptions {
  help: boolean;
  flow?: string;
  run?: string;
  thread?: string;
  window?: string;
  json: boolean;
  url?: string;
  timeout?: string;
}

export interface RunsCommandDependencies {
  fetchImpl?: typeof fetch | undefined;
}

export async function runRunsCommand(
  args: string[],
  io: CliIo,
  dependencies: RunsCommandDependencies = {},
): Promise<number> {
  if (args.length === 0 || (args.length === 1 && args[0] === "--help")) {
    writeStdout(io, RUNS_HELP.trimEnd());
    return EXIT_CODES.OK;
  }

  const [subcommand, ...rest] = args;
  switch (subcommand) {
    case "explain":
      return runRunsExplainCommand(rest, io, dependencies);
    default:
      throw new BadArgumentError(`unknown runs command: ${subcommand}`);
  }
}

async function runRunsExplainCommand(
  args: string[],
  io: CliIo,
  dependencies: RunsCommandDependencies,
): Promise<number> {
  const options = parseRunsExplainArgs(args);
  if (options.help) {
    writeStdout(io, RUNS_EXPLAIN_HELP.trimEnd());
    return EXIT_CODES.OK;
  }

  const flowId = options.flow?.trim();
  if (!flowId) {
    throw new BadArgumentError("--flow is required");
  }

  const target = resolveExplainTarget(options);
  const baseUrl = resolveBaseUrl(options.url);
  const timeoutMs = resolveTimeout(options.timeout);
  const outputMode = resolveOutputMode({ json: options.json });
  const attrs = buildTargetAttrs(target);

  const rows = await fetchHistoryRows({
    baseUrl,
    scope: { kind: "flow", flowId },
    window: resolveWindow(options.window ?? DEFAULT_LOG_WINDOW),
    attrs,
    timeoutMs,
    fetchImpl: dependencies.fetchImpl,
  });

  const selection = selectTargetRun(rows, target);
  const summary = buildRunExplainSummary({
    flowId,
    rows: selection.rows,
    target,
  });

  if (outputMode === "json") {
    printJson(io, summary);
    return EXIT_CODES.OK;
  }

  for (const line of renderRunExplainSummary(summary)) {
    writeStdout(io, line);
  }

  return EXIT_CODES.OK;
}

function parseRunsExplainArgs(args: string[]): RunsExplainOptions {
  const options: RunsExplainOptions = {
    help: false,
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      break;
    }

    if (arg === "--help") {
      options.help = true;
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (
      arg === "--flow" ||
      arg === "--run" ||
      arg === "--thread" ||
      arg === "--window" ||
      arg === "--url" ||
      arg === "--timeout"
    ) {
      const value = args[index + 1];
      if (!value) {
        throw new BadArgumentError(`missing value for ${arg}`);
      }

      switch (arg) {
        case "--flow":
          options.flow = value;
          break;
        case "--run":
          options.run = value;
          break;
        case "--thread":
          options.thread = value;
          break;
        case "--window":
          options.window = value;
          break;
        case "--url":
          options.url = value;
          break;
        case "--timeout":
          options.timeout = value;
          break;
      }
      index += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new BadArgumentError(`unknown flag: ${arg}`);
    }

    throw new BadArgumentError(`unexpected argument: ${arg}`);
  }

  return options;
}

function resolveExplainTarget(options: RunsExplainOptions): RunExplainTarget {
  const runId = options.run?.trim();
  const threadId = options.thread?.trim();

  if (!runId && !threadId) {
    throw new BadArgumentError("choose exactly one of --run or --thread");
  }

  if (runId && threadId) {
    throw new BadArgumentError("choose exactly one of --run or --thread");
  }

  if (runId) {
    return {
      kind: "run",
      runId,
    };
  }

  return {
    kind: "thread",
    threadId: threadId ?? "",
  };
}

function buildTargetAttrs(target: RunExplainTarget): string[] {
  return target.kind === "run"
    ? [`run_id=${target.runId}`]
    : [`thread_id=${target.threadId}`];
}
