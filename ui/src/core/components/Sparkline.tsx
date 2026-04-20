import { cn } from '@/lib/utils';

interface SparklineProps {
  data: number[];
  variant?: 'default' | 'error';
  className?: string;
  ariaLabel?: string;
}

function buildPoints(data: number[], width: number, height: number): string {
  if (data.length === 0) {
    return '';
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  return data
    .map((value, index) => {
      const x = data.length === 1 ? width / 2 : (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');
}

export function Sparkline({ data, variant = 'default', className, ariaLabel }: SparklineProps) {
  const width = 100;
  const height = 24;
  const points = buildPoints(data, width, height);

  return (
    <svg
      className={cn('w-full overflow-visible', className)}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel ?? `${variant} sparkline`}
    >
      <polyline
        data-testid="sparkline-polyline"
        points={points}
        fill="none"
        stroke={variant === 'error' ? 'var(--status-error)' : 'var(--accent-primary)'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
