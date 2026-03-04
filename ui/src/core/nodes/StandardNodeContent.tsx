import clsx from 'clsx'

import { NodeStatusBadge } from '../components/NodeStatusBadge'
import type { FlowNodeData } from './types'
import { resolveIcon } from './nodePrimitives'

interface StandardNodeContentProps {
  data: FlowNodeData
  showBullets?: boolean
  compact?: boolean
}

export function StandardNodeContent({
  data,
  showBullets = true,
  compact = false,
}: StandardNodeContentProps) {
  const status = data.status?.status ?? 'idle'
  const icon = resolveIcon(data.style?.icon)
  const isQueueNode = data.style?.icon === 'queue'

  return (
    <div className={clsx('relative flex h-full flex-col gap-2 p-3', compact && 'gap-1.5 p-2')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {icon ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-white/12 px-1 text-[9px] font-bold text-white/95">
                {icon}
              </span>
            ) : null}
            <p className="truncate text-xs font-semibold leading-tight">{data.label}</p>
          </div>
          {data.sublabel ? <p className="mt-0.5 text-[10px] text-white/65">{data.sublabel}</p> : null}
        </div>

        <NodeStatusBadge
          status={status}
          durationMs={data.status?.durationMs}
          durationVisibleUntil={data.status?.durationVisibleUntil}
        />
      </div>

      {showBullets && data.bullets && data.bullets.length > 0 ? (
        <ul className="space-y-1 pl-4 text-[10px] text-white/80">
          {data.bullets.map((bullet) => (
            <li key={bullet} className="list-disc leading-tight">
              {bullet}
            </li>
          ))}
        </ul>
      ) : null}

      {isQueueNode && typeof data.counter === 'number' ? (
        <div className="inline-flex w-fit items-center gap-1 rounded border border-amber-400/35 bg-amber-900/25 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
          <span className="rounded bg-amber-400/20 px-1 py-[1px] text-[9px] leading-none">Q</span>
          <span>{data.counter}</span>
        </div>
      ) : null}
    </div>
  )
}
