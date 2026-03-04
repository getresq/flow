import type { NodeProps } from '@xyflow/react'

import { NodeStatusBadge } from '../components/NodeStatusBadge'
import { renderHandles, resolveTone, statusGlowClass } from './nodePrimitives'
import type { FlowNode } from './types'

const defaultHandles = [
  { position: 'top', type: 'both' },
  { position: 'right', type: 'both' },
  { position: 'bottom', type: 'both' },
  { position: 'left', type: 'both' },
] as const

export function CylinderNode({ id, data }: NodeProps<FlowNode>) {
  const status = data.status?.status ?? 'idle'
  const tone = resolveTone(data.style?.color)

  return (
    <div className="relative h-28 w-24">
      {renderHandles(id, data.handles, [...defaultHandles])}
      <svg
        viewBox="0 0 96 112"
        className={`h-full w-full drop-shadow-sm ${statusGlowClass(status)}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <clipPath id={`cyl-clip-${id}`}>
            <path d="M 0 20 Q 0 0, 48 0 Q 96 0, 96 20 L 96 92 Q 96 112, 48 112 Q 0 112, 0 92 Z" />
          </clipPath>
        </defs>
        <path
          d="M 0 20 Q 0 0, 48 0 Q 96 0, 96 20 L 96 92 Q 96 112, 48 112 Q 0 112, 0 92 Z"
          className={`${tone.bg} stroke-current ${tone.text}`}
          strokeWidth="1.5"
          strokeOpacity="0.5"
          fillOpacity="0.85"
        />
        <ellipse
          cx="48"
          cy="20"
          rx="48"
          ry="20"
          className={`${tone.bg} stroke-current ${tone.text}`}
          strokeWidth="1.5"
          strokeOpacity="0.5"
          fillOpacity="1"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-4">
        <p className={`text-[11px] font-semibold ${tone.text}`}>{data.label}</p>
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
