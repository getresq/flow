import { Button, ScrollArea } from '@/components/ui'

import type { LogEntry } from '../types'

interface EventDetailContentProps {
  entry: LogEntry
  nodeLabel?: string
  hasJourney: boolean
  onOpenRun?: (traceId: string) => void
}

export function EventDetailContent({
  entry,
  hasJourney,
  onOpenRun,
}: EventDetailContentProps) {
  const displayMessage = entry.message
  const errorMessage = typeof entry.attributes?.error_message === 'string' ? entry.attributes.error_message : undefined
  const showErrorBlock = entry.level === 'error' || Boolean(errorMessage)
  const errorSummary = errorMessage ?? entry.message
  const runId = entry.runId
  // Error events: the error block IS the content, message would be redundant.
  // Non-error events: the message IS the content — it's why the user clicked.
  const showMessage = !showErrorBlock

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 px-4 py-3">
        {showErrorBlock ? (
          <div className="rounded-lg border-l-2 border-[var(--status-error)] px-3 py-3 [background-color:color-mix(in_srgb,var(--status-error)_14%,transparent)]">
            <h3 className="text-xs uppercase tracking-wide text-[var(--status-error)]">Error</h3>
            <p className="mt-2 whitespace-pre-wrap break-all font-mono text-xs leading-5 text-[var(--text-primary)]">{errorSummary}</p>
          </div>
        ) : null}

        {showMessage ? (
          <p className="text-sm leading-6 text-[var(--text-primary)]">{displayMessage}</p>
        ) : null}

        {hasJourney && runId && onOpenRun ? (
          <Button
            type="button"
            variant="outline"
            className="w-full cursor-pointer border-[var(--border-default)] text-sm text-[var(--text-primary)] hover:bg-[var(--surface-overlay)]"
            onClick={() => onOpenRun(runId)}
          >
            View run
          </Button>
        ) : null}

        <details className="min-w-0 overflow-hidden rounded-lg border border-[var(--border-default)]">
          <summary className="cursor-pointer p-3 text-xs text-[var(--text-muted)]">Raw telemetry</summary>
          <pre className="mx-3 mb-3 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-[var(--border-default)] bg-[var(--surface-primary)] p-3 text-xs text-[var(--text-primary)]">
            {JSON.stringify(entry.attributes ?? {}, null, 2)}
          </pre>
        </details>
      </div>
    </ScrollArea>
  )
}
