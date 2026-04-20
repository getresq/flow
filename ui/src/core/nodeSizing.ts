import type { FlowNodeConfig, NodeShape } from './types';

export interface NodeSize {
  width: number;
  height: number;
}

const shapeSizeDefaults: Partial<Record<NodeShape, NodeSize>> = {
  rectangle: { width: 184, height: 64 },
  roundedRect: { width: 184, height: 64 },
  diamond: { width: 92, height: 92 },
  circle: { width: 112, height: 112 },
  cylinder: { width: 88, height: 104 },
  badge: { width: 184, height: 44 },
  octagon: { width: 160, height: 56 },
};

export function defaultNodeSizeForShape(type: NodeShape): NodeSize | undefined {
  return shapeSizeDefaults[type];
}

export function resolveNodeDimensions(
  node: Pick<FlowNodeConfig, 'type' | 'size' | 'minSize'>,
): NodeSize {
  if (node.type === 'group') {
    return {
      width: node.size?.width ?? node.minSize?.width ?? 420,
      height: node.size?.height ?? node.minSize?.height ?? 280,
    };
  }

  const defaults = defaultNodeSizeForShape(node.type) ?? { width: 200, height: 50 };
  return {
    width: node.size?.width ?? defaults.width,
    height: node.size?.height ?? defaults.height,
  };
}
