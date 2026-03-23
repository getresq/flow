import { describe, expect, it } from "bun:test";

import { extractLogRowsFromEnvelope, parseEnvelope } from "../lib/ws.js";

describe("websocket helpers", () => {
  it("parses snapshot and batch envelopes", () => {
    expect(
      parseEnvelope(JSON.stringify({ type: "snapshot", events: [] })),
    ).toEqual({
      type: "snapshot",
      events: [],
    });
    expect(
      parseEnvelope(JSON.stringify({ type: "batch", events: [] })),
    ).toEqual({
      type: "batch",
      events: [],
    });
  });

  it("deduplicates rows by sequence across envelopes", () => {
    const seenSeq = new Set<number>();
    const payload = JSON.stringify({
      type: "snapshot",
      events: [
        {
          type: "log",
          seq: 7,
          timestamp: "2026-03-23T18:41:02.110Z",
          message: "fetched 12 Gmail threads",
          attributes: {
            flow_id: "mail-pipeline",
            run_id: "thread-201",
            stage_id: "incoming.fetch_threads",
          },
        },
      ],
    });

    const firstRows = extractLogRowsFromEnvelope({
      raw: payload,
      flowId: "mail-pipeline",
      filters: { attrs: [] },
      seenSeq,
    });
    const secondRows = extractLogRowsFromEnvelope({
      raw: payload,
      flowId: "mail-pipeline",
      filters: { attrs: [] },
      seenSeq,
    });

    expect(firstRows).toHaveLength(1);
    expect(secondRows).toHaveLength(0);
  });

  it("filters rows to the requested flow", () => {
    const rows = extractLogRowsFromEnvelope({
      raw: JSON.stringify({
        type: "batch",
        events: [
          {
            type: "log",
            seq: 1,
            timestamp: "2026-03-23T18:41:02.110Z",
            message: "mail event",
            attributes: {
              flow_id: "mail-pipeline",
              run_id: "thread-201",
            },
          },
          {
            type: "log",
            seq: 2,
            timestamp: "2026-03-23T18:41:02.110Z",
            message: "other event",
            attributes: {
              flow_id: "other-flow",
              run_id: "thread-999",
            },
          },
        ],
      }),
      flowId: "mail-pipeline",
      filters: { attrs: [] },
      seenSeq: new Set<number>(),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.flowId).toBe("mail-pipeline");
  });
});
