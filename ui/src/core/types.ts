export type NodeShape =
  | 'rectangle'
  | 'roundedRect'
  | 'diamond'
  | 'circle'
  | 'cylinder'
  | 'pill'
  | 'badge'
  | 'octagon'
  | 'group'
  | 'annotation'

export type ThemeMode = 'dark' | 'light'
export type FlowViewMode = 'canvas' | 'metrics' | 'logs'

export type NodeStatus = 'idle' | 'active' | 'success' | 'error'

export interface NodeStyle {
  color?: string
  icon?: string
}

export type NodeSemanticRole =
  | 'trigger'
  | 'queue'
  | 'worker'
  | 'scheduler'
  | 'process'
  | 'decision'
  | 'resource'
  | 'detail'
  | 'group'
  | 'note'

export type HandlePosition = 'top' | 'right' | 'bottom' | 'left'

export interface NodeHandleConfig {
  position: HandlePosition
  type?: 'source' | 'target' | 'both'
  id?: string
}

export type LayoutLane = 'main' | 'branch' | 'sidecar' | 'resource' | 'note'
export type GroupLayoutMode = 'stack' | 'decision-tree'
export type BranchTrack = 'primary' | 'right' | 'left'

export interface AnnotationAnchorConfig {
  targetId: string
  dx?: number
  dy?: number
}

export interface BranchPlacementConfig {
  anchorId: string
  track: BranchTrack
  rank: number
  domain?: string
  column?: number
  dx?: number
  dy?: number
}

export interface FlowNodeLayoutHints {
  lane?: LayoutLane
  order?: number
  groupMode?: GroupLayoutMode
  anchor?: AnnotationAnchorConfig
  branch?: BranchPlacementConfig
}

export interface FlowNodeConfig {
  id: string
  type: NodeShape
  semanticRole?: NodeSemanticRole
  label: string
  sublabel?: string
  description?: string
  notes?: string[]
  bullets?: string[]
  style?: NodeStyle
  position: { x: number; y: number }
  size?: { width: number; height?: number }
  minSize?: { width: number; height: number }
  layout?: FlowNodeLayoutHints
  parentId?: string
  handles?: NodeHandleConfig[]
  draggable?: boolean
  selectable?: boolean
  resizable?: boolean
}

export interface FlowEdgeConfig {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  label?: string
  type?: 'animated'
  animated?: boolean
}

export interface SpanMapping {
  [pattern: string]: string
}

export interface FlowTelemetryContract {
  log_events: string[]
  queue_prefixes: string[]
  function_prefixes: string[]
  worker_prefixes: string[]
  step_prefixes: string[]
  span_prefixes?: string[]
  span_names?: string[]
}

export interface FlowKeepContext {
  parent_spans: boolean
  root_spans: boolean
  error_events: boolean
  unmapped_events_for_kept_traces: boolean
}

export interface FlowContract {
  version: number
  id: string
  name: string
  telemetry: FlowTelemetryContract
  keep_context: FlowKeepContext
}

export interface FlowConfig {
  id: string
  name: string
  description?: string
  contract: FlowContract
  hasGraph: boolean
  nodes: FlowNodeConfig[]
  edges: FlowEdgeConfig[]
  spanMapping: SpanMapping
  producerMapping?: SpanMapping
}

export interface FlowEvent {
  type: 'span_start' | 'span_end' | 'log'
  seq?: number
  event_kind?:
    | 'node_started'
    | 'node_finished'
    | 'queue_enqueued'
    | 'queue_picked'
    | 'log_event'
    | 'event'
  node_key?: string
  queue_delta?: number
  timestamp: string
  span_name?: string
  service_name?: string
  trace_id?: string
  span_id?: string
  parent_span_id?: string
  start_time?: string
  end_time?: string
  duration_ms?: number
  attributes?: Record<string, unknown>
  message?: string
  matched_flow_ids?: string[]
}

export interface NodeRuntimeStatus {
  status: NodeStatus
  durationMs?: number
  durationVisibleUntil?: number
  updatedAt: number
  counter?: number
  lastMessage?: string
}

export type LogLevel = 'info' | 'error'
export type TelemetrySignal = 'critical' | 'meaningful' | 'operational' | 'raw'

export interface LogEntry {
  selectionId?: string
  timestamp: string
  seq?: number
  traceId?: string
  runId?: string
  flowId?: string
  componentId?: string
  stepId?: string
  stepName?: string
  errorClass?: string
  errorCode?: string
  retryable?: boolean
  level: LogLevel
  nodeId?: string
  message: string
  displayMessage?: string
  status?: 'ok' | 'error'
  durationMs?: number
  signal: TelemetrySignal
  defaultVisible: boolean
  attributes?: Record<string, unknown>
  eventType: FlowEvent['type']
}

export interface SpanEntry {
  spanName: string
  nodeId: string
  traceId: string
  runId?: string
  flowId?: string
  componentId?: string
  spanId: string
  parentSpanId?: string
  startTime: string
  endTime?: string
  durationMs?: number
  status: NodeStatus
  attributes?: Record<string, unknown>
}

export interface RelayConnectionState {
  events: FlowEvent[]
  connected: boolean
  reconnecting: boolean
  resetKey: number
  totalEventCount: number
  wasTruncated: boolean
  clearEvents: () => void
}

export interface EventPlaybackState {
  events: FlowEvent[]
  speed: number
  paused: boolean
  pendingCount: number
  setSpeed: (speed: number) => void
  togglePaused: () => void
  pause: () => void
  resume: () => void
  stepForward: () => void
  clearPlayback: () => void
}

export interface FlowAnimationState {
  nodeStatuses: Map<string, NodeRuntimeStatus>
  activeEdges: Set<string>
  clearStatuses: () => void
}

export interface LogStreamState {
  globalLogs: LogEntry[]
  nodeLogMap: Map<string, LogEntry[]>
  clearSession: () => void
}

export interface TraceTimelineState {
  nodeSpans: Map<string, SpanEntry[]>
  traceTree: Map<string, SpanEntry[]>
  clearTraces: () => void
}

export type TraceStatus = 'running' | 'success' | 'error' | 'partial'

export interface TraceIdentifiers {
  flowId?: string
  runId?: string
  componentId?: string
  mailboxOwner?: string
  provider?: string
  threadId?: string
  replyDraftId?: string
  jobId?: string
  requestId?: string
  contentHash?: string
  journeyKey?: string
}

export interface TraceStep {
  instanceId?: string
  stepId: string
  label: string
  nodeId?: string
  startSeq: number
  endSeq: number
  startTs: string
  endTs?: string
  durationMs?: number
  status: TraceStatus
  attempt?: number
  errorSummary?: string
  attrs?: Record<string, unknown>
}

export interface TraceJourney {
  traceId: string
  rootEntity?: string
  startedAt: string
  endedAt?: string
  durationMs?: number
  status: TraceStatus
  steps: TraceStep[]
  nodePath: string[]
  errorSummary?: string
  lastUpdatedAt: string
  eventCount: number
  identifiers: TraceIdentifiers
  pinned?: boolean
}

export interface TraceJourneyState {
  journeys: TraceJourney[]
  journeyByTraceId: Map<string, TraceJourney>
  clearJourneys: () => void
}
