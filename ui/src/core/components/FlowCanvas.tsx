import {
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type NodeMouseHandler,
} from '@xyflow/react'
import { useEffect, useMemo, useState } from 'react'

import { edgeTypes } from '../edges'
import { computeElkLayout } from '../layout/elkLayout'
import { nodeTypes } from '../nodes'
import type { FlowEdge, FlowNode } from '../nodes/types'
import type { FlowConfig, LogEntry, NodeRuntimeStatus, SpanEntry } from '../types'

function mapFlowNodes(
  flow: FlowConfig,
  nodeStatuses: Map<string, NodeRuntimeStatus>,
  nodeLogMap: Map<string, LogEntry[]>,
  selectedNodeId?: string,
  elkPositions?: Map<string, { x: number; y: number }>,
): FlowNode[] {
  return flow.nodes.map((node) => {
    const status = nodeStatuses.get(node.id)

    return {
      id: node.id,
      type: node.type,
      position: elkPositions?.get(node.id) ?? node.position,
      parentId: node.parentId,
      selectable: node.selectable ?? true,
      draggable: node.draggable ?? true,
      data: {
        label: node.label,
        sublabel: node.sublabel,
        bullets: node.bullets,
        style: node.style,
        handles: node.handles,
        status,
        counter: status?.counter,
        logs: nodeLogMap.get(node.id) ?? [],
        resizable: node.resizable,
        minSize: node.minSize,
      },
      style: {
        width: node.size?.width,
        height: node.size?.height,
        zIndex: node.type === 'group' ? 0 : 10,
        outline: selectedNodeId === node.id ? '2px solid rgba(56, 189, 248, 0.8)' : undefined,
        outlineOffset: selectedNodeId === node.id ? '2px' : undefined,
      },
      extent: node.parentId ? 'parent' : undefined,
    }
  })
}

function mapFlowEdges(flow: FlowConfig, activeEdges: Set<string>): FlowEdge[] {
  return flow.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    label: edge.label,
    type: edge.type ?? 'smoothstep',
    animated: edge.animated,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: edge.type === 'dashed' ? '#94a3b8' : '#64748b',
      width: 16,
      height: 16,
    },
    data: {
      active: activeEdges.has(edge.id),
    },
    zIndex: 5,
  }))
}

interface FlowCanvasProps {
  flow: FlowConfig
  nodeStatuses: Map<string, NodeRuntimeStatus>
  activeEdges: Set<string>
  nodeLogMap: Map<string, LogEntry[]>
  nodeSpans: Map<string, SpanEntry[]>
  selectedNodeId?: string
  onSelectNode: (nodeId?: string) => void
}

export function FlowCanvas({
  flow,
  nodeStatuses,
  activeEdges,
  nodeLogMap,
  selectedNodeId,
  onSelectNode,
}: FlowCanvasProps) {
  const [elkPositions, setElkPositions] = useState<Map<string, { x: number; y: number }> | null>(null)

  const initialNodes = useMemo(
    () => mapFlowNodes(flow, nodeStatuses, nodeLogMap, selectedNodeId, elkPositions ?? undefined),
    [flow, nodeStatuses, nodeLogMap, selectedNodeId, elkPositions],
  )
  const initialEdges = useMemo(() => mapFlowEdges(flow, activeEdges), [activeEdges, flow])

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(initialEdges)

  useEffect(() => {
    setNodes(mapFlowNodes(flow, nodeStatuses, nodeLogMap, selectedNodeId, elkPositions ?? undefined))
  }, [flow, nodeLogMap, nodeStatuses, selectedNodeId, setNodes, elkPositions])

  useEffect(() => {
    setEdges(mapFlowEdges(flow, activeEdges))
  }, [activeEdges, flow, setEdges])

  const handleNodeClick: NodeMouseHandler = (_, node) => {
    onSelectNode(node.id)
  }

  return (
    <div className="relative h-full w-full">
      <div className="absolute left-3 top-3 z-20 flex gap-2">
        <button
          type="button"
          className="rounded border border-slate-700 bg-slate-900/95 px-2 py-1 text-[10px] text-slate-200"
          onClick={() => {
            const payload = nodes.reduce<Record<string, { x: number; y: number }>>((acc, node) => {
              acc[node.id] = node.position
              return acc
            }, {})

            // Manual layout iteration helper.
            // eslint-disable-next-line no-console
            console.log('save positions', payload)
          }}
        >
          Save positions
        </button>

        <button
          type="button"
          className="rounded border border-slate-700 bg-slate-900/95 px-2 py-1 text-[10px] text-slate-200"
          onClick={() => {
            computeElkLayout(flow.nodes, flow.edges).then(setElkPositions).catch(console.error)
          }}
        >
          Re-layout
        </button>
      </div>

      <ReactFlow
        fitView
        fitViewOptions={{
          maxZoom: 1.1,
          padding: 0.12,
          nodes: nodes.filter((node) => node.type !== 'group'),
        }}
        minZoom={0.2}
        maxZoom={1.6}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onPaneClick={() => onSelectNode(undefined)}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ zIndex: 5 }}
        proOptions={{ hideAttribution: true }}
        className="bg-slate-950"
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1.2} color="#1e293b" />
      </ReactFlow>
    </div>
  )
}
