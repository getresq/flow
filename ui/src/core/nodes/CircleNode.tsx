import type { NodeProps } from '@xyflow/react'

import { NodeStatusBadge } from '../components/NodeStatusBadge'
import { nodeContainerClass, renderHandles, resolveIcon } from './nodePrimitives'
import type { FlowNode } from './types'

const defaultHandles = [
  { position: 'top', type: 'both' },
  { position: 'right', type: 'both' },
  { position: 'bottom', type: 'both' },
  { position: 'left', type: 'both' },
] as const

export function CircleNode({ id, data }: NodeProps<FlowNode>) {
  const status = data.status?.status ?? 'idle'
  const icon = resolveIcon(data.style?.icon)

  return (
    <div className="relative h-28 w-28">
      {renderHandles(id, data.handles, [...defaultHandles])}
      <div
        className={`${nodeContainerClass({
          color: data.style?.color,
          status,
        })} flex h-full w-full flex-col items-center justify-center rounded-full p-3 text-center`}
      >
        {icon ? (
          <span className="mb-1 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-white/15 px-1 text-[10px] font-bold">
            {icon}
          </span>
        ) : null}
        <p className="text-[11px] font-semibold">{data.label}</p>
        <NodeStatusBadge
          className="mt-1"
          status={status}
          durationMs={data.status?.durationMs}
          durationVisibleUntil={data.status?.durationVisibleUntil}
        />
      </div>
    </div>
  )
}
