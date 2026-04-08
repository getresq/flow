import clsx from 'clsx'

import type { NodeStatus } from '../types'
import type { FlowNodeData } from './types'

interface StandardNodeContentProps {
  data: FlowNodeData
  compact?: boolean
}

// Maps semantic role to role tag text shown top-left of card
const roleTagLabels: Record<string, string> = {
  trigger:   'TRIGGER',
  queue:     'QUEUE',
  worker:    'WORKER',
  scheduler: 'CRON',
  process:   'PROCESS',
}

const firstClassRoles = new Set(['trigger', 'queue', 'worker', 'scheduler', 'process', 'resource', 'decision'])
const firstClassColors = new Set(['queue', 'worker', 'cron', 'process', 'trigger', 'decision', 'resource'])
const resourceRoleTags: Record<string, string> = {
  s3: 'S3',
  postgres: 'PG',
  redis: 'REDIS',
}

function resolveRoleTag(semanticRole: string | undefined, color: string | undefined, icon: string | undefined): string | null {
  // Use semanticRole when available — it's the authoritative source
  if (semanticRole) {
    if (semanticRole === 'resource') return icon ? (resourceRoleTags[icon] ?? icon.toUpperCase()) : 'STORE'
    return roleTagLabels[semanticRole] ?? null
  }
  // Fallback: derive from color
  if (!color) return null
  if (color === 'resource') return icon ? (resourceRoleTags[icon] ?? icon.toUpperCase()) : 'STORE'
  if (color === 'cron') return 'CRON'
  const entry = Object.entries(roleTagLabels).find(([, v]) => v.toLowerCase() === color)
  return entry ? entry[1] : null
}

function StatusDot({ status }: { status: NodeStatus }) {
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

export function StandardNodeContent({ data, compact = false }: StandardNodeContentProps) {
  const status = data.status?.status ?? 'idle'
  const color = data.style?.color
  // semanticRole is authoritative; color is a fallback for nodes without factory wiring
  const isFirstClass = data.semanticRole
    ? firstClassRoles.has(data.semanticRole)
    : color ? firstClassColors.has(color) : false
  const roleTag = resolveRoleTag(data.semanticRole, color, data.style?.icon)

  // Detail / non-first-class: minimal — label only, centered, no role tag, no status
  if (!isFirstClass) {
    return (
      <div className="px-3 py-2 text-center">
        <p className="truncate text-[11px] font-medium leading-tight">{data.label}</p>
      </div>
    )
  }

  // First-class: role tag + title + optional subtitle + status
  return (
    <div className={clsx('flex flex-col gap-1', compact ? 'px-3 py-2' : 'px-3.5 py-2.5')}>
      {/* Header row: role tag left, status right */}
      <div className="flex items-center justify-between gap-2">
        {roleTag ? (
          <span
            className="node-role-tag text-[9px] font-semibold uppercase tracking-[0.12em] opacity-55"
            style={{ color: 'var(--node-accent)' }}
          >
            {roleTag}
          </span>
        ) : (
          <span />
        )}
        <StatusDot status={status} />
      </div>

      {/* Title */}
      <p className="truncate text-[12px] font-medium leading-snug text-[var(--text-primary)]">
        {data.label}
      </p>

      {/* Optional subtitle */}
      {data.sublabel ? (
        <p className="truncate text-[10px] leading-tight text-[var(--text-secondary)] opacity-60">
          {data.sublabel}
        </p>
      ) : null}
    </div>
  )
}
