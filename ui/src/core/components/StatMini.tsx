import { cn } from '@/lib/utils';

interface StatMiniProps {
  label: string;
  value: string | number;
  trend?: string;
  tone?: 'default' | 'success' | 'warning' | 'error';
  className?: string;
}

function toneClass(tone: NonNullable<StatMiniProps['tone']>) {
  if (tone === 'success') {
    return 'text-[var(--status-success)]';
  }
  if (tone === 'warning') {
    return 'text-[var(--status-warning)]';
  }
  if (tone === 'error') {
    return 'text-[var(--status-error)]';
  }
  return 'text-[var(--text-muted)]';
}

export function StatMini({ label, value, trend, tone = 'default', className }: StatMiniProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <div className="text-base font-semibold text-[var(--text-primary)]">{value}</div>
      <div className="text-xs text-[var(--text-secondary)]">{label}</div>
      {trend ? <div className={cn('text-xs', toneClass(tone))}>{trend}</div> : null}
    </div>
  );
}
