import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'

import type { FlowEdge } from '../nodes/types'

export function DashedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  markerEnd,
  data,
}: EdgeProps<FlowEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const edgeState = data as { active?: boolean; dimmed?: boolean } | undefined
  const isActive = Boolean(edgeState?.active)
  const isDimmed = Boolean(edgeState?.dimmed)

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: isActive ? '#fbbf24' : '#475569',
          strokeWidth: isActive ? 1.5 : 1,
          strokeDasharray: '5 4',
          opacity: isDimmed ? 0.2 : 1,
          transition: 'stroke 300ms ease, stroke-width 300ms ease, opacity 220ms ease',
        }}
      />

      {label ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute rounded bg-slate-900/85 px-1.5 py-0.5 text-[9px] text-slate-200"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              opacity: isDimmed ? 0.25 : 1,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
