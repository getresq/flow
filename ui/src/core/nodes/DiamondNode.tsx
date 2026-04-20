import type { NodeProps } from '@xyflow/react';

import { nodeContainerClass, renderHandles } from './nodePrimitives';
import type { FlowNode } from './types';

const defaultHandles = [
  { id: 'in-top', position: 'top', type: 'target' },
  { id: 'out-right', position: 'right', type: 'source' },
  { id: 'out-bottom', position: 'bottom', type: 'source' },
  { id: 'out-left', position: 'left', type: 'source' },
] as const;

export function DiamondNode({ id, data }: NodeProps<FlowNode>) {
  const status = data.status?.status ?? 'idle';

  return (
    <div className="relative h-full w-full">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rotate-45 rounded-[14px] bg-[var(--flow-surface-bg)]"
        style={{ borderWidth: 2 }}
      />
      {renderHandles(id, data.handles, [...defaultHandles])}
      <div
        className={`${nodeContainerClass({
          color: data.style?.color ?? 'violet',
          status,
        })} relative flex h-full w-full rotate-45 items-center justify-center rounded-[14px]`}
        style={{ borderWidth: 2 }}
      >
        <div className="-rotate-45 px-2 text-center">
          <p className="node-title-clamp text-[11px] font-medium leading-tight">{data.label}</p>
        </div>
      </div>
    </div>
  );
}
