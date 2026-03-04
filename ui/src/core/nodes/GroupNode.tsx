import { NodeResizer, type NodeProps } from '@xyflow/react'

import { renderHandles, resolveTone } from './nodePrimitives'
import type { FlowNode } from './types'

const defaultHandles = [] as const

export function GroupNode({ id, data, selected }: NodeProps<FlowNode>) {
  const tone = resolveTone(data.style?.color)

  return (
    <div
      className={`h-full w-full rounded-xl border-2 border-dashed ${tone.border} ${tone.bg} px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] ${tone.text}`}
    >
      {renderHandles(id, data.handles, [...defaultHandles])}
      {data.resizable ? (
        <NodeResizer
          isVisible={selected}
          minWidth={data.minSize?.width ?? 480}
          minHeight={data.minSize?.height ?? 360}
          lineClassName="!border-sky-500/70"
          handleClassName="!h-2.5 !w-2.5 !rounded !border !border-sky-200 !bg-sky-500"
        />
      ) : null}
      {data.label ? data.label : null}
    </div>
  )
}
