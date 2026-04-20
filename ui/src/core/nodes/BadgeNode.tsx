import type { NodeProps } from '@xyflow/react';

import { nodeContainerClass, renderHandles } from './nodePrimitives';
import type { FlowNode } from './types';

const defaultHandles = [
  { position: 'top', type: 'target' },
  { position: 'bottom', type: 'source' },
] as const;

export function BadgeNode({ id, data }: NodeProps<FlowNode>) {
  const status = data.status?.status ?? 'idle';

  return (
    <div className="relative rounded-md">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-md bg-[var(--flow-surface-bg)]"
      />
      <div
        className={`${nodeContainerClass({
          color: data.style?.color ?? 'muted',
          status,
        })} relative rounded-md px-3 py-2`}
      >
        {renderHandles(id, data.handles, [...defaultHandles])}
        <p className="truncate text-[11px] leading-tight opacity-80">{data.label}</p>
      </div>
    </div>
  );
}
