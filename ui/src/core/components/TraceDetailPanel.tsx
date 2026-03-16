import { useEffect, useMemo, useState } from 'react'

import { formatEasternTime } from '../time'
import type { TraceJourney, TraceStage, TraceStatus } from '../types'
import { DurationBadge } from './DurationBadge'

type TabKey = 'overview' | 'advanced'
type InsightTone = 'neutral' | 'success' | 'warning' | 'error'

interface TraceDetailPanelProps {
  journey: TraceJourney
  onClose: () => void
}

interface InsightItem {
  tone: InsightTone
  text: string
}

function statusClass(status: TraceStatus): string {
  if (status === 'error') {
    return 'bg-rose-500/20 text-rose-200 border-rose-500/40'
  }
  if (status === 'success') {
    return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
  }
  if (status === 'partial') {
    return 'bg-amber-500/20 text-amber-200 border-amber-500/40'
  }
  return 'bg-sky-500/20 text-sky-200 border-sky-500/40'
}

function insightToneClasses(tone: InsightTone): string {
  if (tone === 'success') {
    return 'border-emerald-500/30 bg-emerald-950/30 text-emerald-100'
  }
  if (tone === 'warning') {
    return 'border-amber-500/30 bg-amber-950/30 text-amber-100'
  }
  if (tone === 'error') {
    return 'border-rose-500/30 bg-rose-950/30 text-rose-100'
  }
  return 'border-slate-700 bg-slate-900/60 text-slate-200'
}

function formatDurationText(durationMs?: number): string | null {
  if (typeof durationMs !== 'number') {
    return null
  }

  if (durationMs < 1_000) {
    return `${Math.round(durationMs)}ms`
  }

  return `${(durationMs / 1_000).toFixed(1)}s`
}

function stepLabel(step: TraceStage): string {
  return step.label || step.nodeId || step.stageId
}

function stageErrorSummary(stage: TraceStage): string | undefined {
  const attrs = stage.attrs
  const errorMessage = typeof attrs?.error_message === 'string' ? attrs.error_message : undefined
  const errorClass = typeof attrs?.error_class === 'string' ? attrs.error_class : undefined
  const errorCode = typeof attrs?.error_code === 'string' ? attrs.error_code : undefined
  const retryable = typeof attrs?.retryable === 'boolean' ? attrs.retryable : undefined

  if (errorMessage) {
    return errorMessage
  }

  if (errorClass && errorCode) {
    return retryable === undefined ? `${errorClass}:${errorCode}` : `${errorClass}:${errorCode} retryable=${retryable}`
  }

  if (errorClass || errorCode) {
    return [errorClass, errorCode].filter(Boolean).join(':')
  }

  return stage.errorSummary
}

function defaultSelectedStepId(journey: TraceJourney): string | undefined {
  return journey.stages.find((stage) => stage.status === 'error')?.stageId ?? journey.stages.at(-1)?.stageId
}

export function TraceDetailPanel({ journey, onClose }: TraceDetailPanelProps) {
  const [tab, setTab] = useState<TabKey>('overview')
  const [selectedStageId, setSelectedStageId] = useState<string | undefined>(defaultSelectedStepId(journey))

  useEffect(() => {
    setSelectedStageId(defaultSelectedStepId(journey))
    setTab('overview')
  }, [journey.traceId])

  const selectedStage = useMemo(
    () => journey.stages.find((stage) => stage.stageId === selectedStageId) ?? journey.stages.at(-1) ?? journey.stages[0],
    [journey.stages, selectedStageId],
  )

  const identifierEntries = useMemo(
    () =>
      [
        ['mailbox_owner', journey.identifiers.mailboxOwner],
        ['provider', journey.identifiers.provider],
        ['thread_id', journey.identifiers.threadId],
        ['reply_draft_id', journey.identifiers.replyDraftId],
        ['job_id', journey.identifiers.jobId],
        ['request_id', journey.identifiers.requestId],
        ['content_hash', journey.identifiers.contentHash],
        ['journey_key', journey.identifiers.journeyKey],
      ].filter((entry): entry is [string, string] => Boolean(entry[1])),
    [journey.identifiers],
  )

  const failedStep = useMemo(
    () => journey.stages.find((stage) => stage.status === 'error'),
    [journey.stages],
  )

  const slowestStep = useMemo(
    () =>
      [...journey.stages]
        .filter((stage) => typeof stage.durationMs === 'number')
        .sort((left, right) => (right.durationMs ?? 0) - (left.durationMs ?? 0))[0],
    [journey.stages],
  )

  const insights = useMemo(() => {
    const items: InsightItem[] = []

    if (journey.status === 'error' && failedStep) {
      items.push({
        tone: 'error',
        text: `This run failed in ${stepLabel(failedStep)}.`,
      })
    } else if (journey.status === 'running' || journey.status === 'partial') {
      const currentStep = journey.stages.at(-1)
      items.push({
        tone: 'warning',
        text: currentStep ? `This run is still active in ${stepLabel(currentStep)}.` : 'This run is still active.',
      })
    }

    if (slowestStep && slowestStep.durationMs && journey.stages.length > 1) {
      const slowestDuration = formatDurationText(slowestStep.durationMs)
      if (slowestDuration) {
        items.push({
          tone: journey.status === 'error' ? 'neutral' : 'warning',
          text: `Most time was spent in ${stepLabel(slowestStep)} (${slowestDuration}).`,
        })
      }
    }

    if (journey.stages.length > 1) {
      items.push({
        tone: 'neutral',
        text: `This run reached ${journey.stages.length} steps.`,
      })
    }

    return items.slice(0, 3)
  }, [failedStep, journey.stages, journey.status, slowestStep])

  const focusLabel = failedStep ? 'Failed In' : 'Slowest Step'
  const focusValue = failedStep ? stepLabel(failedStep) : slowestStep ? stepLabel(slowestStep) : 'None yet'
  const focusMeta = !failedStep && slowestStep?.durationMs ? formatDurationText(slowestStep.durationMs) : null

  return (
    <aside
      className="flex w-[380px] flex-col border-l border-slate-700/50 bg-slate-900"
      style={{ transition: 'transform 200ms ease', transform: 'translateX(0)' }}
    >
      <header className="border-b border-slate-700/50 px-4 py-3">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Run</h2>
            <p className="mt-1 text-xs text-slate-500">
              {journey.stages.length} {journey.stages.length === 1 ? 'step' : 'steps'} · updated {formatEasternTime(journey.lastUpdatedAt)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-slate-200">
            close
          </button>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={`rounded border px-2 py-0.5 text-[10px] uppercase ${statusClass(journey.status)}`}>
            {journey.status}
          </span>
          <DurationBadge durationMs={journey.durationMs} />
          {journey.rootEntity ? (
            <span className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-200">
              {journey.rootEntity}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1">
          {identifierEntries.length === 0 ? (
            <span className="text-[10px] text-slate-500">No key IDs on this run yet.</span>
          ) : (
            identifierEntries.slice(0, 4).map(([label, value]) => (
              <span key={label} className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-200">
                {label}: {value}
              </span>
            ))
          )}
        </div>
      </header>

      <div className="flex border-b border-slate-700/50 px-2 py-2">
        {(['overview', 'advanced'] as const).map((tabKey) => (
          <button
            key={tabKey}
            type="button"
            onClick={() => setTab(tabKey)}
            className={`rounded px-3 py-1 text-xs uppercase ${
              tab === tabKey ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            {tabKey === 'advanced' ? 'Advanced telemetry' : 'Overview'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {tab === 'overview' ? (
          <div className="space-y-4">
            <section className="grid grid-cols-2 gap-2">
              <div className="rounded border border-slate-700 bg-slate-900/60 p-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Status</div>
                <div className="mt-1 text-sm capitalize text-slate-100">{journey.status}</div>
              </div>
              <div className="rounded border border-slate-700 bg-slate-900/60 p-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Duration</div>
                <div className="mt-1 text-sm text-slate-100">{formatDurationText(journey.durationMs) ?? 'Running'}</div>
              </div>
              <div className="rounded border border-slate-700 bg-slate-900/60 p-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Last Updated</div>
                <div className="mt-1 text-sm text-slate-100">{formatEasternTime(journey.lastUpdatedAt)}</div>
              </div>
              <div className="rounded border border-slate-700 bg-slate-900/60 p-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">{focusLabel}</div>
                <div className="mt-1 truncate text-sm text-slate-100">{focusValue}</div>
                {focusMeta ? <div className="mt-1 text-[10px] text-slate-500">{focusMeta}</div> : null}
              </div>
            </section>

            {insights.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-[10px] uppercase tracking-wide text-slate-500">Key Insights</h3>
                {insights.map((insight, index) => (
                  <div key={`${insight.text}-${index}`} className={`rounded border p-2 text-xs leading-5 ${insightToneClasses(insight.tone)}`}>
                    {insight.text}
                  </div>
                ))}
              </section>
            ) : null}

            <section className="space-y-2">
              <h3 className="text-[10px] uppercase tracking-wide text-slate-500">Path Through Flow</h3>
              {journey.stages.length === 0 ? (
                <p className="text-xs text-slate-500">No steps recorded yet.</p>
              ) : (
                journey.stages.map((stage, index) => {
                  const errorSummary = stageErrorSummary(stage)
                  return (
                    <div key={`${stage.stageId}-${index}`} className="rounded border border-slate-700 bg-slate-900/50 p-2">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-xs text-slate-100">{stepLabel(stage)}</span>
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${statusClass(stage.status)}`}>
                          {stage.status}
                        </span>
                        <DurationBadge durationMs={stage.durationMs} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                        <span>step {index + 1}</span>
                        {stage.nodeId ? <span>node {stage.nodeId}</span> : null}
                        {typeof stage.attempt === 'number' ? <span>attempt {stage.attempt}</span> : null}
                      </div>
                      {errorSummary ? (
                        <div className="mt-2 rounded border border-rose-500/30 bg-rose-900/20 px-2 py-1 text-[10px] text-rose-200">
                          {errorSummary}
                        </div>
                      ) : null}
                    </div>
                  )
                })
              )}
            </section>
          </div>
        ) : null}

        {tab === 'advanced' ? (
          <div className="space-y-4">
            <section className="rounded border border-slate-700 bg-slate-900/60 p-3">
              <h3 className="text-[10px] uppercase tracking-wide text-slate-500">Run Telemetry</h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded border border-slate-700 bg-slate-950/60 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Raw Events</div>
                  <div className="mt-1 text-sm text-slate-100">{journey.eventCount}</div>
                </div>
                <div className="rounded border border-slate-700 bg-slate-950/60 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Steps</div>
                  <div className="mt-1 text-sm text-slate-100">{journey.stages.length}</div>
                </div>
              </div>
              <div className="mt-3 rounded border border-slate-700 bg-slate-950/60 p-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Run ID</div>
                <code className="mt-1 block break-all text-[11px] text-slate-200">{journey.traceId}</code>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-[10px] uppercase tracking-wide text-slate-500">Step Telemetry</h3>
              <div className="space-y-2">
                {journey.stages.map((stage, index) => {
                  const selected = selectedStage?.stageId === stage.stageId
                  return (
                    <button
                      key={`${stage.stageId}-${index}`}
                      type="button"
                      onClick={() => setSelectedStageId(stage.stageId)}
                      className={`w-full rounded border p-2 text-left ${
                        selected ? 'border-sky-500/60 bg-sky-900/15' : 'border-slate-700 bg-slate-900/50'
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-xs text-slate-100">{stepLabel(stage)}</span>
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${statusClass(stage.status)}`}>
                          {stage.status}
                        </span>
                        <DurationBadge durationMs={stage.durationMs} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                        <span>
                          seq {stage.startSeq} {'->'} {stage.endSeq}
                        </span>
                        {typeof stage.attempt === 'number' ? <span>attempt {stage.attempt}</span> : null}
                        {stage.nodeId ? <span>node {stage.nodeId}</span> : null}
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="rounded border border-slate-700 bg-slate-900/60 p-3">
              <h3 className="text-[10px] uppercase tracking-wide text-slate-500">Selected Step Attributes</h3>
              <pre className="mt-3 overflow-x-auto rounded border border-slate-700 bg-slate-950/70 p-3 text-[11px] text-slate-200">
                {JSON.stringify(selectedStage?.attrs ?? {}, null, 2)}
              </pre>
            </section>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
