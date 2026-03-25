import type { ReactNode } from 'react'

import { Badge } from '@/components/ui'

import { formatEasternTime } from '../time'
import type { TraceJourney, TraceStatus } from '../types'
import { formatRunLabel, getOverviewStages } from '../runPresentation'
import { DurationBadge } from './DurationBadge'

function journeyStatusVariant(status: TraceStatus): 'default' | 'destructive' | 'success' | 'warning' {
  if (status === 'error') {
    return 'destructive'
  }
  if (status === 'success') {
    return 'success'
  }
  if (status === 'partial') {
    return 'warning'
  }
  return 'default'
}

export function getTraceInspectorPresentation(journey: TraceJourney): {
  title: string
  description: string
  headerContent: ReactNode
} {
  const overviewStages = getOverviewStages(journey.stages)
  const lifecycleStepCount = overviewStages.length
  const identifierEntries = [
    ['mailbox_owner', journey.identifiers.mailboxOwner],
    ['provider', journey.identifiers.provider],
    ['thread_id', journey.identifiers.threadId],
    ['reply_draft_id', journey.identifiers.replyDraftId],
    ['job_id', journey.identifiers.jobId],
    ['request_id', journey.identifiers.requestId],
    ['content_hash', journey.identifiers.contentHash],
    ['journey_key', journey.identifiers.journeyKey],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]))

  return {
    title: 'Run',
    description: `${lifecycleStepCount} ${lifecycleStepCount === 1 ? 'lifecycle step' : 'lifecycle steps'} · updated ${formatEasternTime(journey.lastUpdatedAt)}`,
    headerContent: (
      <>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant={journeyStatusVariant(journey.status)}>{journey.status}</Badge>
          <DurationBadge durationMs={journey.durationMs} />
          <Badge variant="secondary">{formatRunLabel(journey)}</Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          {identifierEntries.length === 0 ? (
            <span className="text-xs text-[var(--text-muted)]">No key IDs on this run yet.</span>
          ) : (
            identifierEntries.slice(0, 4).map(([label, value]) => (
              <Badge key={label} variant="secondary">
                {label}: {value}
              </Badge>
            ))
          )}
        </div>
      </>
    ),
  }
}
