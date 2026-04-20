import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';

import type { FlowMetricsSnapshot } from '../mockMetrics';
import type { FlowConfig } from '../types';
import { Sparkline } from './Sparkline';
import { StatMini } from './StatMini';

interface FlowHealthCardProps {
  flow: FlowConfig;
  metrics: FlowMetricsSnapshot;
  onSelect: (flowId: string) => void;
}

function healthVariant(
  health: FlowMetricsSnapshot['health'],
): 'success' | 'warning' | 'destructive' {
  if (health === 'error') {
    return 'destructive';
  }
  if (health === 'warning') {
    return 'warning';
  }
  return 'success';
}

export function FlowHealthCard({ flow, metrics, onSelect }: FlowHealthCardProps) {
  return (
    <button type="button" className="w-full text-left" onClick={() => onSelect(flow.id)}>
      <Card className="cursor-pointer transition-colors hover:border-[var(--border-accent)]">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle>{flow.name}</CardTitle>
            {flow.description ? (
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{flow.description}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {!flow.hasGraph ? <Badge variant="secondary">Headless</Badge> : null}
            <Badge variant={healthVariant(metrics.health)}>{metrics.health}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-4 md:grid-cols-3">
            <StatMini label="Runs/24h" value={metrics.runCount} />
            <StatMini label="Success" value={`${metrics.successRate}%`} />
            <StatMini label="p95" value={`${metrics.p95Ms}ms`} />
          </div>
          <div className="flex gap-3">
            <Sparkline data={metrics.throughputSeries} className="h-6 flex-1" />
            <Sparkline data={metrics.errorSeries} className="h-6 w-16" variant="error" />
          </div>
        </CardContent>
      </Card>
    </button>
  );
}
