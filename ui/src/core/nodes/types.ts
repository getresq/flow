import type { Edge, Node } from '@xyflow/react';

import type { LogEntry, NodeHandleConfig, NodeRuntimeStatus, NodeStyle } from '../types';

export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  eyebrow?: string;
  sublabel?: string;
  description?: string;
  notes?: string[];
  bullets?: string[];
  style?: NodeStyle;
  status?: NodeRuntimeStatus;
  logs?: LogEntry[];
  handles?: NodeHandleConfig[];
  counter?: number;
  resizable?: boolean;
  minSize?: { width: number; height: number };
}

export type FlowNode = Node<FlowNodeData>;

export interface FlowEdgeData extends Record<string, unknown> {
  active?: boolean;
  dimmed?: boolean;
}

export type FlowEdge = Edge<FlowEdgeData>;
