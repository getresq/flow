import ELK from 'elkjs/lib/main.js'
import type { ElkNode } from 'elkjs/lib/elk-api'

import type { FlowEdgeConfig, FlowNodeConfig, GroupLayoutMode, LayoutLane } from '../types'
import { resolveNodeDimensions } from '../nodeSizing'

const elk = new ELK()

const EXCLUDED_SHAPES = new Set<string>(['annotation'])

export interface LayoutGeometry {
  x: number
  y: number
  width?: number
  height?: number
}

function baseLayoutOptions() {
  return {
    'elk.algorithm': 'layered',
    'elk.direction': 'DOWN',
    'elk.layered.spacing.nodeNodeBetweenLayers': '80',
    'elk.layered.spacing.edgeNodeBetweenLayers': '40',
    'elk.spacing.nodeNode': '56',
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  } as const
}

function groupLayoutOptions(mode: GroupLayoutMode = 'stack') {
  if (mode === 'decision-tree') {
    return {
      ...baseLayoutOptions(),
      'elk.padding': '[top=28,left=28,bottom=28,right=56]',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.layered.spacing.edgeNodeBetweenLayers': '40',
      'elk.spacing.nodeNode': '56',
    } as const
  }

  return {
    ...baseLayoutOptions(),
    'elk.padding': '[top=22,left=4,bottom=4,right=4]',
    'elk.layered.spacing.nodeNodeBetweenLayers': '20',
    'elk.layered.spacing.edgeNodeBetweenLayers': '12',
    'elk.spacing.nodeNode': '14',
  } as const
}

function nodeDimensions(node: FlowNodeConfig) {
  return resolveNodeDimensions(node)
}

const lanePriority: Record<LayoutLane, number> = {
  main: 0,
  branch: 1,
  sidecar: 2,
  resource: 3,
  note: 4,
}

const rolePriority: Record<string, number> = {
  trigger: 0,
  queue: 1,
  worker: 2,
  scheduler: 2,
  process: 3,
  decision: 4,
  detail: 5,
  resource: 6,
  group: 7,
  note: 8,
}

function sortedLayoutNodes(nodes: FlowNodeConfig[]) {
  return [...nodes].sort((left, right) => {
    const leftOrder = left.layout?.order ?? Number.MAX_SAFE_INTEGER
    const rightOrder = right.layout?.order ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }

    const leftLane = lanePriority[left.layout?.lane ?? 'main']
    const rightLane = lanePriority[right.layout?.lane ?? 'main']
    if (leftLane !== rightLane) {
      return leftLane - rightLane
    }

    const leftRole = rolePriority[left.semanticRole ?? 'detail'] ?? 99
    const rightRole = rolePriority[right.semanticRole ?? 'detail'] ?? 99
    if (leftRole !== rightRole) {
      return leftRole - rightRole
    }

    return left.id.localeCompare(right.id)
  })
}

function buildElkNode(
  node: FlowNodeConfig,
  childrenByParent: Map<string, FlowNodeConfig[]>,
): ElkNode {
  const children = sortedLayoutNodes(childrenByParent.get(node.id) ?? []).map((child) => buildElkNode(child, childrenByParent))
  const dims = nodeDimensions(node)

  const elkNode: ElkNode = {
    id: node.id,
    width: dims.width,
    height: dims.height,
  }

  if (node.type === 'group') {
    elkNode.layoutOptions = groupLayoutOptions(node.layout?.groupMode)
  }

  if (children.length > 0) {
    elkNode.children = children
  }

  return elkNode
}

function collectLayoutGeometry(
  node: { id: string; x?: number; y?: number; width?: number; height?: number; children?: unknown[] },
  layout: Map<string, LayoutGeometry>,
) {
  if (node.id !== 'root' && node.x !== undefined && node.y !== undefined) {
    layout.set(node.id, {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    })
  }

  for (const child of node.children ?? []) {
    collectLayoutGeometry(
      child as { id: string; x?: number; y?: number; width?: number; height?: number; children?: unknown[] },
      layout,
    )
  }
}

export async function computeElkLayout(
  nodes: FlowNodeConfig[],
  edges: FlowEdgeConfig[],
): Promise<Map<string, LayoutGeometry>> {
  const layoutableNodes = nodes.filter((n) => !EXCLUDED_SHAPES.has(n.type))
  const layoutableNodeIds = new Set(layoutableNodes.map((n) => n.id))
  const childrenByParent = new Map<string, FlowNodeConfig[]>()

  for (const node of layoutableNodes) {
    if (!node.parentId) {
      continue
    }
    const siblings = childrenByParent.get(node.parentId) ?? []
    siblings.push(node)
    childrenByParent.set(node.parentId, siblings)
  }

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      ...baseLayoutOptions(),
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    },
    children: sortedLayoutNodes(layoutableNodes.filter((node) => !node.parentId))
      .map((node) => buildElkNode(node, childrenByParent)),
    edges: edges
      .filter((e) => layoutableNodeIds.has(e.source) && layoutableNodeIds.has(e.target))
      .map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
  }

  try {
    const result = await elk.layout(elkGraph)
    const positions = new Map<string, LayoutGeometry>()
    collectLayoutGeometry(result as { id: string; x?: number; y?: number; width?: number; height?: number; children?: unknown[] }, positions)

    return positions
  } catch {
    // Keep authored/lane/branch positions when ELK cannot safely resolve a
    // compound graph. This avoids console noise and preserves the current
    // semantic layout instead of crashing the canvas.
    return new Map<string, LayoutGeometry>()
  }
}
