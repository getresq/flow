import type { FlowNodeConfig, LayoutLane } from '../types'

export interface Position {
  x: number
  y: number
}

const DEFAULT_WIDTH = 200
const DEFAULT_HEIGHT = 64
const DEFAULT_DIAMOND_SIZE = 144
const DEFAULT_PILL_HEIGHT = 44

const SIDECAR_GAP = 180
const RESOURCE_GAP = 180

function nodeDimensions(node: FlowNodeConfig) {
  return {
    width: node.size?.width ?? DEFAULT_WIDTH,
    height:
      node.size?.height ??
      (node.type === 'diamond'
        ? DEFAULT_DIAMOND_SIZE
        : node.type === 'pill'
          ? DEFAULT_PILL_HEIGHT
          : DEFAULT_HEIGHT),
  }
}

function rightEdge(node: FlowNodeConfig, position: Position) {
  return position.x + nodeDimensions(node).width
}

function laneNodes(
  nodes: FlowNodeConfig[],
  runtimePositions: Map<string, Position>,
  lane: LayoutLane,
) {
  return nodes.filter((node) => !node.parentId && !runtimePositions.has(node.id) && node.layout?.lane === lane)
}

export function applyLaneTemplatePositions(
  nodes: FlowNodeConfig[],
  basePositions: Map<string, Position>,
  runtimePositions: Map<string, Position>,
): Map<string, Position> {
  const nextPositions = new Map(basePositions)
  const rootNodes = nodes.filter((node) => !node.parentId)

  const sidecarNodes = laneNodes(rootNodes, runtimePositions, 'sidecar')
  const resourceNodes = laneNodes(rootNodes, runtimePositions, 'resource')

  if (sidecarNodes.length === 0 && resourceNodes.length === 0) {
    return nextPositions
  }

  const backboneNodes = rootNodes.filter(
    (node) =>
      !runtimePositions.has(node.id) &&
      (node.layout?.lane === undefined || node.layout?.lane === 'main' || node.layout?.lane === 'branch'),
  )

  const backboneRightEdge = backboneNodes.reduce((maxEdge, node) => {
    const position = nextPositions.get(node.id) ?? node.position
    return Math.max(maxEdge, rightEdge(node, position))
  }, Number.NEGATIVE_INFINITY)

  const sidecarBaseX =
    sidecarNodes.length > 0
      ? backboneRightEdge + SIDECAR_GAP
      : Number.NEGATIVE_INFINITY

  for (const node of sidecarNodes) {
    const position = nextPositions.get(node.id) ?? node.position
    nextPositions.set(node.id, {
      x: sidecarBaseX,
      y: position.y,
    })
  }

  const sidecarRightEdge = sidecarNodes.reduce((maxEdge, node) => {
    const position = nextPositions.get(node.id) ?? node.position
    return Math.max(maxEdge, rightEdge(node, position))
  }, sidecarBaseX)

  const resourceBaseX =
    resourceNodes.length > 0
      ? sidecarRightEdge + RESOURCE_GAP
      : Number.NEGATIVE_INFINITY

  for (const node of resourceNodes) {
    const position = nextPositions.get(node.id) ?? node.position
    nextPositions.set(node.id, {
      x: resourceBaseX,
      y: position.y,
    })
  }

  return nextPositions
}
