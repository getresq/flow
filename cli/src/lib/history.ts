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
  limit?: number | undefined;
  timeoutMs: number;
  fetchImpl?: typeof fetch | undefined;
}

export async function fetchHistoryRows({
  baseUrl,
  scope,
  window,
  query,
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
    stageId: stringAttribute(event.attributes.stage_id),
    stageName: stringAttribute(event.attributes.stage_name),
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

export function preferredStageLabel(row: CliLogRow): string {
  return row.stageId ?? row.stageName ?? row.componentId ?? "-";
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
