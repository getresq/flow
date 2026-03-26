import type {
  CliLogRow,
  JsonObject,
  JsonValue,
  LogReadScope,
  RelayFlowEvent,
} from "../types.js";

export function readExplicitFlowId(
  attributes: JsonObject | undefined,
): string | undefined {
  return readStringValue(attributes?.flow_id);
}

export function readMatchedFlowIds(
  event: Pick<RelayFlowEvent, "matched_flow_ids">,
): string[] | undefined {
  const values = event.matched_flow_ids?.filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  return values && values.length > 0 ? values : undefined;
}

export function eventMatchesScope(
  event: Pick<RelayFlowEvent, "attributes" | "matched_flow_ids">,
  scope: LogReadScope,
): boolean {
  if (scope.kind === "all") {
    return true;
  }

  const explicitFlowId = readExplicitFlowId(event.attributes);
  if (explicitFlowId) {
    return explicitFlowId === scope.flowId;
  }

  return readMatchedFlowIds(event)?.includes(scope.flowId) ?? false;
}

export function rowMatchesScope(row: CliLogRow, scope: LogReadScope): boolean {
  if (scope.kind === "all") {
    return true;
  }

  if (row.flowId) {
    return row.flowId === scope.flowId;
  }

  return row.matchedFlowIds?.includes(scope.flowId) ?? false;
}

export function displayFlowLabel(row: CliLogRow): string {
  if (row.flowId) {
    return row.flowId;
  }

  if (row.matchedFlowIds && row.matchedFlowIds.length > 0) {
    return row.matchedFlowIds.join(",");
  }

  return "global";
}

function readStringValue(value: JsonValue | undefined): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}
