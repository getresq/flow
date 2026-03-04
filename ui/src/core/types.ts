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

export type NodeStatus = 'idle' | 'active' | 'success' | 'error'

export interface NodeStyle {
  color?: string
  icon?: string
  borderStyle?: 'solid' | 'dashed'
}

export type HandlePosition = 'top' | 'right' | 'bottom' | 'left'

export interface NodeHandleConfig {
  position: HandlePosition
  type?: 'source' | 'target' | 'both'
  id?: string
}

export interface FlowNodeConfig {
  id: string
  type: NodeShape
  label: string
  sublabel?: string
  bullets?: string[]
  style?: NodeStyle
  position: { x: number; y: number }
  size?: { width: number; height?: number }
  minSize?: { width: number; height: number }
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
  type?: 'animated' | 'dashed'
  animated?: boolean
}

export interface SpanMapping {
  [pattern: string]: string
}

export interface FlowConfig {
  id: string
  name: string
  description?: string
  nodes: FlowNodeConfig[]
  edges: FlowEdgeConfig[]
  spanMapping: SpanMapping
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

export interface LogEntry {
  timestamp: string
  level: LogLevel
  nodeId?: string
  message: string
  status?: 'ok' | 'error'
  durationMs?: number
  attributes?: Record<string, unknown>
  eventType: FlowEvent['type']
}

export interface SpanEntry {
  spanName: string
  nodeId: string
  traceId: string
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
