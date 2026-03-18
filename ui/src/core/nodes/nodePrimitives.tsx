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
  gray: {
    border: 'border-[var(--node-gray-border)]',
    bg: 'bg-[var(--node-gray-bg)]',
    text: 'text-[var(--node-gray-text)]',
    glow: '',
  },
  blue: {
    border: 'border-[var(--node-blue-border)]',
    bg: 'bg-[var(--node-blue-bg)]',
    text: 'text-[var(--node-blue-text)]',
    glow: '',
  },
  green: {
    border: 'border-[var(--node-green-border)]',
    bg: 'bg-[var(--node-green-bg)]',
    text: 'text-[var(--node-green-text)]',
    glow: '',
  },
  yellow: {
    border: 'border-[var(--node-yellow-border)]',
    bg: 'bg-[var(--node-yellow-bg)]',
    text: 'text-[var(--node-yellow-text)]',
    glow: '',
  },
  orange: {
    border: 'border-[var(--node-orange-border)]',
    bg: 'bg-[var(--node-orange-bg)]',
    text: 'text-[var(--node-orange-text)]',
    glow: '',
  },
  red: {
    border: 'border-[var(--node-red-border)]',
    bg: 'bg-[var(--node-red-bg)]',
    text: 'text-[var(--node-red-text)]',
    glow: '',
  },
  purple: {
    border: 'border-[var(--node-purple-border)]',
    bg: 'bg-[var(--node-purple-bg)]',
    text: 'text-[var(--node-purple-text)]',
    glow: '',
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
    return colorMap.gray
  }

  return colorMap[color] ?? colorMap.gray
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

  return clsx(
    'border text-[11px] transition-all duration-300',
    tone.border,
    tone.bg,
    tone.text,
    statusGlowClass(status),
    tone.glow,
    borderStyle === 'dashed' && 'border-dashed',
  )
}
