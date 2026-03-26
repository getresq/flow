import {
  DEFAULT_LOG_WINDOW,
  resolveBaseUrl,
  resolveOutputMode,
  resolveTimeout,
  resolveWindow,
} from "../lib/config.js";
import { BadArgumentError, EXIT_CODES } from "../lib/errors.js";
import { parseAttributeFilter, matchesLogFilters } from "../lib/filters.js";
import { preferredStageLabel, fetchHistoryRows } from "../lib/history.js";
import {
  printJson,
  printJsonl,
  renderAlignedRows,
  writeStdout,
  type CliIo,
} from "../lib/output.js";
import { displayFlowLabel } from "../lib/scope.js";
import {
  emitLogEvent,
  streamLogRows,
  type WebSocketFactory,
} from "../lib/ws.js";
import type {
  CliLogRow,
  JsonObject,
  LogEmitScope,
  LogReadScope,
  RelayFlowEvent,
} from "../types.js";

export const LOGS_HELP = `Usage:
  resq-flow logs <subcommand> [options]

Subcommands:
  list                List recent log rows
  tail                Stream live log rows
  emit                Emit an ad hoc log event
`;

export const LOGS_LIST_HELP = `Usage:
  resq-flow logs list (--flow <flow-id> | --all) [options]

Options:
  --help              Show help
  --flow <flow-id>    Flow ID to query
  --all               Query logs across all scopes
  --window <window>   Time window (<number><unit>, where unit is s, m, or h)
  --attr <key=value>  Exact attribute filter (repeatable)
  --query <text>      Search term
  --limit <n>         Maximum rows to request
  --json              Emit JSON output
  --jsonl             Emit JSONL output
  --url <base-url>    Relay base URL
`;

export const LOGS_TAIL_HELP = `Usage:
  resq-flow logs tail (--flow <flow-id> | --all) [options]

Options:
  --help              Show help
  --flow <flow-id>    Flow ID to stream
  --all               Stream logs across all scopes
  --attr <key=value>  Exact attribute filter (repeatable)
  --query <text>      Search term
  --jsonl             Emit JSONL output
  --url <base-url>    Relay base URL
`;

export const LOGS_EMIT_HELP = `Usage:
  resq-flow logs emit (--flow <flow-id> | --global) --message <text> [options]

Options:
  --help              Show help
  --flow <flow-id>    Emit a flow-scoped log
  --global            Emit an unscoped global log
  --message <text>    Log message to emit
  --attr <key=value>  Extra attributes to attach (repeatable)
  --url <base-url>    Relay base URL
`;

interface LogsListOptions {
  help: boolean;
  flow?: string;
  all: boolean;
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
  all: boolean;
  attrs: string[];
  query?: string;
  jsonl: boolean;
  url?: string;
}

interface LogsEmitOptions {
  help: boolean;
  flow?: string;
  global: boolean;
  message?: string;
  attrs: string[];
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
    case "emit":
      return runLogsEmitCommand(rest, io, dependencies);
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

  const scope = resolveReadScope(options.flow, options.all);
  const baseUrl = resolveBaseUrl(options.url);
  const timeoutMs = resolveTimeout(options.timeout);
  const outputMode = resolveOutputMode({
    json: options.json,
    jsonl: options.jsonl,
  });
  const rows = await fetchHistoryRows({
    baseUrl,
    scope,
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

  const scope = resolveReadScope(options.flow, options.all);
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
      scope,
      filters,
      signal: controller.signal,
      websocketFactory: dependencies.websocketFactory,
      onRow: (row) => {
        if (options.jsonl) {
          printJsonl(io, [row]);
          return;
        }

        writeStdout(io, renderTailRow(row, scope));
      },
    });
  } finally {
    process.removeListener("SIGINT", handleSignal);
    process.removeListener("SIGTERM", handleSignal);
  }

  return EXIT_CODES.OK;
}

async function runLogsEmitCommand(
  args: string[],
  io: CliIo,
  dependencies: LogsCommandDependencies,
): Promise<number> {
  const options = parseLogsEmitArgs(args);
  if (options.help) {
    writeStdout(io, LOGS_EMIT_HELP.trimEnd());
    return EXIT_CODES.OK;
  }

  const scope = resolveEmitScope(options.flow, options.global);
  const message = options.message?.trim();
  if (!message) {
    throw new BadArgumentError("--message is required");
  }

  const baseUrl = resolveBaseUrl(options.url);
  const attributes = buildEmitAttributes(options.attrs.map(parseAttributeFilter), scope);
  const event = buildEmitEvent({
    scope,
    message,
    attributes,
  });

  await emitLogEvent({
    baseUrl,
    event,
    websocketFactory: dependencies.websocketFactory,
  });

  writeStdout(
    io,
    scope.kind === "flow"
      ? `Emitted flow log to ${scope.flowId}.`
      : "Emitted global log.",
  );
  return EXIT_CODES.OK;
}

export function buildEmitEvent({
  scope,
  message,
  attributes,
  timestamp = new Date().toISOString(),
}: {
  scope: LogEmitScope;
  message: string;
  attributes: JsonObject;
  timestamp?: string;
}): RelayFlowEvent {
  const nextAttributes: JsonObject = {
    ...attributes,
  };

  if (scope.kind === "flow") {
    nextAttributes.flow_id = scope.flowId;
  }

  return {
    type: "log",
    timestamp,
    message,
    attributes: nextAttributes,
  };
}

export function renderLogsListRows(rows: CliLogRow[]): string[] {
  return renderAlignedRows(
    rows.map((row) => [
      row.timestamp,
      displayFlowLabel(row),
      row.runId ?? "-",
      preferredStageLabel(row),
      row.status ?? "-",
      row.message,
    ]),
  );
}

export function renderTailRow(row: CliLogRow, scope: LogReadScope): string {
  const time = row.timestamp.length >= 19 ? row.timestamp.slice(11, 19) : row.timestamp;
  const scopePrefix =
    scope.kind === "all"
      ? `${formatTailCell(displayFlowLabel(row), 16)}  `
      : "";
  const stage = formatTailCell(preferredStageLabel(row), 24);
  const run = formatTailCell(row.runId ?? "-", 40);
  const status = formatTailCell(row.status ?? "-", 5);
  return `[${time}] ${scopePrefix}${stage}  ${run}  ${status}  ${row.message}`;
}

function fitTailColumn(value: string, maxWidth: number): string {
  if (value.length <= maxWidth) {
    return value;
  }

  if (maxWidth <= 1) {
    return value.slice(0, maxWidth);
  }

  return `${value.slice(0, maxWidth - 1)}…`;
}

function formatTailCell(value: string, width: number): string {
  return fitTailColumn(value, width).padEnd(width);
}

function parseLogsListArgs(args: string[]): LogsListOptions {
  const options: LogsListOptions = {
    help: false,
    all: false,
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

    if (arg === "--all") {
      options.all = true;
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
    all: false,
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

    if (arg === "--all") {
      options.all = true;
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

function parseLogsEmitArgs(args: string[]): LogsEmitOptions {
  const options: LogsEmitOptions = {
    help: false,
    global: false,
    attrs: [],
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

    if (arg === "--global") {
      options.global = true;
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

    if (arg === "--flow" || arg === "--message" || arg === "--url") {
      const value = args[index + 1];
      if (!value) {
        throw new BadArgumentError(`missing value for ${arg}`);
      }

      switch (arg) {
        case "--flow":
          options.flow = value;
          break;
        case "--message":
          options.message = value;
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

function buildEmitAttributes(
  filters: Array<{ key: string; value: string }>,
  scope: LogEmitScope,
): JsonObject {
  const attributes: JsonObject = {};

  for (const filter of filters) {
    if (filter.key === "flow_id") {
      throw new BadArgumentError(
        "flow scope is controlled by --flow or --global, not --attr flow_id=...",
      );
    }

    attributes[filter.key] = filter.value;
  }

  if (scope.kind === "flow") {
    attributes.flow_id = scope.flowId;
  }

  return attributes;
}

function resolveReadScope(flow: string | undefined, all: boolean): LogReadScope {
  if (flow && all) {
    throw new BadArgumentError(
      "exactly one of --flow <flow-id> or --all is required",
    );
  }

  if (flow) {
    return {
      kind: "flow",
      flowId: flow,
    };
  }

  if (all) {
    return {
      kind: "all",
    };
  }

  throw new BadArgumentError("exactly one of --flow <flow-id> or --all is required");
}

function resolveEmitScope(
  flow: string | undefined,
  global: boolean,
): LogEmitScope {
  if (flow && global) {
    throw new BadArgumentError(
      "exactly one of --flow <flow-id> or --global is required",
    );
  }

  if (flow) {
    return {
      kind: "flow",
      flowId: flow,
    };
  }

  if (global) {
    return {
      kind: "global",
    };
  }

  throw new BadArgumentError(
    "exactly one of --flow <flow-id> or --global is required",
  );
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
