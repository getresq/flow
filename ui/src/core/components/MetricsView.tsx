import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';

import { getMockFlowMetric, type MetricsWindow } from '../mockMetrics';
import type { FlowConfig, TraceJourney } from '../types';
import { RunsTable } from './RunsTable';
import { Sparkline } from './Sparkline';
import { StatMini } from './StatMini';

interface MetricsViewProps {
  flow: FlowConfig;
  selectedTraceId?: string;
  onSelectTrace: (traceId?: string) => void;
}

function recentRunsToJourneys(
  flow: FlowConfig,
  recentRuns: ReturnType<typeof getMockFlowMetric>['recentRuns'],
): TraceJourney[] {
  return recentRuns.map((run) => ({
    traceId: run.traceId,
    rootEntity: run.rootEntity,
    startedAt: run.lastUpdatedAt,
    durationMs: run.durationMs,
    status: run.status,
    steps: [
      {
        stepId: run.currentStep,
        label: run.currentStep,
        startSeq: 0,
        endSeq: 0,
        startTs: run.lastUpdatedAt,
        durationMs: run.durationMs,
        status: run.status,
      },
    ],
    nodePath: [],
    errorSummary: run.errorSummary,
    lastUpdatedAt: run.lastUpdatedAt,
    eventCount: 0,
    identifiers: {
      flowId: flow.id,
    },
  }));
}

export function MetricsView({ flow, selectedTraceId, onSelectTrace }: MetricsViewProps) {
  const [timeWindow, setTimeWindow] = useState<MetricsWindow>('24h');
  const { data: metrics } = useQuery({
    queryKey: ['flow-metrics-view', flow.id, timeWindow],
    queryFn: async () => {
      // TODO: wire to useQuery when relay endpoint exists
      return getMockFlowMetric(flow, timeWindow);
    },
  });

  const recentJourneys = useMemo(
    () => recentRunsToJourneys(flow, metrics?.recentRuns ?? []),
    [flow, metrics?.recentRuns],
  );

  if (!metrics) {
    return null;
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden px-4 py-4 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Metrics</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Aggregated health and recent run quality for {flow.name}.
          </p>
        </div>

        <Select value={timeWindow} onValueChange={(value) => setTimeWindow(value as MetricsWindow)}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">Last 1h</SelectItem>
            <SelectItem value="6h">Last 6h</SelectItem>
            <SelectItem value="24h">Last 24h</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-3">
            <StatMini label="Runs" value={metrics.runCount} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3">
            <StatMini
              label="Success rate"
              value={`${metrics.successRate}%`}
              trend="Stable"
              tone="success"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3">
            <StatMini label="p95 latency" value={`${metrics.p95Ms}ms`} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3">
            <StatMini
              label="Errors"
              value={metrics.errorCount}
              trend="Needs watch"
              tone="warning"
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Throughput</CardTitle>
            <CardDescription>Runs over time</CardDescription>
          </CardHeader>
          <CardContent>
            <Sparkline
              data={metrics.throughputSeries}
              className="h-20"
              ariaLabel="Throughput sparkline"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Errors</CardTitle>
            <CardDescription>Failures over time</CardDescription>
          </CardHeader>
          <CardContent>
            <Sparkline
              data={metrics.errorSeries}
              variant="error"
              className="h-20"
              ariaLabel="Error sparkline"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Latency</CardTitle>
            <CardDescription>p95 trend</CardDescription>
          </CardHeader>
          <CardContent>
            <Sparkline
              data={metrics.latencySeries}
              className="h-20"
              ariaLabel="Latency sparkline"
            />
          </CardContent>
        </Card>
      </section>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
          <CardDescription>Use the same run table interactions without the canvas.</CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 overflow-auto pt-0">
          <RunsTable
            journeys={recentJourneys}
            selectedTraceId={selectedTraceId}
            onSelectTrace={onSelectTrace}
          />
        </CardContent>
      </Card>
    </div>
  );
}
