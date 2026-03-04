import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  MarkerType,
  PanOnScrollMode,
  ReactFlow,
  SelectionMode,
  useEdgesState,
  type NodeChange,
  type NodeMouseHandler,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { edgeTypes } from '../edges'
import { computeElkLayout } from '../layout/elkLayout'
import { nodeTypes } from '../nodes'
import type { FlowEdge, FlowNode } from '../nodes/types'
import type { FlowConfig, LogEntry, NodeRuntimeStatus, SpanEntry, ThemeMode } from '../types'

interface FocusState {
  nodeIds: Set<string> | null
  edgeIds: Set<string> | null
}

type CanvasInteractionMode = 'pointer' | 'pan'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName
  return (
    target.isContentEditable ||
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    Boolean(target.closest('[contenteditable="true"]'))
  )
}

function resolveFocusState(
  flow: FlowConfig,
  nodeStatuses: Map<string, NodeRuntimeStatus>,
  activeEdges: Set<string>,
  focusActivePath: boolean,
  selectedNodeIds?: Set<string>,
): FocusState {
  if (!focusActivePath) {
    return { nodeIds: null, edgeIds: null }
  }

  const focusNodeIds = new Set<string>()

  if (selectedNodeIds && selectedNodeIds.size > 0) {
    for (const nodeId of selectedNodeIds.values()) {
      focusNodeIds.add(nodeId)
    }
  }

  for (const [nodeId, status] of nodeStatuses.entries()) {
    if (status.status !== 'idle') {
      focusNodeIds.add(nodeId)
    }
  }

  const edgeLookup = new Map(flow.edges.map((edge) => [edge.id, edge]))
  for (const edgeId of activeEdges.values()) {
    const edge = edgeLookup.get(edgeId)
    if (!edge) {
      continue
    }
    focusNodeIds.add(edge.source)
    focusNodeIds.add(edge.target)
  }

  if (focusNodeIds.size === 0) {
    return { nodeIds: null, edgeIds: null }
  }

  const expandedNodeIds = new Set(focusNodeIds)
  const focusEdgeIds = new Set<string>()
  for (const edge of flow.edges) {
    if (activeEdges.has(edge.id) || focusNodeIds.has(edge.source) || focusNodeIds.has(edge.target)) {
      focusEdgeIds.add(edge.id)
      expandedNodeIds.add(edge.source)
      expandedNodeIds.add(edge.target)
    }
  }

  return {
    nodeIds: expandedNodeIds,
    edgeIds: focusEdgeIds,
  }
}

function mapFlowNodes(
  flow: FlowConfig,
  nodeStatuses: Map<string, NodeRuntimeStatus>,
  nodeLogMap: Map<string, LogEntry[]>,
  focusNodeIds: Set<string> | null,
  selectedNodeIds: Set<string>,
  runtimePositions: Map<string, { x: number; y: number }>,
  elkPositions?: Map<string, { x: number; y: number }>,
): FlowNode[] {
  return flow.nodes.map((node) => {
    const status = nodeStatuses.get(node.id)
    const dimmed = Boolean(focusNodeIds && !focusNodeIds.has(node.id))
    const selected = selectedNodeIds.has(node.id)
    const runtimePosition = runtimePositions.get(node.id)

    return {
      id: node.id,
      type: node.type,
      position: runtimePosition ?? elkPositions?.get(node.id) ?? node.position,
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
        counter: node.style?.icon === 'queue' ? (status?.counter ?? 0) : undefined,
        logs: nodeLogMap.get(node.id) ?? [],
        resizable: node.resizable,
        minSize: node.minSize,
      },
      style: {
        width: node.size?.width,
        height: node.type === 'group' ? node.size?.height : undefined,
        zIndex: node.type === 'group' ? 0 : selected ? 20 : 10,
        opacity: dimmed ? (node.type === 'group' ? 0.08 : 0.22) : 1,
        filter: dimmed ? 'saturate(0.5)' : undefined,
        transition: 'opacity 220ms ease, filter 220ms ease, outline 220ms ease',
        outline: selected ? '2px solid rgba(56, 189, 248, 0.8)' : undefined,
        outlineOffset: selected ? '2px' : undefined,
      },
      extent: node.parentId ? 'parent' : undefined,
      selected,
    }
  })
}

function mapFlowEdges(flow: FlowConfig, activeEdges: Set<string>, focusEdgeIds: Set<string> | null): FlowEdge[] {
  return flow.edges.map((edge) => {
    const active = activeEdges.has(edge.id)
    const dimmed = Boolean(focusEdgeIds && !focusEdgeIds.has(edge.id))
    const markerColor = dimmed ? '#334155' : edge.type === 'dashed' ? '#94a3b8' : '#64748b'

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      label: edge.label,
      type: edge.type ?? 'default',
      animated: edge.animated,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: markerColor,
        width: 16,
        height: 16,
      },
      style: {
        stroke: active ? '#38bdf8' : dimmed ? '#334155' : '#64748b',
        strokeOpacity: dimmed ? 0.2 : 1,
        strokeWidth: active ? 1.8 : 1.2,
        transition: 'stroke 220ms ease, stroke-opacity 220ms ease, stroke-width 220ms ease',
      },
      data: {
        active,
        dimmed,
      },
      zIndex: 5,
    }
  })
}

interface FlowCanvasProps {
  flow: FlowConfig
  nodeStatuses: Map<string, NodeRuntimeStatus>
  activeEdges: Set<string>
  focusActivePath: boolean
  theme: ThemeMode
  nodeLogMap: Map<string, LogEntry[]>
  nodeSpans: Map<string, SpanEntry[]>
  selectedNodeId?: string
  onSelectNode: (nodeId?: string) => void
}

export function FlowCanvas({
  flow,
  nodeStatuses,
  activeEdges,
  focusActivePath,
  theme,
  nodeLogMap,
  selectedNodeId,
  onSelectNode,
}: FlowCanvasProps) {
  const [elkPositions, setElkPositions] = useState<Map<string, { x: number; y: number }> | null>(null)
  const [interactionMode, setInteractionMode] = useState<CanvasInteractionMode>('pan')
  const [runtimePositions, setRuntimePositions] = useState<Map<string, { x: number; y: number }>>(new Map())
  const [saveState, setSaveState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
    () => new Set(selectedNodeId ? [selectedNodeId] : []),
  )

  useEffect(() => {
    setElkPositions(null)
    setRuntimePositions(new Map())
    setSelectedNodeIds(new Set())
    setSaveState('idle')
  }, [flow.id])

  useEffect(() => {
    if (saveState === 'idle') {
      return
    }

    const timer = window.setTimeout(() => {
      setSaveState('idle')
    }, 1_500)

    return () => window.clearTimeout(timer)
  }, [saveState])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (isEditableTarget(event.target)) {
        return
      }

      const pressed = event.key.toLowerCase()
      if (pressed === 'v') {
        setInteractionMode('pointer')
      }
      if (pressed === 'h') {
        setInteractionMode('pan')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!selectedNodeId) {
      return
    }

    setSelectedNodeIds((previous) => {
      if (previous.size === 1 && previous.has(selectedNodeId)) {
        return previous
      }
      return new Set([selectedNodeId])
    })
  }, [selectedNodeId])

  const focusState = useMemo(
    () => resolveFocusState(flow, nodeStatuses, activeEdges, focusActivePath, selectedNodeIds),
    [activeEdges, flow, focusActivePath, nodeStatuses, selectedNodeIds],
  )

  const initialNodes = useMemo(
    () =>
      mapFlowNodes(
        flow,
        nodeStatuses,
        nodeLogMap,
        focusState.nodeIds,
        selectedNodeIds,
        runtimePositions,
        elkPositions ?? undefined,
      ),
    [flow, nodeStatuses, nodeLogMap, focusState.nodeIds, selectedNodeIds, runtimePositions, elkPositions],
  )
  const initialEdges = useMemo(
    () => mapFlowEdges(flow, activeEdges, focusState.edgeIds),
    [activeEdges, flow, focusState.edgeIds],
  )

  const [nodes, setNodes] = useState<FlowNode[]>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(initialEdges)

  useEffect(() => {
    setNodes(
      mapFlowNodes(
        flow,
        nodeStatuses,
        nodeLogMap,
        focusState.nodeIds,
        selectedNodeIds,
        runtimePositions,
        elkPositions ?? undefined,
      ),
    )
  }, [
    flow,
    nodeLogMap,
    nodeStatuses,
    focusState.nodeIds,
    selectedNodeIds,
    runtimePositions,
    setNodes,
    elkPositions,
  ])

  useEffect(() => {
    setEdges(mapFlowEdges(flow, activeEdges, focusState.edgeIds))
  }, [activeEdges, flow, focusState.edgeIds, setEdges])

  const handleNodeClick: NodeMouseHandler = (event, node) => {
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      return
    }

    setSelectedNodeIds(new Set([node.id]))
    onSelectNode(node.id)
  }

  const handleSelectionChange = useCallback(
    ({ nodes: currentSelection }: { nodes: FlowNode[] }) => {
      const nextSelectedIds = new Set(currentSelection.map((node) => node.id))
      setSelectedNodeIds(nextSelectedIds)

      if (currentSelection.length === 1) {
        onSelectNode(currentSelection[0].id)
        return
      }

      onSelectNode(undefined)
    },
    [onSelectNode],
  )

  const handlePaneClick = useCallback(() => {
    setSelectedNodeIds(new Set())
    onSelectNode(undefined)
  }, [onSelectNode])

  const handleNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      setNodes((currentNodes) => {
        const nextNodes = applyNodeChanges(changes, currentNodes)
        const nextNodeById = new Map(nextNodes.map((node) => [node.id, node]))

        setRuntimePositions((previous) => {
          let changed = false
          const next = new Map(previous)

          for (const change of changes) {
            if (change.type === 'position') {
              if (change.dragging) {
                continue
              }

              const updatedNode = nextNodeById.get(change.id)
              if (!updatedNode) {
                continue
              }

              const { x, y } = updatedNode.position
              if (!Number.isFinite(x) || !Number.isFinite(y)) {
                continue
              }

              const previousPosition = next.get(change.id)
              if (previousPosition?.x === x && previousPosition.y === y) {
                continue
              }

              next.set(change.id, { x, y })
              changed = true
              continue
            }

            if (change.type === 'remove' && next.has(change.id)) {
              next.delete(change.id)
              changed = true
            }
          }

          return changed ? next : previous
        })

        return nextNodes
      })
    },
    [setNodes],
  )

  const handleSavePositions = useCallback(async () => {
    const payload = nodes.reduce<Record<string, { x: number; y: number }>>((acc, node) => {
      acc[node.id] = node.position
      return acc
    }, {})

    const serialized = JSON.stringify(payload, null, 2)

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable')
      }

      await navigator.clipboard.writeText(serialized)
      setSaveState('copied')
    } catch {
      setSaveState('failed')
      // Fallback for environments where clipboard is blocked.
      // eslint-disable-next-line no-console
      console.log('save positions', payload)
    }
  }, [nodes])

  return (
    <div className="relative h-full w-full">
      <div className="absolute left-3 top-3 z-20 flex gap-2">
        <button
          type="button"
          title="Copy current positions JSON to clipboard"
          className={`rounded border px-2 py-1 text-[10px] ${
            saveState === 'copied'
              ? 'border-emerald-500/70 bg-emerald-900/35 text-emerald-200'
              : saveState === 'failed'
                ? 'border-rose-500/70 bg-rose-900/35 text-rose-200'
                : 'border-slate-700 bg-slate-900/95 text-slate-200'
          }`}
          onClick={() => {
            void handleSavePositions()
          }}
        >
          {saveState === 'copied' ? 'Copied' : saveState === 'failed' ? 'Copy failed' : 'Save positions'}
        </button>

        <button
          type="button"
          className="rounded border border-slate-700 bg-slate-900/95 px-2 py-1 text-[10px] text-slate-200"
          onClick={() => {
            setRuntimePositions(new Map())
            computeElkLayout(flow.nodes, flow.edges).then(setElkPositions).catch(console.error)
          }}
        >
          Re-layout
        </button>

        <div className="ml-1 flex items-center rounded border border-slate-700 bg-slate-900/95 p-0.5">
          <button
            type="button"
            title="Pointer mode (V)"
            aria-label="Pointer mode (V)"
            className={`group relative rounded px-2 py-1 text-[10px] ${
              interactionMode === 'pointer'
                ? 'bg-sky-500/25 text-sky-200'
                : 'text-slate-300 hover:text-slate-100'
            }`}
            onClick={() => setInteractionMode('pointer')}
          >
            Pointer
            <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 -translate-x-1/2 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[9px] font-medium text-slate-200 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
              V
            </span>
          </button>
          <button
            type="button"
            title="Pan mode (H)"
            aria-label="Pan mode (H)"
            className={`group relative rounded px-2 py-1 text-[10px] ${
              interactionMode === 'pan'
                ? 'bg-sky-500/25 text-sky-200'
                : 'text-slate-300 hover:text-slate-100'
            }`}
            onClick={() => setInteractionMode('pan')}
          >
            Pan
            <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 -translate-x-1/2 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[9px] font-medium text-slate-200 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
              H
            </span>
          </button>
        </div>
      </div>

      <ReactFlow
        colorMode={theme}
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
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onPaneClick={handlePaneClick}
        onNodeClick={handleNodeClick}
        onSelectionChange={handleSelectionChange}
        selectionOnDrag={interactionMode === 'pointer'}
        selectionMode={SelectionMode.Partial}
        panOnDrag={interactionMode === 'pan'}
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        zoomOnScroll={false}
        multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ zIndex: 5 }}
        proOptions={{ hideAttribution: true }}
        className={`bg-slate-950 ${interactionMode === 'pointer' ? 'pointer-mode' : 'pan-mode'}`}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={26}
          size={1.2}
          color={theme === 'light' ? '#cbd5e1' : '#1e293b'}
        />
      </ReactFlow>
    </div>
  )
}
