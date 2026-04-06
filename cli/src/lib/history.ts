import { resolveWindow } from "./config.js";
import { requestJson } from "./http.js";
import { readExplicitFlowId, readMatchedFlowIds, rowMatchesScope } from "./scope.js";
import type {
  CliLogRow,
  JsonValue,
  LogReadScope,
  RelayFlowEvent,
  RelayHistoryPayload,
} from "../types.js";

export interface HistoryRequestOptions {
  baseUrl: string;
  scope: LogReadScope;
  window?: string | undefined;
  query?: string | undefined;
  attrs?: string[] | undefined;
  limit?: number | undefined;
  timeoutMs: number;
  fetchImpl?: typeof fetch | undefined;
}

export async function fetchHistoryRows({
  baseUrl,
  scope,
  window,
  query,
  attrs,
  limit,
  timeoutMs,
  fetchImpl,
}: HistoryRequestOptions): Promise<CliLogRow[]> {
  const payload = await requestJson<RelayHistoryPayload>({
    baseUrl,
    path: "/v1/history",
    timeoutMs,
    fetchImpl,
    query: {
      flow_id: scope.kind === "flow" ? scope.flowId : undefined,
      window: resolveWindow(window),
      query,
      attr: attrs && attrs.length > 0 ? attrs : undefined,
      logs_only: true,
      limit,
    },
  });

  return payload.events
    .filter((event) => event.type === "log")
    .map((event) => normalizeLogRow(event))
    .filter((row) => rowMatchesScope(row, scope));
}

export function normalizeLogRow(event: RelayFlowEvent): CliLogRow {
  return {
    seq: event.seq,
    timestamp: event.timestamp,
    flowId: readExplicitFlowId(event.attributes),
    matchedFlowIds: readMatchedFlowIds(event),
    runId: stringAttribute(event.attributes.run_id),
    traceId: event.trace_id,
    stepId: stringAttribute(event.attributes.step_id),
    stepName: stringAttribute(event.attributes.step_name),
    componentId: stringAttribute(event.attributes.component_id),
    status: stringAttribute(event.attributes.status),
    message:
      event.message ??
      stringAttribute(event.attributes.message) ??
      stringAttribute(event.attributes.event) ??
      "",
    attributes: event.attributes,
  };
}

export function preferredStepLabel(row: CliLogRow): string {
  return row.stepId ?? row.stepName ?? row.componentId ?? "-";
}

export function normalizeIdentifierValue(value: JsonValue | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const normalized = String(value).trim();
  if (!normalized || normalized === "0") {
    return undefined;
  }

  return normalized;
}

export function rowAttribute(row: CliLogRow, key: string): string | undefined {
  return normalizeIdentifierValue(row.attributes[key]);
}

export function executionKeyForRow(row: CliLogRow): string | undefined {
  return normalizeIdentifierValue(row.runId) ?? normalizeIdentifierValue(row.traceId);
}

export function compareLogRows(left: CliLogRow, right: CliLogRow): number {
  const leftTime = Date.parse(left.timestamp);
  const rightTime = Date.parse(right.timestamp);

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  const leftSeq = left.seq;
  const rightSeq = right.seq;
  if (typeof leftSeq === "number" && typeof rightSeq === "number" && leftSeq !== rightSeq) {
    return leftSeq - rightSeq;
  }

  return left.timestamp.localeCompare(right.timestamp);
}

export function sortLogRows(rows: CliLogRow[]): CliLogRow[] {
  return [...rows].sort(compareLogRows);
}

export function groupRowsByExecutionKey(rows: CliLogRow[]): Map<string, CliLogRow[]> {
  const groups = new Map<string, CliLogRow[]>();

  for (const row of sortLogRows(rows)) {
    const executionKey = executionKeyForRow(row);
    if (!executionKey) {
      continue;
    }

    const existing = groups.get(executionKey);
    if (existing) {
      existing.push(row);
      continue;
    }

    groups.set(executionKey, [row]);
  }

  return groups;
}

export function selectLatestRunForThread(
  rows: CliLogRow[],
  threadId: string,
): { runId: string; rows: CliLogRow[] } | undefined {
  const normalizedThreadId = threadId.trim();
  if (!normalizedThreadId) {
    return undefined;
  }

  const matchingRows = rows.filter((row) => rowAttribute(row, "thread_id") === normalizedThreadId);
  if (matchingRows.length === 0) {
    return undefined;
  }

  let best:
    | {
        runId: string;
        rows: CliLogRow[];
        lastSeen: number;
      }
    | undefined;

  for (const [runId, groupedRows] of groupRowsByExecutionKey(matchingRows)) {
    const lastRow = groupedRows.at(-1);
    const lastSeen = lastRow ? Date.parse(lastRow.timestamp) : Number.NEGATIVE_INFINITY;
    if (!best || lastSeen >= best.lastSeen) {
      best = {
        runId,
        rows: groupedRows,
        lastSeen,
      };
    }
  }

  if (!best) {
    return undefined;
  }

  return {
    runId: best.runId,
    rows: best.rows,
  };
}

export function stringAttribute(value: JsonValue | undefined): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}
