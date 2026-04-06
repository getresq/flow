export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };

export type JsonObject = Record<string, JsonValue>;

export interface RelayHealthPayload {
  status: string;
}

export interface RelayIngestHealthPayload {
  status: string;
  trace_count_total: number;
  log_count_total: number;
  trace_count_last_60s: number;
  log_count_last_60s: number;
  last_trace_at: string | null;
  last_log_at: string | null;
  traces_recent: boolean;
  logs_recent: boolean;
  recent_buffer_size: number;
  ws_lagged_events_total: number;
}

export interface RelayCapabilitiesPayload {
  service: string;
  bind: string;
  supported_ingest: {
    traces_path: string;
    logs_path: string;
    ws_path: string;
  };
  recommended_mode: string;
  supported_modes: string[];
}

export interface RelayFlowEvent {
  type: string;
  seq?: number | undefined;
  timestamp: string;
  event_kind?: string | undefined;
  node_key?: string | undefined;
  queue_delta?: number | undefined;
  span_name?: string | undefined;
  service_name?: string | undefined;
  trace_id?: string | undefined;
  span_id?: string | undefined;
  parent_span_id?: string | undefined;
  start_time?: string | undefined;
  end_time?: string | undefined;
  duration_ms?: number | undefined;
  attributes: JsonObject;
  message?: string | undefined;
  matched_flow_ids?: string[] | undefined;
}

export interface RelayHistoryPayload {
  from: string;
  to: string;
  query?: string | null;
  flow_id?: string | null;
  events: RelayFlowEvent[];
  log_count: number;
  span_count: number;
  truncated: boolean;
  warnings?: string[];
}

export interface RelayWsEnvelope {
  type: "snapshot" | "batch";
  events: RelayFlowEvent[];
}

export type LogReadScope =
  | {
      kind: "flow";
      flowId: string;
    }
  | {
      kind: "all";
    };

export type LogEmitScope =
  | {
      kind: "flow";
      flowId: string;
    }
  | {
      kind: "global";
    };

export interface CliLogRow {
  seq?: number | undefined;
  timestamp: string;
  flowId?: string | undefined;
  matchedFlowIds?: string[] | undefined;
  runId?: string | undefined;
  traceId?: string | undefined;
  stepId?: string | undefined;
  stepName?: string | undefined;
  componentId?: string | undefined;
  status?: string | undefined;
  message: string;
  attributes: JsonObject;
}

export type RunExplainTarget =
  | {
      kind: "run";
      runId: string;
    }
  | {
      kind: "thread";
      threadId: string;
    };

export type RunExplainOutcome =
  | "completed"
  | "failed"
  | "queued"
  | "in_progress"
  | "stopped";

export interface RunExplainEvidenceRow {
  timestamp: string;
  runId?: string | undefined;
  componentId?: string | undefined;
  stepId?: string | undefined;
  status?: string | undefined;
  message: string;
  attributes: JsonObject;
}

export interface RunExplainSummary {
  flowId: string;
  runId: string;
  target: RunExplainTarget;
  outcome: RunExplainOutcome;
  startedAt?: string | undefined;
  endedAt?: string | undefined;
  nodePath: string[];
  furthestNode?: string | undefined;
  terminalSignal?: string | undefined;
  explanation: string[];
  evidence: RunExplainEvidenceRow[];
  rowCount: number;
}
