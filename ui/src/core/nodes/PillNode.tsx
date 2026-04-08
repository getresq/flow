import type { NodeProps } from '@xyflow/react'

import { nodeContainerClass, renderHandles } from './nodePrimitives'
import { StandardNodeContent } from './StandardNodeContent'
import type { FlowNode } from './types'

const defaultHandles = [{ position: 'right', type: 'source' }] as const

export function PillNode({ id, data }: NodeProps<FlowNode>) {
  const status = data.status?.status ?? 'idle'

  return (
    <div
      className={`${nodeContainerClass({
        color: data.style?.color,
        status,
      })} relative rounded-full`}
    >
      {renderHandles(id, data.handles, [...defaultHandles])}
      <StandardNodeContent data={data} compact />
    </div>
  )
}
