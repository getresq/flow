import type { NodeProps } from '@xyflow/react'

import { nodeContainerClass, renderHandles } from './nodePrimitives'
import { StandardNodeContent } from './StandardNodeContent'
import type { FlowNode } from './types'

const defaultHandles = [
  { position: 'top', type: 'target' },
  { position: 'bottom', type: 'source' },
] as const

export function RectangleNode({ id, data }: NodeProps<FlowNode>) {
  const status = data.status?.status

  return (
    <div
      className={`${nodeContainerClass({
        color: data.style?.color,
        status,
        borderStyle: data.style?.borderStyle,
      })} rounded-xl`}
    >
      {renderHandles(id, data.handles, [...defaultHandles])}
      <StandardNodeContent data={data} />
    </div>
  )
}
