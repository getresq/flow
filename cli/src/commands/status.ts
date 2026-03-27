import { resolveBaseUrl, resolveOutputMode, resolveTimeout } from "../lib/config.js";
import { BadArgumentError, EXIT_CODES } from "../lib/errors.js";
import { requestJson } from "../lib/http.js";
import {
  formatEnabled,
  printJson,
  writeStdout,
  type CliIo,
} from "../lib/output.js";
import type {
  RelayCapabilitiesPayload,
  RelayHealthPayload,
  RelayIngestHealthPayload,
} from "../types.js";

export const STATUS_HELP = `Usage:
  resq-flow status [options]

Options:
  --help              Show help
  --url <base-url>    Relay base URL
  --json              Emit JSON output
  --timeout <ms>      Request timeout in milliseconds
`;

interface StatusOptions {
  help: boolean;
  url?: string;
  json: boolean;
  timeout?: string;
}

export interface StatusSummary {
  relayReachable: boolean;
  status: string;
  logsActive: boolean;
  tracesActive: boolean;
  logCountLast60s: number;
  traceCountLast60s: number;
  lastLogAt: string | null;
  lastTraceAt: string | null;
  baseUrl: string;
}

export interface StatusCommandDependencies {
  fetchImpl?: typeof fetch | undefined;
}

export async function runStatusCommand(
  args: string[],
  io: CliIo,
  dependencies: StatusCommandDependencies = {},
): Promise<number> {
  const options = parseStatusArgs(args);
  if (options.help) {
    writeStdout(io, STATUS_HELP.trimEnd());
    return EXIT_CODES.OK;
  }

  const baseUrl = resolveBaseUrl(options.url);
  const timeoutMs = resolveTimeout(options.timeout);
  const outputMode = resolveOutputMode({ json: options.json });

  const [health, ingest] = await Promise.all([
    requestJson<RelayHealthPayload>({
      baseUrl,
      path: "/health",
      timeoutMs,
      fetchImpl: dependencies.fetchImpl,
    }),
    requestJson<RelayIngestHealthPayload>({
      baseUrl,
      path: "/health/ingest",
      timeoutMs,
      fetchImpl: dependencies.fetchImpl,
    }),
    requestJson<RelayCapabilitiesPayload>({
      baseUrl,
      path: "/capabilities",
      timeoutMs,
      fetchImpl: dependencies.fetchImpl,
    }),
  ]);

  const summary = buildStatusSummary({ baseUrl, health, ingest });

  if (outputMode === "json") {
    printJson(io, summary);
  } else {
    for (const line of renderStatusSummary(summary)) {
      writeStdout(io, line);
    }
  }

  return EXIT_CODES.OK;
}

function parseStatusArgs(args: string[]): StatusOptions {
  const options: StatusOptions = {
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

    if (arg === "--url" || arg === "--timeout") {
      const value = args[index + 1];
      if (!value) {
        throw new BadArgumentError(`missing value for ${arg}`);
      }

      if (arg === "--url") {
        options.url = value;
      } else {
        options.timeout = value;
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

export function buildStatusSummary({
  baseUrl,
  health,
  ingest,
}: {
  baseUrl: string;
  health: RelayHealthPayload;
  ingest: RelayIngestHealthPayload;
}): StatusSummary {
  return {
    relayReachable: true,
    status: health.status,
    logsActive: ingest.logs_recent,
    tracesActive: ingest.traces_recent,
    logCountLast60s: ingest.log_count_last_60s,
    traceCountLast60s: ingest.trace_count_last_60s,
    lastLogAt: ingest.last_log_at,
    lastTraceAt: ingest.last_trace_at,
    baseUrl,
  };
}

export function renderStatusSummary(summary: StatusSummary): string[] {
  return [
    `Relay: ${summary.relayReachable ? "reachable" : "unreachable"}`,
    `Status: ${summary.status}`,
    `Logs active: ${formatEnabled(summary.logsActive)}`,
    `Traces active: ${formatEnabled(summary.tracesActive)}`,
    `Log count (last 60s): ${summary.logCountLast60s}`,
    `Trace count (last 60s): ${summary.traceCountLast60s}`,
    `Last log at: ${summary.lastLogAt ?? "none"}`,
    `Last trace at: ${summary.lastTraceAt ?? "none"}`,
    `Base URL: ${summary.baseUrl}`,
  ];
}
