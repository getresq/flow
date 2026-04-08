import type { NodeProps } from '@xyflow/react'

import { NodeStatusBadge } from '../components/NodeStatusBadge'
import { nodeContainerClass, renderHandles } from './nodePrimitives'
import type { FlowNode } from './types'

const defaultHandles = [
  { position: 'top', type: 'target' },
  { position: 'left', type: 'source' },
  { position: 'right', type: 'source' },
] as const

export function OctagonNode({ id, data }: NodeProps<FlowNode>) {
  const status = data.status?.status ?? 'idle'

  return (
    <div className="relative h-28 w-44">
      {renderHandles(id, data.handles, [...defaultHandles])}
      <div
        className={`${nodeContainerClass({
          color: data.style?.color ?? 'detail',
          status,
        })} flex h-full w-full items-center justify-center px-4 text-center`}
        style={{ clipPath: 'polygon(18% 0%, 82% 0%, 100% 18%, 100% 82%, 82% 100%, 18% 100%, 0% 82%, 0% 18%)' }}
      >
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide">{data.label}</p>
          <NodeStatusBadge status={status} />
        </div>
      </div>
    </div>
  )
}
