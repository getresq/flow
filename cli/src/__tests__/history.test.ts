import { describe, expect, it } from "bun:test";

import {
  fetchHistoryRows,
  groupRowsByExecutionKey,
  normalizeIdentifierValue,
  selectLatestRunForThread,
  sortLogRows,
} from "../lib/history.js";

function createJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("history normalization", () => {
  it("requests relay history and keeps only log events", async () => {
    const seenUrls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      seenUrls.push(url);

      return createJsonResponse({
        from: "2026-03-23T18:00:00.000Z",
        to: "2026-03-23T18:15:00.000Z",
        flow_id: "mail-pipeline",
        events: [
          {
            type: "span_start",
            timestamp: "2026-03-23T18:41:02.000Z",
            attributes: {
              flow_id: "mail-pipeline",
              run_id: "thread-201",
            },
          },
          {
            type: "log",
            seq: 12,
            timestamp: "2026-03-23T18:41:06.901Z",
            trace_id: "trace-send-201",
            message: "Gmail API timeout",
            attributes: {
              flow_id: "mail-pipeline",
              run_id: "thread-201",
              step_id: "send.provider_call",
              component_id: "send-worker",
              status: "error",
              thread_id: "thread-201",
            },
          },
        ],
        log_count: 1,
        span_count: 1,
        truncated: false,
        warnings: [],
      });
    }) as typeof fetch;

    const rows = await fetchHistoryRows({
      baseUrl: "http://relay.example",
      scope: { kind: "flow", flowId: "mail-pipeline" },
      window: "15m",
      query: "thread-201",
      limit: 25,
      timeoutMs: 500,
      fetchImpl,
    });

    expect(seenUrls).toHaveLength(1);
    const url = new URL(seenUrls[0]!);
    expect(url.pathname).toBe("/v1/history");
    expect(url.searchParams.get("flow_id")).toBe("mail-pipeline");
    expect(url.searchParams.get("window")).toBe("15m");
    expect(url.searchParams.get("query")).toBe("thread-201");
    expect(url.searchParams.get("logs_only")).toBe("true");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.getAll("attr")).toEqual([]);

    expect(rows).toEqual([
      {
        seq: 12,
        timestamp: "2026-03-23T18:41:06.901Z",
        flowId: "mail-pipeline",
        matchedFlowIds: undefined,
        runId: "thread-201",
        traceId: "trace-send-201",
        stepId: "send.provider_call",
        componentId: "send-worker",
        status: "error",
        message: "Gmail API timeout",
        attributes: {
          flow_id: "mail-pipeline",
          run_id: "thread-201",
          step_id: "send.provider_call",
          component_id: "send-worker",
          status: "error",
          thread_id: "thread-201",
        },
      },
    ]);
  });

  it("does not manufacture a flow id for unscoped rows", async () => {
    const fetchImpl = (async () =>
      createJsonResponse({
        from: "2026-03-23T18:00:00.000Z",
        to: "2026-03-23T18:15:00.000Z",
        events: [
          {
            type: "log",
            seq: 14,
            timestamp: "2026-03-23T18:41:06.901Z",
            trace_id: "trace-debug-201",
            message: "oauth refresh checkpoint",
            attributes: {
              subsystem: "mail-auth",
            },
          },
        ],
        log_count: 1,
        span_count: 0,
        truncated: false,
        warnings: [],
      })) as typeof fetch;

    const rows = await fetchHistoryRows({
      baseUrl: "http://relay.example",
      scope: { kind: "all" },
      timeoutMs: 500,
      fetchImpl,
    });

    expect(rows).toEqual([
      {
        seq: 14,
        timestamp: "2026-03-23T18:41:06.901Z",
        flowId: undefined,
        matchedFlowIds: undefined,
        runId: undefined,
        traceId: "trace-debug-201",
        stepId: undefined,
        stepName: undefined,
        componentId: undefined,
        status: undefined,
        message: "oauth refresh checkpoint",
        attributes: {
          subsystem: "mail-auth",
        },
      },
    ]);
  });

  it("forwards repeated attribute filters to relay history", async () => {
    const seenUrls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      seenUrls.push(url);

      return createJsonResponse({
        from: "2026-03-23T18:00:00.000Z",
        to: "2026-03-23T18:15:00.000Z",
        events: [],
        log_count: 0,
        span_count: 0,
        truncated: false,
        warnings: [],
      });
    }) as typeof fetch;

    await fetchHistoryRows({
      baseUrl: "http://relay.example",
      scope: { kind: "flow", flowId: "mail-pipeline" },
      attrs: ["thread_id=thread-201", "status=error"],
      timeoutMs: 500,
      fetchImpl,
    });

    expect(seenUrls).toHaveLength(1);
    const url = new URL(seenUrls[0]!);
    expect(url.searchParams.get("logs_only")).toBe("true");
    expect(url.searchParams.getAll("attr")).toEqual([
      "thread_id=thread-201",
      "status=error",
    ]);
  });

  it("normalizes placeholder identifiers the same way as the UI", () => {
    expect(normalizeIdentifierValue(undefined)).toBeUndefined();
    expect(normalizeIdentifierValue(null)).toBeUndefined();
    expect(normalizeIdentifierValue(0)).toBeUndefined();
    expect(normalizeIdentifierValue("  ")).toBeUndefined();
    expect(normalizeIdentifierValue("thread-201")).toBe("thread-201");
  });

  it("groups rows by canonical execution key and sorts them", () => {
    const groups = groupRowsByExecutionKey([
      {
        timestamp: "2026-03-23T18:41:09.901Z",
        runId: "thread-201",
        traceId: "trace-send-201",
        stepId: "send.final_result",
        message: "sent reply",
        attributes: {},
      },
      {
        timestamp: "2026-03-23T18:41:02.110Z",
        runId: "thread-201",
        traceId: "trace-send-201",
        stepId: "incoming.fetch_threads",
        message: "fetched threads",
        attributes: {},
      },
      {
        timestamp: "2026-03-23T18:41:10.000Z",
        runId: undefined,
        traceId: "trace-other",
        stepId: "other.step",
        message: "other flow row",
        attributes: {},
      },
    ]);

    expect([...groups.keys()]).toEqual(["thread-201", "trace-other"]);
    expect(groups.get("thread-201")?.map((row) => row.message)).toEqual([
      "fetched threads",
      "sent reply",
    ]);
  });

  it("selects the latest run for a thread", () => {
    const rows = sortLogRows([
      {
        timestamp: "2026-03-23T18:41:02.110Z",
        runId: "thread-201-old",
        traceId: "trace-old",
        stepId: "incoming.fetch_threads",
        message: "older thread run",
        attributes: {
          thread_id: "thread-201",
        },
      },
      {
        timestamp: "2026-03-23T18:41:09.901Z",
        runId: "thread-201-new",
        traceId: "trace-new",
        stepId: "send.final_result",
        message: "newer thread run",
        attributes: {
          thread_id: "thread-201",
        },
      },
    ]);

    expect(selectLatestRunForThread(rows, "thread-201")).toMatchObject({
      runId: "thread-201-new",
    });
  });
});
