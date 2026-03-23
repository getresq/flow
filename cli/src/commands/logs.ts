import {
  DEFAULT_LOG_WINDOW,
  resolveBaseUrl,
  resolveOutputMode,
  resolveTimeout,
  resolveWindow,
} from "../lib/config.js";
import { parseAttributeFilter, matchesLogFilters } from "../lib/filters.js";
import { preferredStageLabel, fetchHistoryRows } from "../lib/history.js";
import { BadArgumentError, EXIT_CODES } from "../lib/errors.js";
import { streamLogRows, type WebSocketFactory } from "../lib/ws.js";
import {
  printJson,
  printJsonl,
  renderAlignedRows,
  writeStdout,
  type CliIo,
} from "../lib/output.js";
import type { CliLogRow } from "../types.js";

export const LOGS_HELP = `Usage:
  resq-flow logs <subcommand> [options]

Subcommands:
  list                List recent log rows
  tail                Stream live log rows
`;

export const LOGS_LIST_HELP = `Usage:
  resq-flow logs list --flow <flow-id> [options]

Options:
  --help              Show help
  --flow <flow-id>    Flow ID to query
  --window <window>   Time window (<number><unit>, where unit is s, m, or h)
  --attr <key=value>  Exact attribute filter (repeatable)
  --query <text>      Search term
  --limit <n>         Maximum rows to request
  --json              Emit JSON output
  --jsonl             Emit JSONL output
  --url <base-url>    Relay base URL
`;

export const LOGS_TAIL_HELP = `Usage:
  resq-flow logs tail --flow <flow-id> [options]

Options:
  --help              Show help
  --flow <flow-id>    Flow ID to stream
  --attr <key=value>  Exact attribute filter (repeatable)
  --query <text>      Search term
  --jsonl             Emit JSONL output
  --url <base-url>    Relay base URL
`;

interface LogsListOptions {
  help: boolean;
  flow?: string;
  window?: string;
  attrs: string[];
  query?: string;
  limit?: string;
  json: boolean;
  jsonl: boolean;
  url?: string;
  timeout?: string;
}

interface LogsTailOptions {
  help: boolean;
  flow?: string;
  attrs: string[];
  query?: string;
  jsonl: boolean;
  url?: string;
}

export interface LogsCommandDependencies {
  fetchImpl?: typeof fetch | undefined;
  websocketFactory?: WebSocketFactory | undefined;
}

export async function runLogsCommand(
  args: string[],
  io: CliIo,
  dependencies: LogsCommandDependencies = {},
): Promise<number> {
  if (args.length === 0 || (args.length === 1 && args[0] === "--help")) {
    writeStdout(io, LOGS_HELP.trimEnd());
    return EXIT_CODES.OK;
  }

  const [subcommand, ...rest] = args;
  switch (subcommand) {
    case "list":
      return runLogsListCommand(rest, io, dependencies);
    case "tail":
      return runLogsTailCommand(rest, io, dependencies);
    default:
      throw new BadArgumentError(`unknown logs command: ${subcommand}`);
  }
}

async function runLogsListCommand(
  args: string[],
  io: CliIo,
  dependencies: LogsCommandDependencies,
): Promise<number> {
  const options = parseLogsListArgs(args);
  if (options.help) {
    writeStdout(io, LOGS_LIST_HELP.trimEnd());
    return EXIT_CODES.OK;
  }

  if (!options.flow) {
    throw new BadArgumentError("--flow is required");
  }

  const baseUrl = resolveBaseUrl(options.url);
  const timeoutMs = resolveTimeout(options.timeout);
  const outputMode = resolveOutputMode({
    json: options.json,
    jsonl: options.jsonl,
  });
  const rows = await fetchHistoryRows({
    baseUrl,
    flowId: options.flow,
    window: resolveWindow(options.window ?? DEFAULT_LOG_WINDOW),
    query: options.query,
    limit: resolveLimit(options.limit),
    timeoutMs,
    fetchImpl: dependencies.fetchImpl,
  });
  const filters = {
    attrs: options.attrs.map(parseAttributeFilter),
    query: options.query,
  };
  const filtered = rows.filter((row) => matchesLogFilters(row, filters));

  if (outputMode === "json") {
    printJson(io, filtered);
    return EXIT_CODES.OK;
  }

  if (outputMode === "jsonl") {
    printJsonl(io, filtered);
    return EXIT_CODES.OK;
  }

  if (filtered.length === 0) {
    writeStdout(io, "No matching logs found.");
    return EXIT_CODES.OK;
  }

  for (const line of renderLogsListRows(filtered)) {
    writeStdout(io, line);
  }

  return EXIT_CODES.OK;
}

async function runLogsTailCommand(
  args: string[],
  io: CliIo,
  dependencies: LogsCommandDependencies,
): Promise<number> {
  const options = parseLogsTailArgs(args);
  if (options.help) {
    writeStdout(io, LOGS_TAIL_HELP.trimEnd());
    return EXIT_CODES.OK;
  }

  if (!options.flow) {
    throw new BadArgumentError("--flow is required");
  }

  const baseUrl = resolveBaseUrl(options.url);
  const filters = {
    attrs: options.attrs.map(parseAttributeFilter),
    query: options.query,
  };
  const controller = new AbortController();
  const handleSignal = () => controller.abort();

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

  try {
    await streamLogRows({
      baseUrl,
      flowId: options.flow,
      filters,
      signal: controller.signal,
      websocketFactory: dependencies.websocketFactory,
      onRow: (row) => {
        if (options.jsonl) {
          printJsonl(io, [row]);
          return;
        }

        writeStdout(io, renderTailRow(row));
      },
    });
  } finally {
    process.removeListener("SIGINT", handleSignal);
    process.removeListener("SIGTERM", handleSignal);
  }

  return EXIT_CODES.OK;
}

export function renderLogsListRows(rows: CliLogRow[]): string[] {
  return renderAlignedRows(
    rows.map((row) => [
      row.timestamp,
      row.flowId,
      row.runId ?? "-",
      preferredStageLabel(row),
      row.status ?? "-",
      row.message,
    ]),
  );
}

export function renderTailRow(row: CliLogRow): string {
  const time = row.timestamp.length >= 19 ? row.timestamp.slice(11, 19) : row.timestamp;
  const stage = preferredStageLabel(row).padEnd(22);
  const run = (row.runId ?? "-").padEnd(12);
  const status = (row.status ?? "-").padEnd(5);
  return `[${time}] ${stage}  ${run}  ${status}  ${row.message}`;
}

function parseLogsListArgs(args: string[]): LogsListOptions {
  const options: LogsListOptions = {
    help: false,
    attrs: [],
    json: false,
    jsonl: false,
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

    if (arg === "--jsonl") {
      options.jsonl = true;
      continue;
    }

    if (arg === "--attr") {
      const value = args[index + 1];
      if (!value) {
        throw new BadArgumentError("missing value for --attr");
      }
      options.attrs.push(value);
      index += 1;
      continue;
    }

    if (
      arg === "--flow" ||
      arg === "--window" ||
      arg === "--query" ||
      arg === "--limit" ||
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
        case "--window":
          options.window = value;
          break;
        case "--query":
          options.query = value;
          break;
        case "--limit":
          options.limit = value;
          break;
        case "--url":
          options.url = value;
          break;
        case "--timeout":
          options.timeout = value;
          break;
        default:
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

function parseLogsTailArgs(args: string[]): LogsTailOptions {
  const options: LogsTailOptions = {
    help: false,
    attrs: [],
    jsonl: false,
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

    if (arg === "--jsonl") {
      options.jsonl = true;
      continue;
    }

    if (arg === "--json") {
      throw new BadArgumentError("--json is not supported for logs tail");
    }

    if (arg === "--attr") {
      const value = args[index + 1];
      if (!value) {
        throw new BadArgumentError("missing value for --attr");
      }
      options.attrs.push(value);
      index += 1;
      continue;
    }

    if (arg === "--flow" || arg === "--query" || arg === "--url") {
      const value = args[index + 1];
      if (!value) {
        throw new BadArgumentError(`missing value for ${arg}`);
      }

      switch (arg) {
        case "--flow":
          options.flow = value;
          break;
        case "--query":
          options.query = value;
          break;
        case "--url":
          options.url = value;
          break;
        default:
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

function resolveLimit(raw?: string): number | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new BadArgumentError(`invalid limit: ${raw}`);
  }

  return value;
}
