import { NodeResizer, type NodeProps } from '@xyflow/react'

import { renderHandles } from './nodePrimitives'
import type { FlowNode } from './types'

const defaultHandles = [] as const

export function GroupNode({ id, data, selected }: NodeProps<FlowNode>) {
  return (
    <div className="relative h-full w-full">
      {renderHandles(id, data.handles, [...defaultHandles])}
      {data.resizable ? (
        <NodeResizer
          isVisible={selected}
          minWidth={data.minSize?.width ?? 480}
          minHeight={data.minSize?.height ?? 360}
          lineClassName="!border-[var(--accent-primary)]/70"
          handleClassName="!h-2.5 !w-2.5 !rounded-md !border !border-[var(--border-default)] !bg-[var(--accent-primary)]"
        />
      ) : null}
      {data.label ? (
        <span className="pointer-events-none absolute left-0 top-0 text-[9px] font-semibold uppercase leading-none tracking-[0.18em] text-[var(--node-group-text)] opacity-45">
          {data.label}
        </span>
      ) : null}
    </div>
  )
}
