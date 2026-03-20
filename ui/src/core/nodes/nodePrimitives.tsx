import { Handle, Position } from '@xyflow/react'
import clsx from 'clsx'

import type { HandlePosition, NodeHandleConfig, NodeStatus } from '../types'

const positionMap: Record<HandlePosition, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}

const colorMap: Record<string, { border: string; bg: string; text: string; glow: string }> = {
  queue: {
    border: 'border-[var(--node-border-color)]',
    bg: 'bg-[var(--node-queue-bg)]',
    text: 'text-[var(--node-queue-text)]',
    glow: 'node-family-queue',
  },
  worker: {
    border: 'border-[var(--node-border-color)]',
    bg: 'bg-[var(--node-worker-bg)]',
    text: 'text-[var(--node-worker-text)]',
    glow: 'node-family-worker',
  },
  cron: {
    border: 'border-[var(--node-border-color)]',
    bg: 'bg-[var(--node-cron-bg)]',
    text: 'text-[var(--node-cron-text)]',
    glow: 'node-family-cron',
  },
  process: {
    border: 'border-[var(--node-border-color)]',
    bg: 'bg-[var(--node-process-bg)]',
    text: 'text-[var(--node-process-text)]',
    glow: 'node-family-process',
  },
  decision: {
    border: 'border-[var(--node-border-color)]',
    bg: 'bg-[var(--node-decision-bg)]',
    text: 'text-[var(--node-decision-text)]',
    glow: 'node-family-decision',
  },
  resource: {
    border: 'border-[var(--node-border-color)]',
    bg: 'bg-[var(--node-resource-bg)]',
    text: 'text-[var(--node-resource-text)]',
    glow: 'node-family-resource',
  },
  trigger: {
    border: 'border-[var(--node-border-color)]',
    bg: 'bg-[var(--node-trigger-bg)]',
    text: 'text-[var(--node-trigger-text)]',
    glow: 'node-family-trigger',
  },
  detail: {
    border: 'border-[var(--node-detail-border)]',
    bg: 'bg-[var(--node-detail-bg)]',
    text: 'text-[var(--node-detail-text)]',
    glow: 'node-family-detail',
  },
  group: {
    border: 'border-[var(--node-group-border)]',
    bg: 'bg-[var(--node-group-bg)]',
    text: 'text-[var(--node-group-text)]',
    glow: 'node-family-group',
  },
}

const iconMap: Record<string, string> = {
  worker: 'W',
  queue: 'Q',
  s3: 'S3',
  postgres: 'PG',
  redis: 'RD',
  cron: 'CR',
  bot: 'BOT',
  external: 'EXT',
}

export function resolveTone(color: string | undefined) {
  if (!color) {
    return colorMap.detail
  }

  return colorMap[color] ?? colorMap.detail
}

const svgColorMap: Record<string, { fill: string; stroke: string; accent: string }> = {
  queue:    { fill: 'var(--node-queue-bg)',    stroke: 'var(--node-queue-text)',    accent: 'var(--node-queue-accent)' },
  worker:   { fill: 'var(--node-worker-bg)',   stroke: 'var(--node-worker-text)',   accent: 'var(--node-worker-accent)' },
  cron:     { fill: 'var(--node-cron-bg)',     stroke: 'var(--node-cron-text)',     accent: 'var(--node-cron-accent)' },
  process:  { fill: 'var(--node-process-bg)',  stroke: 'var(--node-process-text)',  accent: 'var(--node-process-accent)' },
  decision: { fill: 'var(--node-decision-bg)', stroke: 'var(--node-decision-text)', accent: 'var(--node-decision-accent)' },
  resource: { fill: 'var(--node-resource-bg)', stroke: 'var(--node-resource-text)', accent: 'var(--node-resource-accent)' },
  trigger:  { fill: 'var(--node-trigger-bg)',  stroke: 'var(--node-trigger-text)',  accent: 'var(--node-trigger-accent)' },
  detail:   { fill: 'var(--node-detail-bg)',   stroke: 'var(--node-detail-text)',   accent: 'var(--node-detail-accent)' },
  group:    { fill: 'var(--node-group-bg)',     stroke: 'var(--node-group-text)',    accent: 'var(--node-group-accent)' },
}

export function resolveSvgTone(color: string | undefined) {
  if (!color) {
    return svgColorMap.detail
  }

  return svgColorMap[color] ?? svgColorMap.detail
}

export function resolveIcon(icon: string | undefined): string | null {
  if (!icon) {
    return null
  }

  return iconMap[icon] ?? icon.toUpperCase().slice(0, 3)
}

export function statusGlowClass(status: NodeStatus | undefined): string {
  if (status === 'active') {
    return 'node-glow-active node-ping-active'
  }
  if (status === 'success') {
    return 'node-glow-success'
  }
  if (status === 'error') {
    return 'node-glow-error'
  }
  return 'node-glow-idle'
}

export function resolveHandleId(
  nodeId: string,
  handle: NodeHandleConfig,
  role: Exclude<NonNullable<NodeHandleConfig['type']>, 'both'> = handle.type === 'target' ? 'target' : 'source',
) {
  if (handle.id) {
    return `${nodeId}-${handle.id}`
  }

  const direction = role === 'target' ? 'in' : 'out'
  return `${nodeId}-${direction}-${handle.position}`
}

export function renderHandles(
  nodeId: string,
  handles: NodeHandleConfig[] | undefined,
  defaults: NodeHandleConfig[],
) {
  const merged = handles && handles.length > 0 ? handles : defaults

  return merged.flatMap((handle) => {
    const position = positionMap[handle.position]

    if (handle.type === 'both') {
      return [
        <Handle
          key={`${nodeId}-${handle.position}-target`}
          id={resolveHandleId(nodeId, handle, 'target')}
          type="target"
          position={position}
          className="!h-2 !w-2 !border !border-[var(--node-handle-border)] !bg-[var(--node-handle-bg)]"
        />,
        <Handle
          key={`${nodeId}-${handle.position}-source`}
          id={resolveHandleId(nodeId, handle, 'source')}
          type="source"
          position={position}
          className="!h-2 !w-2 !border !border-[var(--node-handle-border)] !bg-[var(--node-handle-bg)]"
        />,
      ]
    }

    return (
      <Handle
        key={resolveHandleId(nodeId, handle)}
        id={resolveHandleId(nodeId, handle)}
        type={handle.type ?? 'source'}
        position={position}
        className="!h-2 !w-2 !border !border-[var(--node-handle-border)] !bg-[var(--node-handle-bg)]"
      />
    )
  })
}

const firstClassColors = new Set(['queue', 'worker', 'cron', 'process', 'trigger', 'decision', 'resource'])

export function nodeContainerClass({
  color,
  status,
  borderStyle,
}: {
  color?: string
  status?: NodeStatus
  borderStyle?: 'solid' | 'dashed'
}) {
  const tone = resolveTone(color)
  const isFirstClass = color ? firstClassColors.has(color) : false

  return clsx(
    isFirstClass ? 'border-[1.5px]' : 'border-[0.5px]',
    'text-[11px] node-transition',
    tone.border,
    tone.bg,
    tone.text,
    statusGlowClass(status),
    tone.glow,
    borderStyle === 'dashed' && 'border-dashed',
  )
}
