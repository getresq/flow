import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { firstClassColors } from './nodePrimitives';
import type { FlowNodeData } from './types';

interface StandardNodeContentProps {
  data: FlowNodeData;
  compact?: boolean;
}

function useIsTruncated(ref: React.RefObject<HTMLElement | null>) {
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () =>
      setTruncated(el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return truncated;
}

function TitleWithTooltip({ label, className }: { label: string; className: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const isTruncated = useIsTruncated(ref);

  const title = (
    <p ref={ref} className={className}>
      {label}
    </p>
  );

  if (!isTruncated) return title;

  return (
    <Tooltip delayDuration={250}>
      <TooltipTrigger asChild>{title}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function StandardNodeContent({ data, compact = false }: StandardNodeContentProps) {
  const color = data.style?.color;
  const isFirstClass = color ? firstClassColors.has(color) : false;
  const eyebrow = data.eyebrow ?? null;

  if (!isFirstClass) {
    return (
      <div className="flex h-full items-center px-3.5 py-2">
        <TitleWithTooltip
          label={data.label}
          className="w-full truncate text-[11px] font-medium leading-tight"
        />
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'flex h-full flex-col justify-center gap-1',
        compact ? 'px-3 py-2' : 'px-3.5 py-2.5',
      )}
    >
      {eyebrow ? (
        <span
          className="node-role-tag text-[9px] font-semibold uppercase tracking-[0.12em] opacity-55"
          style={{ color: 'var(--node-accent)' }}
        >
          {eyebrow}
        </span>
      ) : null}

      <TitleWithTooltip
        label={data.label}
        className="node-title-clamp text-[12px] font-medium leading-snug text-[var(--text-primary)]"
      />

      {data.sublabel ? (
        <p className="truncate text-[10px] leading-tight text-[var(--text-secondary)] opacity-60">
          {data.sublabel}
        </p>
      ) : null}
    </div>
  );
}
