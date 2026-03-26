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

const resourceRoleTags: Record<string, string> = {
  s3: 'S3',
  postgres: 'PG',
  redis: 'REDIS',
}

function CylinderStatusDot({ status }: { status: NodeStatus }) {
  const dotColor = {
    idle:    'bg-[var(--status-idle)]',
    active:  'bg-[var(--status-active)]',
    success: 'bg-[var(--status-success)]',
    error:   'bg-[var(--status-error)]',
  }[status]

  return (
    <span
      className={clsx('size-1.5 shrink-0 rounded-full', dotColor, status === 'active' && 'node-dot-pulse')}
      data-testid={`status-badge-${status}`}
    />
  )
}

export function CylinderNode({ id, data }: NodeProps<FlowNode>) {
  const status = data.status?.status ?? 'idle'
  const svgTone = resolveSvgTone(data.style?.color)
  const familyClass = `node-family-${data.style?.color ?? 'resource'}`
  const roleTag = data.style?.icon ? (resourceRoleTags[data.style.icon] ?? data.style.icon.toUpperCase()) : 'STORE'
  const normalizedRoleTag = roleTag.trim().toLowerCase()
  const normalizedLabel = data.label.trim().toLowerCase()
  const showTitle = normalizedLabel !== normalizedRoleTag

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
        {showTitle ? (
          <p
            className="w-full truncate text-center text-[10px] font-medium leading-tight"
            style={{ color: svgTone.stroke }}
          >
            {data.label}
          </p>
        ) : null}
        <CylinderStatusDot status={status} />
      </div>
    </div>
  )
}
