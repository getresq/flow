import type { NodeProps } from '@xyflow/react'

import { nodeContainerClass, renderHandles } from './nodePrimitives'
import type { FlowNode } from './types'

const defaultHandles = [
  { position: 'top', type: 'target' },
  { position: 'bottom', type: 'source' },
] as const

export function BadgeNode({ id, data }: NodeProps<FlowNode>) {
  const status = data.status?.status ?? 'idle'

  return (
    <div
      className={`${nodeContainerClass({
        color: data.style?.color ?? 'detail',
        status,
      })} relative rounded-md px-2.5 py-1.5`}
    >
      {renderHandles(id, data.handles, [...defaultHandles])}
      <p className="truncate text-[11px] leading-tight opacity-80">{data.label}</p>
    </div>
  )
}
