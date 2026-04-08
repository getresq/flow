import type { FlowNodeConfig, NodeSemanticRole, NodeShape } from './types'

export interface NodeSize {
  width: number
  height: number
}

const shapeSizeDefaults: Partial<Record<NodeShape, NodeSize>> = {
  rectangle: { width: 180, height: 72 },
  roundedRect: { width: 180, height: 72 },
  diamond: { width: 144, height: 144 },
  circle: { width: 112, height: 112 },
  cylinder: { width: 112, height: 128 },
  pill: { width: 180, height: 44 },
  badge: { width: 150, height: 52 },
  octagon: { width: 160, height: 70 },
}

const roleSizeDefaults: Partial<Record<NodeSemanticRole, NodeSize>> = {
  trigger: { width: 180, height: 52 },
  queue: { width: 180, height: 72 },
  worker: { width: 180, height: 72 },
  scheduler: { width: 180, height: 72 },
  process: { width: 180, height: 72 },
  detail: { width: 150, height: 52 },
  decision: { width: 144, height: 144 },
  resource: { width: 112, height: 128 },
}

export function defaultNodeSizeForRole(role: NodeSemanticRole | undefined, type: NodeShape): NodeSize | undefined {
  return (role ? roleSizeDefaults[role] : undefined) ?? shapeSizeDefaults[type]
}

export function resolveNodeDimensions(
  node: Pick<FlowNodeConfig, 'type' | 'semanticRole' | 'size' | 'minSize'>,
): NodeSize {
  if (node.type === 'group') {
    return {
      width: node.size?.width ?? node.minSize?.width ?? 420,
      height: node.size?.height ?? node.minSize?.height ?? 280,
    }
  }

  const defaults = defaultNodeSizeForRole(node.semanticRole, node.type) ?? { width: 200, height: 50 }
  return {
    width: node.size?.width ?? defaults.width,
    height: node.size?.height ?? defaults.height,
  }
}
