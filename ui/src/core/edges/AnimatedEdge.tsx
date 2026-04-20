import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';

import type { FlowEdge } from '../nodes/types';

const PARTICLE_FADE_MS = 3_000;

export function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  label,
  data,
}: EdgeProps<FlowEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeState = data as { active?: boolean; dimmed?: boolean } | undefined;
  const isActive = Boolean(edgeState?.active);
  const isDimmed = Boolean(edgeState?.dimmed);

  // Track when the edge was last active for fade-out
  const [showParticle, setShowParticle] = useState(false);
  const fadeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isActive) {
      setShowParticle(true);
      if (fadeTimerRef.current !== null) {
        window.clearTimeout(fadeTimerRef.current);
      }
      fadeTimerRef.current = null;
    } else if (showParticle) {
      fadeTimerRef.current = window.setTimeout(() => {
        setShowParticle(false);
        fadeTimerRef.current = null;
      }, PARTICLE_FADE_MS);
    }

    return () => {
      if (fadeTimerRef.current !== null) {
        window.clearTimeout(fadeTimerRef.current);
      }
    };
  }, [isActive]);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: isActive ? 'var(--color-active)' : 'var(--color-edge)',
          strokeWidth: isActive ? 1.5 : 1,
          opacity: isDimmed ? 0.2 : 1,
          transition: 'stroke 300ms ease, stroke-width 300ms ease, opacity 220ms ease',
        }}
      />

      {showParticle && !isDimmed ? (
        <>
          <path id={`particle-path-${id}`} d={edgePath} fill="none" stroke="none" />
          <circle
            r={2.5}
            fill="var(--color-active)"
            opacity={isActive ? 0.9 : 0.4}
            style={{ transition: 'opacity 600ms ease' }}
          >
            <animateMotion dur="1.2s" repeatCount="indefinite" path={edgePath} />
          </circle>
        </>
      ) : null}

      {label ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute rounded px-2 py-0.5 text-[10px] font-mono text-[var(--text-muted)]"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              opacity: isDimmed ? 0.15 : 0.55,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
