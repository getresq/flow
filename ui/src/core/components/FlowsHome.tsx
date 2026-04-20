import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { MoonStar, SunMedium, Zap } from 'lucide-react';

import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui';

import { useRegisteredFlows } from '../../flows';
import { useLayoutStore } from '../../stores/layout';
import { getMockFlowMetrics, type FlowMetricsSnapshot } from '../mockMetrics';
import type { FlowConfig } from '../types';
import { FlowHealthCard } from './FlowHealthCard';

interface FlowsHomeProps {
  registeredFlows?: FlowConfig[];
  initialMetrics?: FlowMetricsSnapshot[];
}

export function FlowsHome({
  registeredFlows: registeredFlowsInput,
  initialMetrics,
}: FlowsHomeProps) {
  const registryFlows = useRegisteredFlows();
  const registeredFlows = registeredFlowsInput ?? registryFlows;
  const navigate = useNavigate();
  const setCommandPaletteOpen = useLayoutStore((state) => state.setCommandPaletteOpen);
  const theme = useLayoutStore((state) => state.theme);
  const setTheme = useLayoutStore((state) => state.setTheme);

  const { data: metrics = initialMetrics ?? [] } = useQuery({
    queryKey: ['flows-home', registeredFlows.map((flow) => flow.id)],
    queryFn: async () => {
      // TODO: wire to useQuery when relay endpoint exists
      return initialMetrics ?? getMockFlowMetrics(registeredFlows);
    },
    initialData: initialMetrics,
  });

  const metricMap = new Map(metrics.map((entry) => [entry.flowId, entry]));

  return (
    <main className="min-h-screen bg-[var(--surface-primary)] text-[var(--text-primary)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Flows</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Health, throughput, and recent run quality across every registered flow.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  >
                    {theme === 'dark' ? (
                      <SunMedium className="size-4 transition-transform duration-150 ease-out" />
                    ) : (
                      <MoonStar className="size-4 transition-transform duration-150 ease-out" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button type="button" variant="outline" onClick={() => setCommandPaletteOpen(true)}>
              Cmd+K
            </Button>
          </div>
        </header>

        {registeredFlows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Zap className="size-10 text-[var(--text-muted)]" />
            <p className="text-lg font-medium text-[var(--text-secondary)]">No flows registered</p>
            <p className="text-sm text-[var(--text-muted)]">
              Register flows in the flow config to see them here.
            </p>
          </div>
        ) : (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {registeredFlows.map((flow) => (
              <FlowHealthCard
                key={flow.id}
                flow={flow}
                metrics={metricMap.get(flow.id) ?? getMockFlowMetrics([flow])[0]}
                onSelect={(flowId) => navigate(`/flows/${flowId}?mode=live`)}
              />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
