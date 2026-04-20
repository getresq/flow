import { ChevronLeft } from 'lucide-react';

import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui';

interface HudIdentityPillProps {
  flowName: string;
  connected: boolean;
  reconnecting: boolean;
  relayWsUrl: string;
  onNavigateBack: () => void;
}

export function HudIdentityPill({
  flowName,
  connected,
  reconnecting,
  relayWsUrl,
  onNavigateBack,
}: HudIdentityPillProps) {
  const connectionLabel = connected ? 'Connected' : reconnecting ? 'Reconnecting…' : 'Disconnected';
  const connectionTooltip = connected
    ? `Connected to relay at ${relayWsUrl}`
    : reconnecting
      ? `Reconnecting to relay at ${relayWsUrl}`
      : `Disconnected from relay at ${relayWsUrl}`;

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="hud"
        size="icon"
        className="size-7"
        aria-label="Back to flows"
        onClick={onNavigateBack}
      >
        <ChevronLeft className="size-4" />
      </Button>

      <span className="max-w-[180px] truncate text-sm font-medium text-[var(--text-primary)]">
        {flowName}
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label={connectionLabel}
            className={`ml-1 inline-flex size-2 shrink-0 rounded-full ${
              connected
                ? 'bg-[var(--status-success)]'
                : reconnecting
                  ? 'animate-flow-pulse bg-[var(--status-warning)]'
                  : 'bg-[var(--status-error)]'
            }`}
          />
        </TooltipTrigger>
        <TooltipContent>{connectionTooltip}</TooltipContent>
      </Tooltip>
    </div>
  );
}
