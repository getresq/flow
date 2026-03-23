import WebSocket, { type RawData } from "ws";

import { normalizeNetworkError, CliError } from "./errors.js";
import { matchesLogFilters, type LogFilters } from "./filters.js";
import { normalizeLogRow } from "./history.js";
import { resolveBaseUrl } from "./config.js";
import type { CliLogRow, RelayFlowEvent, RelayWsEnvelope } from "../types.js";

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface WebSocketLike {
  close(code?: number, data?: string): void;
  on(event: "open", listener: () => void): this;
  on(event: "message", listener: (data: RawData) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "close", listener: () => void): this;
}

export interface StreamLogRowsOptions {
  baseUrl: string;
  flowId: string;
  filters: LogFilters;
  onRow: (row: CliLogRow) => void;
  signal?: AbortSignal | undefined;
  websocketFactory?: WebSocketFactory | undefined;
}

export function buildWebSocketUrl(baseUrl: string): string {
  const url = new URL(resolveBaseUrl(baseUrl));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  return url.toString();
}

export function parseEnvelope(raw: string): RelayWsEnvelope {
  const parsed = JSON.parse(raw) as Partial<RelayWsEnvelope>;
  if (
    (parsed.type !== "snapshot" && parsed.type !== "batch") ||
    !Array.isArray(parsed.events)
  ) {
    throw new CliError("invalid websocket envelope");
  }

  return parsed as RelayWsEnvelope;
}

export function extractLogRowsFromEnvelope({
  raw,
  flowId,
  filters,
  seenSeq,
}: {
  raw: string;
  flowId: string;
  filters: LogFilters;
  seenSeq: Set<number>;
}): CliLogRow[] {
  const envelope = parseEnvelope(raw);
  const rows: CliLogRow[] = [];

  for (const event of envelope.events) {
    if (event.type !== "log") {
      continue;
    }

    if (isDuplicateSequence(event, seenSeq)) {
      continue;
    }

    const row = normalizeLogRow(event, flowId);
    if (row.flowId !== flowId) {
      continue;
    }

    if (!matchesLogFilters(row, filters)) {
      continue;
    }

    rows.push(row);
  }

  return rows;
}

export async function streamLogRows({
  baseUrl,
  flowId,
  filters,
  onRow,
  signal,
  websocketFactory = createWebSocket,
}: StreamLogRowsOptions): Promise<void> {
  const url = buildWebSocketUrl(baseUrl);
  const socket = websocketFactory(url);
  const seenSeq = new Set<number>();

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const finalize = (error?: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      signal?.removeEventListener("abort", handleAbort);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const handleAbort = () => {
      socket.close();
      finalize();
    };

    signal?.addEventListener("abort", handleAbort, { once: true });

    socket.on("open", () => {
      if (signal?.aborted) {
        handleAbort();
      }
    });

    socket.on("message", (data) => {
      try {
        const rows = extractLogRowsFromEnvelope({
          raw: rawDataToString(data),
          flowId,
          filters,
          seenSeq,
        });
        for (const row of rows) {
          onRow(row);
        }
      } catch (error) {
        finalize(error);
      }
    });

    socket.on("error", (error) => {
      if (signal?.aborted) {
        finalize();
        return;
      }

      finalize(normalizeNetworkError(error, url));
    });

    socket.on("close", () => {
      finalize();
    });
  });
}

function createWebSocket(url: string): WebSocketLike {
  return new WebSocket(url);
}

function isDuplicateSequence(event: RelayFlowEvent, seenSeq: Set<number>): boolean {
  if (event.seq === undefined) {
    return false;
  }

  if (seenSeq.has(event.seq)) {
    return true;
  }

  seenSeq.add(event.seq);
  return false;
}

function rawDataToString(data: RawData): string {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }

  return data.toString();
}
