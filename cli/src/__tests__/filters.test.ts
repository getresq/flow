import { describe, expect, it } from "bun:test";

import {
  matchesAttributeFilters,
  matchesLogFilters,
  parseAttributeFilter,
} from "../lib/filters.js";
import type { CliLogRow } from "../types.js";

const row: CliLogRow = {
  timestamp: "2026-03-23T18:41:06.901Z",
  flowId: "mail-pipeline",
  runId: "thread-201",
  traceId: "trace-send-201",
  stageId: "send.provider_call",
  componentId: "send-worker",
  status: "error",
  message: "Gmail API timeout",
  attributes: {
    flow_id: "mail-pipeline",
    run_id: "thread-201",
    thread_id: "thread-201",
    stage_id: "send.provider_call",
    retryable: true,
  },
};

describe("log filters", () => {
  it("parses repeated attribute filters", () => {
    expect(parseAttributeFilter("thread_id=thread-201")).toEqual({
      key: "thread_id",
      value: "thread-201",
    });
  });

  it("matches repeated attribute filters exactly", () => {
    expect(
      matchesAttributeFilters(row, [
        { key: "thread_id", value: "thread-201" },
        { key: "retryable", value: "true" },
      ]),
    ).toBe(true);
    expect(
      matchesAttributeFilters(row, [
        { key: "thread_id", value: "thread-202" },
      ]),
    ).toBe(false);
  });

  it("matches optional query text across row content", () => {
    expect(matchesLogFilters(row, { attrs: [], query: "timeout" })).toBe(true);
    expect(matchesLogFilters(row, { attrs: [], query: "thread-201" })).toBe(true);
    expect(matchesLogFilters(row, { attrs: [], query: "gmail api" })).toBe(true);
    expect(matchesLogFilters(row, { attrs: [], query: "missing-value" })).toBe(
      false,
    );
  });
});
