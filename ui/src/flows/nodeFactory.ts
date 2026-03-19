import type { FlowNodeConfig, NodeSemanticRole, NodeShape, NodeStyle } from '../core/types'

const roleColorMap: Record<NodeSemanticRole, string> = {
  trigger:   'trigger',
  queue:     'queue',
  worker:    'worker',
  scheduler: 'cron',
  process:   'process',
  decision:  'decision',
  resource:  'resource',
  detail:    'detail',
  group:     'group',
  note:      'detail',
}

const roleShapeMap: Record<NodeSemanticRole, NodeShape> = {
  trigger: 'pill',
  queue: 'roundedRect',
  worker: 'roundedRect',
  scheduler: 'roundedRect',
  process: 'roundedRect',
  decision: 'diamond',
  resource: 'cylinder',
  detail: 'roundedRect',
  group: 'group',
  note: 'annotation',
}

// Width tiers per design contract:
// Tier 1 — Standard Execution: 240px (queue, worker, cron)
// Tier 2 — Process:            200px
// Tier 3 — Compact:            160px (detail, trigger)
// Tier 5 — Resource:           140px (cylinder)
// Decision diamond: 100px (square, label-dependent; 80–120px per spec)
const roleWidthDefaults: Partial<Record<NodeSemanticRole, number>> = {
  trigger:   160,
  queue:     240,
  worker:    240,
  scheduler: 240,
  process:   200,
  detail:    160,
  resource:  140,
  decision:  100,
}

function inferSemanticRole(node: FlowNodeConfig): NodeSemanticRole {
  if (node.semanticRole) {
    return node.semanticRole
  }

  if (node.type === 'pill') {
    return 'trigger'
  }
  if (node.type === 'diamond') {
    return 'decision'
  }
  if (node.type === 'cylinder') {
    return 'resource'
  }
  if (node.type === 'group') {
    return 'group'
  }
  if (node.type === 'annotation') {
    return 'note'
  }
  if (node.style?.icon === 'queue') {
    return 'queue'
  }
  if (node.style?.icon === 'worker' || node.sublabel?.trim().toLowerCase() === 'workers') {
    return 'worker'
  }
  if (node.style?.icon === 'cron') {
    return 'scheduler'
  }
  if (node.type === 'badge') {
    return 'detail'
  }
  if (node.parentId) {
    return 'detail'
  }

  return 'process'
}

function normalizeStyle(node: FlowNodeConfig, semanticRole: NodeSemanticRole): NodeStyle | undefined {
  const nextStyle = { ...(node.style ?? {}) }

  if (semanticRole === 'queue' && !nextStyle.icon) {
    nextStyle.icon = 'queue'
  }
  if (semanticRole === 'worker' && !nextStyle.icon) {
    nextStyle.icon = 'worker'
  }
  if (semanticRole === 'scheduler' && !nextStyle.icon) {
    nextStyle.icon = 'cron'
  }

  if (!nextStyle.color) {
    nextStyle.color = roleColorMap[semanticRole]
  }

  return Object.keys(nextStyle).length > 0 ? nextStyle : undefined
}

export function withNodeVisualDefaults(node: FlowNodeConfig): FlowNodeConfig {
  const semanticRole = inferSemanticRole(node)
  const normalizedType = roleShapeMap[semanticRole]
  const defaultWidth = roleWidthDefaults[semanticRole]

  return {
    ...node,
    semanticRole,
    type: normalizedType,
    style: normalizeStyle(node, semanticRole),
    size: defaultWidth && !node.size?.width
      ? { width: defaultWidth, height: node.size?.height }
      : node.size,
  }
}

export function withNodeVisualDefaultsForFlow(nodes: FlowNodeConfig[]): FlowNodeConfig[] {
  return nodes.map((node) => withNodeVisualDefaults(node))
}

type SemanticNodeInput = Omit<FlowNodeConfig, 'type' | 'semanticRole'>

export function triggerNode(input: SemanticNodeInput): FlowNodeConfig {
  return withNodeVisualDefaults({ ...input, type: 'pill', semanticRole: 'trigger' })
}

export function queueNode(input: SemanticNodeInput): FlowNodeConfig {
  return withNodeVisualDefaults({ ...input, type: 'roundedRect', semanticRole: 'queue' })
}

export function workerNode(input: SemanticNodeInput): FlowNodeConfig {
  return withNodeVisualDefaults({ ...input, type: 'roundedRect', semanticRole: 'worker' })
}

export function processNode(input: SemanticNodeInput): FlowNodeConfig {
  return withNodeVisualDefaults({ ...input, type: 'roundedRect', semanticRole: 'process' })
}

export function decisionNode(input: SemanticNodeInput): FlowNodeConfig {
  return withNodeVisualDefaults({ ...input, type: 'diamond', semanticRole: 'decision' })
}

export function resourceNode(input: SemanticNodeInput): FlowNodeConfig {
  return withNodeVisualDefaults({ ...input, type: 'cylinder', semanticRole: 'resource' })
}

export function detailGroup(input: SemanticNodeInput): FlowNodeConfig {
  return withNodeVisualDefaults({ ...input, type: 'group', semanticRole: 'group' })
}

export function detailNode(input: SemanticNodeInput): FlowNodeConfig {
  return withNodeVisualDefaults({ ...input, type: 'roundedRect', semanticRole: 'detail' })
}

export function note(input: SemanticNodeInput): FlowNodeConfig {
  return withNodeVisualDefaults({ ...input, type: 'annotation', semanticRole: 'note' })
}
