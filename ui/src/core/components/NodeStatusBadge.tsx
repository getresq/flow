import clsx from 'clsx'

import type { NodeStatus } from '../types'
import { DurationBadge } from './DurationBadge'

interface NodeStatusBadgeProps {
  status: NodeStatus
  durationMs?: number
  durationVisibleUntil?: number
  className?: string
}

export function NodeStatusBadge({
  status,
  durationMs,
  durationVisibleUntil,
  className,
}: NodeStatusBadgeProps) {
  const now = Date.now()
  const faded = Boolean(durationVisibleUntil && now > durationVisibleUntil)

  return (
    <div className={clsx('inline-flex items-center gap-2', className)}>
      <span
        data-testid={`status-badge-${status}`}
        className={clsx(
          'size-1.5 rounded-full',
          status === 'idle'    && 'bg-[var(--status-idle)]',
          status === 'active'  && 'bg-[var(--status-active)] animate-flow-pulse',
          status === 'success' && 'bg-[var(--status-success)]',
          status === 'error'   && 'bg-[var(--status-error)]',
        )}
      />
      <DurationBadge durationMs={durationMs} faded={faded} />
    </div>
  )
}
