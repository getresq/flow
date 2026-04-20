import type { NodeProps } from '@xyflow/react';

import { nodeContainerClass, renderHandles } from './nodePrimitives';
import { StandardNodeContent } from './StandardNodeContent';
import type { FlowNode } from './types';

const defaultHandles = [
  { position: 'top', type: 'target' },
  { position: 'bottom', type: 'source' },
] as const;

export function RoundedRectNode({ id, data }: NodeProps<FlowNode>) {
  const status = data.status?.status;

  return (
    <div className="relative h-full rounded-xl">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-xl bg-[var(--flow-surface-bg)]"
      />
      <div
        className={`${nodeContainerClass({
          color: data.style?.color,
          status,
        })} relative h-full rounded-xl`}
      >
        {renderHandles(id, data.handles, [...defaultHandles])}
        <StandardNodeContent data={data} />
      </div>
    </div>
  );
}
