import clsx from 'clsx'
import type { NodeProps } from '@xyflow/react'

import { renderHandles, resolveSvgTone, statusGlowClass } from './nodePrimitives'
import type { FlowNode } from './types'
import type { NodeStatus } from '../types'

const defaultHandles = [
  { position: 'top', type: 'both' },
  { position: 'right', type: 'both' },
  { position: 'bottom', type: 'both' },
  { position: 'left', type: 'both' },
] as const

function CylinderStatusDot({ status }: { status: NodeStatus }) {
  const dotColor = {
    idle:    'bg-[var(--text-muted)]',
    active:  'bg-[var(--node-cron-accent)]',
    success: 'bg-[var(--node-cron-accent)]',
    error:   'bg-[var(--status-error)]',
  }[status]

  return (
    <div className="flex items-center gap-1" data-testid={`status-badge-${status}`}>
      <span className={clsx('size-1.5 rounded-full', dotColor, status === 'active' && 'node-dot-pulse')} />
      <span className="text-[9px] leading-none opacity-60">{status}</span>
    </div>
  )
}

export function CylinderNode({ id, data }: NodeProps<FlowNode>) {
  const status = data.status?.status ?? 'idle'
  const svgTone = resolveSvgTone(data.style?.color)
  const familyClass = `node-family-${data.style?.color ?? 'resource'}`
  // Role tag: use icon as resource type (S3, POSTGRES, REDIS) or generic RES
  const roleTag = data.style?.icon ? data.style.icon.toUpperCase() : 'RES'

  return (
    <div className={`relative h-28 w-24 ${familyClass}`} style={{ '--node-accent': svgTone.accent } as React.CSSProperties}>
      {renderHandles(id, data.handles, [...defaultHandles])}
      <svg
        viewBox="0 0 96 112"
        className={`h-full w-full node-glow-svg ${statusGlowClass(status)}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M 0 20 Q 0 0, 48 0 Q 96 0, 96 20 L 96 92 Q 96 112, 48 112 Q 0 112, 0 92 Z"
          style={{ fill: svgTone.fill, stroke: svgTone.stroke }}
          strokeWidth="1.5"
          strokeOpacity="0.5"
          fillOpacity="0.9"
        />
        <ellipse
          cx="48" cy="20" rx="48" ry="20"
          style={{ fill: svgTone.fill, stroke: svgTone.stroke }}
          strokeWidth="1.5"
          strokeOpacity="0.5"
          fillOpacity="1"
        />
      </svg>
      {/* Card overlay — role tag + title + status dot */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 pt-4">
        <span
          className="text-[8px] font-semibold uppercase tracking-[0.12em] opacity-55"
          style={{ color: svgTone.accent }}
        >
          {roleTag}
        </span>
        <p
          className="w-full truncate text-center text-[10px] font-medium leading-tight"
          style={{ color: svgTone.stroke }}
        >
          {data.label}
        </p>
        <CylinderStatusDot status={status} />
      </div>
    </div>
  )
}
