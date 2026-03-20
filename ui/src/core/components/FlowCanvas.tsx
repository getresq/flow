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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { edgeTypes } from '../edges'
import { applyBranchTemplatePositions } from '../layout/branchPlacement'
import { applyLaneTemplatePositions } from '../layout/lanePlacement'
import { computeElkLayout, type LayoutGeometry } from '../layout/elkLayout'
import { nodeTypes } from '../nodes'
import type { FlowEdge, FlowNode } from '../nodes/types'
import type { FlowConfig, LogEntry, NodeRuntimeStatus, SpanEntry, ThemeMode } from '../types'

interface FocusState {
  nodeIds: Set<string> | null
  edgeIds: Set<string> | null
}

type CanvasInteractionMode = 'pointer' | 'pan'
type Position = { x: number; y: number }
type AnnotationAnchor = { anchorId: string; dx: number; dy: number }

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

function areSetsEqual<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  if (left.size !== right.size) {
    return false
  }

  for (const value of left.values()) {
    if (!right.has(value)) {
      return false
    }
  }

  return true
}

function resolveFocusState(
  flow: FlowConfig,
  nodeStatuses: Map<string, NodeRuntimeStatus>,
  activeEdges: Set<string>,
  focusActivePath: boolean,
  selectedNodeIds?: Set<string>,
  traceFocusNodeIds?: Set<string>,
  traceFocusEdgeIds?: Set<string>,
): FocusState {
  if (traceFocusNodeIds && traceFocusNodeIds.size > 0) {
    const nodeIds = new Set(traceFocusNodeIds)
    const edgeIds = new Set<string>()
    const allowedEdgeIds = traceFocusEdgeIds ?? null

    for (const edge of flow.edges) {
      if (allowedEdgeIds && !allowedEdgeIds.has(edge.id)) {
        continue
      }
      if (nodeIds.has(edge.source) || nodeIds.has(edge.target)) {
        edgeIds.add(edge.id)
        nodeIds.add(edge.source)
        nodeIds.add(edge.target)
      }
    }

    return { nodeIds, edgeIds }
  }

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

function nodeDimensions(node: FlowConfig['nodes'][number]) {
  return {
    width: node.size?.width ?? 200,
    height: node.size?.height ?? (node.type === 'diamond' ? 144 : node.type === 'pill' ? 44 : 64),
  }
}

function inferAnnotationAnchors(flow: FlowConfig): Map<string, AnnotationAnchor> {
  const anchors = new Map<string, AnnotationAnchor>()
  const candidates = flow.nodes.filter((node) => node.type !== 'annotation')
  const nodeById = new Map(flow.nodes.map((node) => [node.id, node]))

  const resolveAbsoluteConfigPosition = (nodeId: string): Position => {
    const node = nodeById.get(nodeId)
    if (!node) {
      return { x: 0, y: 0 }
    }

    if (!node.parentId) {
      return node.position
    }

    const parentPosition = resolveAbsoluteConfigPosition(node.parentId)
    return {
      x: parentPosition.x + node.position.x,
      y: parentPosition.y + node.position.y,
    }
  }

  for (const annotation of flow.nodes.filter((node) => node.type === 'annotation')) {
    if (annotation.layout?.anchor) {
      anchors.set(annotation.id, {
        anchorId: annotation.layout.anchor.targetId,
        dx: annotation.layout.anchor.dx ?? 0,
        dy: annotation.layout.anchor.dy ?? 0,
      })
      continue
    }

    let best: { nodeId: string; distance: number; dx: number; dy: number } | null = null

    for (const candidate of candidates) {
      const position = resolveAbsoluteConfigPosition(candidate.id)
      const dims = nodeDimensions(candidate)
      const center = {
        x: position.x + dims.width / 2,
        y: position.y + dims.height / 2,
      }
      const dx = annotation.position.x - position.x
      const dy = annotation.position.y - position.y
      const distance = Math.hypot(annotation.position.x - center.x, annotation.position.y - center.y)

      if (!best || distance < best.distance) {
        best = { nodeId: candidate.id, distance, dx, dy }
      }
    }

    if (best) {
      anchors.set(annotation.id, { anchorId: best.nodeId, dx: best.dx, dy: best.dy })
    }
  }

  return anchors
}

function resolveAbsolutePosition(
  nodeId: string,
  nodeById: Map<string, FlowConfig['nodes'][number]>,
  directPositions: Map<string, Position>,
  cache: Map<string, Position>,
): Position {
  const cached = cache.get(nodeId)
  if (cached) {
    return cached
  }

  const node = nodeById.get(nodeId)
  if (!node) {
    return { x: 0, y: 0 }
  }

  const position = directPositions.get(nodeId) ?? node.position
  if (!node.parentId) {
    cache.set(nodeId, position)
    return position
  }

  const parentPosition = resolveAbsolutePosition(node.parentId, nodeById, directPositions, cache)
  const absolute = {
    x: parentPosition.x + position.x,
    y: parentPosition.y + position.y,
  }
  cache.set(nodeId, absolute)
  return absolute
}

function mapFlowNodes(
  flow: FlowConfig,
  nodeStatuses: Map<string, NodeRuntimeStatus>,
  nodeLogMap: Map<string, LogEntry[]>,
  focusNodeIds: Set<string> | null,
  selectedNodeIds: Set<string>,
  runtimePositions: Map<string, { x: number; y: number }>,
  annotationAnchors: Map<string, AnnotationAnchor>,
  elkLayout?: Map<string, LayoutGeometry>,
  isEntering?: boolean,
  layoutReady = true,
): FlowNode[] {
  const nodeById = new Map(flow.nodes.map((node) => [node.id, node]))
  const directPositions = new Map<string, Position>()

  for (const node of flow.nodes) {
    directPositions.set(
      node.id,
      runtimePositions.get(node.id) ?? (elkLayout?.get(node.id) ? { x: elkLayout.get(node.id)!.x, y: elkLayout.get(node.id)!.y } : node.position),
    )
  }

  const lanePositionedNodes = applyLaneTemplatePositions(flow.nodes, directPositions, runtimePositions)
  const positionedNodes = applyBranchTemplatePositions(flow.nodes, lanePositionedNodes, runtimePositions)

  const absolutePositionCache = new Map<string, Position>()
  let nonGroupIndex = 0
  return flow.nodes.map((node) => {
    const isNonGroup = node.type !== 'group'
    const staggerIndex = isNonGroup ? nonGroupIndex++ : 0
    const status = nodeStatuses.get(node.id)
    const dimmed = Boolean(focusNodeIds && !focusNodeIds.has(node.id))
    const selected = selectedNodeIds.has(node.id)
    const runtimePosition = runtimePositions.get(node.id)
    const layoutGeometry = elkLayout?.get(node.id)
    let position = runtimePosition ?? positionedNodes.get(node.id) ?? (layoutGeometry ? { x: layoutGeometry.x, y: layoutGeometry.y } : node.position)

    if (node.type === 'annotation') {
      const anchor = annotationAnchors.get(node.id)
      if (anchor) {
        const anchorPosition = resolveAbsolutePosition(anchor.anchorId, nodeById, positionedNodes, absolutePositionCache)
        position = {
          x: anchorPosition.x + anchor.dx,
          y: anchorPosition.y + anchor.dy,
        }
      }
    }

    const defaultDraggable = node.type !== 'annotation' && layoutReady
    const defaultSelectable = node.type !== 'annotation'

    return {
      id: node.id,
      type: node.type,
      position,
      parentId: node.parentId,
      selectable: node.selectable ?? defaultSelectable,
      draggable: node.draggable ?? defaultDraggable,
      data: {
        label: node.label,
        semanticRole: node.semanticRole,
        sublabel: node.sublabel,
        description: node.description,
        notes: node.notes,
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
        width: layoutGeometry?.width ?? node.size?.width,
        height: layoutGeometry?.height ?? (node.type === 'group' ? node.size?.height : undefined),
        zIndex: node.type === 'group' ? 0 : selected ? 20 : 10,
        opacity: dimmed ? (node.type === 'group' ? 0.08 : 0.22) : 1,
        filter: dimmed ? 'saturate(0.5)' : undefined,
        transition: 'opacity 220ms ease, filter 220ms ease, outline 220ms ease',
        animation: isEntering && isNonGroup
          ? `nodeEntrance 300ms ease-out ${staggerIndex * 30}ms backwards`
          : undefined,
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
    const markerColor = dimmed
      ? 'var(--color-edge-dimmed)'
      : edge.type === 'dashed'
        ? 'var(--color-marker-dashed)'
        : 'var(--color-marker)'

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
        stroke: active ? 'var(--color-active)' : dimmed ? 'var(--color-edge-dimmed)' : 'var(--color-marker)',
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
  traceFocusNodeIds?: Set<string>
  traceFocusEdgeIds?: Set<string>
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
  traceFocusNodeIds,
  traceFocusEdgeIds,
  theme,
  nodeLogMap,
  selectedNodeId,
  onSelectNode,
}: FlowCanvasProps) {
  const [elkLayout, setElkLayout] = useState<Map<string, LayoutGeometry> | null>(null)
  const [layoutReady, setLayoutReady] = useState(false)
  const [interactionMode, setInteractionMode] = useState<CanvasInteractionMode>('pan')
  const [runtimePositions, setRuntimePositions] = useState<Map<string, { x: number; y: number }>>(new Map())
  const [saveState, setSaveState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
    () => new Set(selectedNodeId ? [selectedNodeId] : []),
  )
  const entranceRef = useRef(true)
  const annotationAnchors = useMemo(() => inferAnnotationAnchors(flow), [flow])
  const nonGroupNodeCount = useMemo(
    () => flow.nodes.filter((node) => node.type !== 'group').length,
    [flow.nodes],
  )

  useEffect(() => {
    setElkLayout(null)
    setLayoutReady(false)
    setRuntimePositions(new Map())
    setSelectedNodeIds(new Set())
    setSaveState('idle')

    // CSS animation handles the stagger via @keyframes nodeEntrance + animation-delay.
    // We only track the entering flag so mapFlowNodes applies the animation class.
    entranceRef.current = true
    const entranceTimer = window.setTimeout(() => {
      entranceRef.current = false
    }, nonGroupNodeCount * 30 + 350)

    return () => {
      window.clearTimeout(entranceTimer)
    }
  }, [flow.id, nonGroupNodeCount])

  useEffect(() => {
    let cancelled = false

    computeElkLayout(flow.nodes, flow.edges)
      .then((layout) => {
        if (!cancelled) {
          setElkLayout(layout)
          setLayoutReady(true)
        }
      })
      .catch((error) => {
        console.error('ELK layout failed', error)
        if (!cancelled) {
          setLayoutReady(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [flow])

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
    setSelectedNodeIds((previous) => {
      if (selectedNodeId) {
        const nextSelectedIds = new Set([selectedNodeId])
        return areSetsEqual(previous, nextSelectedIds) ? previous : nextSelectedIds
      }

      if (previous.size <= 1) {
        return previous.size === 0 ? previous : new Set()
      }

      return previous
    })
  }, [selectedNodeId])

  const focusState = useMemo(
    () =>
      resolveFocusState(
        flow,
        nodeStatuses,
        activeEdges,
        focusActivePath,
        selectedNodeIds,
        traceFocusNodeIds,
        traceFocusEdgeIds,
      ),
    [
      activeEdges,
      flow,
      focusActivePath,
      nodeStatuses,
      selectedNodeIds,
      traceFocusEdgeIds,
      traceFocusNodeIds,
    ],
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
        annotationAnchors,
        elkLayout ?? undefined,
        entranceRef.current,
        layoutReady,
      ),
    [flow, nodeStatuses, nodeLogMap, focusState.nodeIds, selectedNodeIds, runtimePositions, annotationAnchors, elkLayout, layoutReady],
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
        annotationAnchors,
        elkLayout ?? undefined,
        entranceRef.current,
        layoutReady,
      ),
    )
  }, [
    flow,
    nodeLogMap,
    nodeStatuses,
    focusState.nodeIds,
    selectedNodeIds,
    runtimePositions,
    annotationAnchors,
    setNodes,
    elkLayout,
    layoutReady,
  ])

  useEffect(() => {
    setEdges(mapFlowEdges(flow, activeEdges, focusState.edgeIds))
  }, [activeEdges, flow, focusState.edgeIds, setEdges])

  const handleNodeClick = useCallback<NodeMouseHandler>(
    (event, node) => {
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        return
      }

      const nextSelectedIds = new Set([node.id])
      setSelectedNodeIds((previous) => (areSetsEqual(previous, nextSelectedIds) ? previous : nextSelectedIds))

      if (selectedNodeId !== node.id) {
        onSelectNode(node.id)
      }
    },
    [onSelectNode, selectedNodeId],
  )

  const handleSelectionChange = useCallback(
    ({ nodes: currentSelection }: { nodes: FlowNode[] }) => {
      // React Flow selection is canvas-local state. The inspector is opened and
      // closed by explicit actions elsewhere (node click, pane click, log/run click, close button).
      const nextSelectedIds = new Set(currentSelection.map((node) => node.id))
      setSelectedNodeIds((previous) => (areSetsEqual(previous, nextSelectedIds) ? previous : nextSelectedIds))
    },
    [],
  )

  const handlePaneClick = useCallback(() => {
    setSelectedNodeIds((previous) => (previous.size === 0 ? previous : new Set()))

    if (selectedNodeId !== undefined) {
      onSelectNode(undefined)
    }
  }, [onSelectNode, selectedNodeId])

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
      console.log('save positions', payload)
    }
  }, [nodes])

  if (!flow.hasGraph || flow.nodes.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-950 px-6 text-center">
        <div className="max-w-xl rounded-2xl border border-slate-800 bg-slate-900/70 px-6 py-8 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Headless flow</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-100">{flow.name}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            This flow is registered through the shared contract layer, but it does not have a React Flow view yet.
            Logs, journeys, and history remain available through the detail panels below.
          </p>
        </div>
      </div>
    )
  }

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
            setLayoutReady(false)
            computeElkLayout(flow.nodes, flow.edges)
              .then((layout) => {
                setElkLayout(layout)
                setLayoutReady(true)
              })
              .catch((error) => {
                console.error('ELK layout failed', error)
                setLayoutReady(true)
              })
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
          nodes: nodes.filter((node) => node.type !== 'annotation'),
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
          color={'var(--color-canvas-dot)'}
        />
      </ReactFlow>
    </div>
  )
}
