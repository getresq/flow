import { NodeResizer, type NodeProps } from '@xyflow/react'

import { renderHandles } from './nodePrimitives'
import type { FlowNode } from './types'

const defaultHandles = [] as const

export function GroupNode({ id, data, selected }: NodeProps<FlowNode>) {
  const label = data.label.trim()

  return (
    <div className="relative h-full w-full rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--surface-overlay)]/20">
      {renderHandles(id, data.handles, [...defaultHandles])}
      {label ? (
        <div className="absolute left-3 top-2 max-w-[calc(100%-1.5rem)] rounded-md bg-[var(--surface-raised)]/90 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)] shadow-sm">
          <span className="block truncate">{label}</span>
        </div>
      ) : null}
      {data.resizable ? (
        <NodeResizer
          isVisible={selected}
          minWidth={data.minSize?.width ?? 480}
          minHeight={data.minSize?.height ?? 360}
          lineClassName="!border-[var(--accent-primary)]/70"
          handleClassName="!h-2.5 !w-2.5 !rounded-md !border !border-[var(--border-default)] !bg-[var(--accent-primary)]"
        />
      ) : null}
    </div>
  )
}
