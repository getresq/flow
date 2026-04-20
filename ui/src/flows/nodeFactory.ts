import type { FlowNodeConfig, NodeColor, NodeShape } from '../core/types';
import { defaultNodeSizeForShape } from '../core/nodeSizing';

export function normalizeTechnicalAlias(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  let normalized = trimmed;
  if (normalized.startsWith('rrq:queue:')) {
    normalized = normalized.slice('rrq:queue:'.length);
  }
  if (normalized.startsWith('handle_')) {
    normalized = normalized.slice('handle_'.length);
  }

  return normalized.replaceAll('_', '-');
}

function normalizeType(type: string): NodeShape {
  if (type === 'rectangle') return 'roundedRect';
  return type as NodeShape;
}

function withDefaults(node: FlowNodeConfig): FlowNodeConfig {
  const normalizedType = normalizeType(node.type);
  const defaultSize = defaultNodeSizeForShape(normalizedType);

  return {
    ...node,
    type: normalizedType,
    size: defaultSize
      ? {
          width: node.size?.width ?? defaultSize.width,
          height: node.size?.height ?? defaultSize.height,
        }
      : node.size,
  };
}

export function withNodeVisualDefaultsForFlow(nodes: FlowNodeConfig[]): FlowNodeConfig[] {
  return nodes.map((node) => withDefaults(node));
}

type NodeInput = Omit<FlowNodeConfig, 'type'> & { type?: NodeShape };

function applyPreset(
  input: NodeInput,
  preset: { type: NodeShape; color: NodeColor; eyebrow?: string; icon?: string },
): FlowNodeConfig {
  return withDefaults({
    ...input,
    type: preset.type,
    eyebrow: input.eyebrow ?? preset.eyebrow,
    style: {
      ...input.style,
      color: input.style?.color ?? preset.color,
      icon: input.style?.icon ?? preset.icon,
    },
  });
}

export function triggerNode(input: NodeInput): FlowNodeConfig {
  return applyPreset(input, { type: 'roundedRect', color: 'emerald' });
}

export function queueNode(input: NodeInput): FlowNodeConfig {
  return applyPreset(input, {
    type: 'roundedRect',
    color: 'amber',
    eyebrow: 'QUEUE',
    icon: 'queue',
  });
}

export function workerNode(input: NodeInput): FlowNodeConfig {
  return applyPreset(input, {
    type: 'roundedRect',
    color: 'ocean',
    eyebrow: 'WORKER',
    icon: 'worker',
  });
}

export function schedulerNode(input: NodeInput): FlowNodeConfig {
  return applyPreset(input, { type: 'roundedRect', color: 'slate', eyebrow: 'CRON', icon: 'cron' });
}

export function stepNode(input: NodeInput): FlowNodeConfig {
  return applyPreset(input, { type: 'roundedRect', color: 'sky' });
}

export function decisionNode(input: NodeInput): FlowNodeConfig {
  return applyPreset(input, { type: 'diamond', color: 'violet' });
}

export function resourceNode(input: NodeInput): FlowNodeConfig {
  return applyPreset(input, { type: 'cylinder', color: 'teal' });
}

export function detailGroup(input: NodeInput): FlowNodeConfig {
  return withDefaults({ ...input, type: 'group' });
}

export function detailNode(input: NodeInput): FlowNodeConfig {
  const node = applyPreset(input, { type: 'roundedRect', color: 'muted' });
  return { ...node, size: { width: node.size?.width ?? 184, height: input.size?.height ?? 44 } };
}

export function note(input: NodeInput): FlowNodeConfig {
  return withDefaults({ ...input, type: 'annotation' });
}

/** @deprecated Kept for backward compat during migration. Use preset functions directly. */
export function withNodeVisualDefaults(node: FlowNodeConfig): FlowNodeConfig {
  return withDefaults(node);
}
