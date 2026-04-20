import { Handle, Position } from '@xyflow/react';
import clsx from 'clsx';

import type { HandlePosition, NodeHandleConfig, NodeStatus } from '../types';

const positionMap: Record<HandlePosition, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

const colorMap: Record<string, { border: string; bg: string; text: string; glow: string }> = {
  amber: {
    border: 'border-[var(--node-border-color)]',
    bg: 'bg-[var(--node-amber-bg)]',
    text: 'text-[var(--node-amber-text)]',
    glow: 'node-family-amber',
  },
  ocean: {
    border: 'border-[var(--node-border-color)]',
    bg: 'bg-[var(--node-ocean-bg)]',
    text: 'text-[var(--node-ocean-text)]',
    glow: 'node-family-ocean',
  },
  slate: {
    border: 'border-[var(--node-border-color)]',
    bg: 'bg-[var(--node-slate-bg)]',
    text: 'text-[var(--node-slate-text)]',
    glow: 'node-family-slate',
  },
  sky: {
    border: 'border-[var(--node-border-color)]',
    bg: 'bg-[var(--node-sky-bg)]',
    text: 'text-[var(--node-sky-text)]',
    glow: 'node-family-sky',
  },
  violet: {
    border: 'border-[var(--node-border-color)]',
    bg: 'bg-[var(--node-violet-bg)]',
    text: 'text-[var(--node-violet-text)]',
    glow: 'node-family-violet',
  },
  teal: {
    border: 'border-[var(--node-border-color)]',
    bg: 'bg-[var(--node-teal-bg)]',
    text: 'text-[var(--node-teal-text)]',
    glow: 'node-family-teal',
  },
  emerald: {
    border: 'border-[var(--node-border-color)]',
    bg: 'bg-[var(--node-emerald-bg)]',
    text: 'text-[var(--node-emerald-text)]',
    glow: 'node-family-emerald',
  },
  muted: {
    border: 'border-[var(--node-muted-border)]',
    bg: 'bg-[var(--node-muted-bg)]',
    text: 'text-[var(--node-muted-text)]',
    glow: 'node-family-muted',
  },
  group: {
    border: 'border-[var(--node-group-border)]',
    bg: 'bg-[var(--node-group-bg)]',
    text: 'text-[var(--node-group-text)]',
    glow: 'node-family-group',
  },
};

export function resolveTone(color: string | undefined) {
  if (!color) {
    return colorMap.muted;
  }

  return colorMap[color] ?? colorMap.muted;
}

const svgColorMap: Record<string, { fill: string; stroke: string; accent: string }> = {
  amber: {
    fill: 'var(--node-amber-bg)',
    stroke: 'var(--node-amber-text)',
    accent: 'var(--node-amber-accent)',
  },
  ocean: {
    fill: 'var(--node-ocean-bg)',
    stroke: 'var(--node-ocean-text)',
    accent: 'var(--node-ocean-accent)',
  },
  slate: {
    fill: 'var(--node-slate-bg)',
    stroke: 'var(--node-slate-text)',
    accent: 'var(--node-slate-accent)',
  },
  sky: {
    fill: 'var(--node-sky-bg)',
    stroke: 'var(--node-sky-text)',
    accent: 'var(--node-sky-accent)',
  },
  violet: {
    fill: 'var(--node-violet-bg)',
    stroke: 'var(--node-violet-text)',
    accent: 'var(--node-violet-accent)',
  },
  teal: {
    fill: 'var(--node-teal-bg)',
    stroke: 'var(--node-teal-text)',
    accent: 'var(--node-teal-accent)',
  },
  emerald: {
    fill: 'var(--node-emerald-bg)',
    stroke: 'var(--node-emerald-text)',
    accent: 'var(--node-emerald-accent)',
  },
  muted: {
    fill: 'var(--node-muted-bg)',
    stroke: 'var(--node-muted-text)',
    accent: 'var(--node-muted-accent)',
  },
  group: {
    fill: 'var(--node-group-bg)',
    stroke: 'var(--node-group-text)',
    accent: 'var(--node-group-accent)',
  },
};

export function resolveSvgTone(color: string | undefined) {
  if (!color) {
    return svgColorMap.muted;
  }

  return svgColorMap[color] ?? svgColorMap.muted;
}

export function statusGlowClass(status: NodeStatus | undefined): string {
  if (status === 'active') {
    return 'node-glow-active';
  }
  if (status === 'error') {
    return 'node-glow-error';
  }
  return 'node-glow-idle';
}

export function resolveHandleId(
  nodeId: string,
  handle: NodeHandleConfig,
  role: Exclude<NonNullable<NodeHandleConfig['type']>, 'both'> = handle.type === 'target'
    ? 'target'
    : 'source',
) {
  if (handle.id) {
    return `${nodeId}-${handle.id}`;
  }

  const direction = role === 'target' ? 'in' : 'out';
  return `${nodeId}-${direction}-${handle.position}`;
}

export function renderHandles(
  nodeId: string,
  handles: NodeHandleConfig[] | undefined,
  defaults: NodeHandleConfig[],
) {
  const merged = handles && handles.length > 0 ? handles : defaults;

  return merged.flatMap((handle) => {
    const position = positionMap[handle.position];
    const offsetStyle =
      handle.offset === undefined
        ? undefined
        : handle.position === 'top' || handle.position === 'bottom'
          ? { left: `calc(50% + ${handle.offset}px)` }
          : { top: `calc(50% + ${handle.offset}px)` };

    if (handle.type === 'both') {
      return [
        <Handle
          key={`${nodeId}-${handle.position}-target`}
          id={resolveHandleId(nodeId, handle, 'target')}
          type="target"
          position={position}
          className="!h-2 !w-2 !border !border-[var(--node-handle-border)] !bg-[var(--node-handle-bg)]"
          style={offsetStyle}
        />,
        <Handle
          key={`${nodeId}-${handle.position}-source`}
          id={resolveHandleId(nodeId, handle, 'source')}
          type="source"
          position={position}
          className="!h-2 !w-2 !border !border-[var(--node-handle-border)] !bg-[var(--node-handle-bg)]"
          style={offsetStyle}
        />,
      ];
    }

    return (
      <Handle
        key={resolveHandleId(nodeId, handle)}
        id={resolveHandleId(nodeId, handle)}
        type={handle.type ?? 'source'}
        position={position}
        className="!h-2 !w-2 !border !border-[var(--node-handle-border)] !bg-[var(--node-handle-bg)]"
        style={offsetStyle}
      />
    );
  });
}

export const firstClassColors = new Set([
  'amber',
  'ocean',
  'slate',
  'sky',
  'emerald',
  'violet',
  'teal',
]);

export function nodeContainerClass({ color, status }: { color?: string; status?: NodeStatus }) {
  const tone = resolveTone(color);
  const isFirstClass = color ? firstClassColors.has(color) : false;

  return clsx(
    isFirstClass ? 'border-[1.5px]' : 'border',
    'text-[11px] node-transition',
    tone.border,
    tone.bg,
    tone.text,
    statusGlowClass(status),
    tone.glow,
  );
}
