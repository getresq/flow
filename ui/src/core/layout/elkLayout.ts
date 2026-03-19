import ELK from 'elkjs/lib/elk.bundled.js'

import type { FlowEdgeConfig, FlowNodeConfig } from '../types'

const elk = new ELK()

const EXCLUDED_SHAPES = new Set<string>(['annotation', 'group'])

const shapeDimensions: Record<string, { width: number; height: number }> = {
  rectangle: { width: 248, height: 64 },
  roundedRect: { width: 248, height: 64 },
  diamond: { width: 144, height: 144 },
  circle: { width: 112, height: 112 },
  cylinder: { width: 112, height: 128 },
  pill: { width: 240, height: 44 },
  badge: { width: 220, height: 52 },
  octagon: { width: 160, height: 70 },
}

export async function computeElkLayout(
  nodes: FlowNodeConfig[],
  edges: FlowEdgeConfig[],
): Promise<Map<string, { x: number; y: number }>> {
  const layoutableNodes = nodes.filter((n) => !EXCLUDED_SHAPES.has(n.type))
  const layoutableNodeIds = new Set(layoutableNodes.map((n) => n.id))

  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.layered.spacing.edgeNodeBetweenLayers': '40',
      'elk.spacing.nodeNode': '50',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    },
    children: layoutableNodes.map((node) => {
      const dims = shapeDimensions[node.type] ?? { width: 200, height: 50 }
      return {
        id: node.id,
        width: node.size?.width ?? dims.width,
        height: node.size?.height ?? dims.height,
      }
    }),
    edges: edges
      .filter((e) => layoutableNodeIds.has(e.source) && layoutableNodeIds.has(e.target))
      .map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
  }

  const result = await elk.layout(elkGraph)
  const positions = new Map<string, { x: number; y: number }>()

  for (const child of result.children ?? []) {
    if (child.x !== undefined && child.y !== undefined) {
      positions.set(child.id, { x: child.x, y: child.y })
    }
  }

  return positions
}
