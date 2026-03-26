import { BadArgumentError } from "./errors.js";
import { formatJsonValue } from "./output.js";
import type { CliLogRow, JsonValue } from "../types.js";

export interface AttributeFilter {
  key: string;
  value: string;
}

export interface LogFilters {
  attrs: AttributeFilter[];
  query?: string | undefined;
}

export function parseAttributeFilter(raw: string): AttributeFilter {
  const separatorIndex = raw.indexOf("=");
  if (separatorIndex <= 0 || separatorIndex === raw.length - 1) {
    throw new BadArgumentError(
      `invalid --attr filter: ${raw} (expected key=value)`,
    );
  }

  return {
    key: raw.slice(0, separatorIndex),
    value: raw.slice(separatorIndex + 1),
  };
}

export function matchesLogFilters(row: CliLogRow, filters: LogFilters): boolean {
  if (!matchesAttributeFilters(row, filters.attrs)) {
    return false;
  }

  if (!matchesQuery(row, filters.query)) {
    return false;
  }

  return true;
}

export function matchesAttributeFilters(
  row: CliLogRow,
  filters: AttributeFilter[],
): boolean {
  return filters.every((filter) => {
    const value = row.attributes[filter.key];
    return normalizeAttributeValue(value) === filter.value;
  });
}

export function matchesQuery(row: CliLogRow, query?: string): boolean {
  const normalizedQuery = query?.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const haystacks = [
    row.timestamp,
    row.flowId,
    row.matchedFlowIds?.join(" "),
    row.runId,
    row.traceId,
    row.stageId,
    row.stageName,
    row.componentId,
    row.status,
    row.message,
    ...Object.entries(row.attributes).flatMap(([key, value]) => [
      key,
      normalizeAttributeValue(value),
      `${key}=${normalizeAttributeValue(value)}`,
    ]),
  ];

  return haystacks.some(
    (value) => value !== undefined && value.toLowerCase().includes(normalizedQuery),
  );
}

function normalizeAttributeValue(value: JsonValue | undefined): string | undefined {
  return formatJsonValue(value);
}
