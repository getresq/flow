import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'

import {
  Badge,
  Card,
  CardContent,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui'
import type { SpanEntry, TraceJourney, TraceStep, TraceStatus } from '../types'
import { formatStepDisplayLabel, getJourneySummaryStep, getOverviewSteps } from '../runPresentation'
import { DurationBadge, formatDurationLabel } from './DurationBadge'
import { PanelSkeleton } from './PanelSkeleton'
import { WaterfallChart } from './WaterfallChart'

type TabKey = 'overview' | 'timing'
type InsightTone = 'neutral' | 'success' | 'warning' | 'error'

interface TraceDetailContentProps {
  journey: TraceJourney
  spans?: SpanEntry[]
  initialTab?: TabKey
  onTabChange?: (tab: TabKey) => void
  onSelectNode?: (nodeId: string) => void
}

interface InsightItem {
  tone: InsightTone
  text: string
}

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

function insightToneClasses(tone: InsightTone): string {
  if (tone === 'success') {
    return 'border-[var(--status-success)] [background-color:color-mix(in_srgb,var(--status-success)_12%,transparent)] text-[var(--text-primary)]'
  }
  if (tone === 'warning') {
    return 'border-[var(--status-warning)] [background-color:color-mix(in_srgb,var(--status-warning)_12%,transparent)] text-[var(--text-primary)]'
  }
  if (tone === 'error') {
    return 'border-[var(--status-error)] [background-color:color-mix(in_srgb,var(--status-error)_12%,transparent)] text-[var(--text-primary)]'
  }
  return 'border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)]'
}

function insightIcon(tone: InsightTone) {
  if (tone === 'success') return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--status-success)]" />
  if (tone === 'warning') return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--status-warning)]" />
  if (tone === 'error') return <XCircle className="mt-0.5 size-4 shrink-0 text-[var(--status-error)]" />
  return <Info className="mt-0.5 size-4 shrink-0 text-[var(--text-muted)]" />
}

function stepDisplayLabel(step: TraceStep): string {
  return formatStepDisplayLabel(step)
}

function stepErrorSummary(stage: TraceStep): string | undefined {
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

export function TraceDetailContent({ journey, spans = [], initialTab, onTabChange, onSelectNode }: TraceDetailContentProps) {
  const [tab, setTab] = useState<TabKey>(initialTab ?? 'overview')
  const [expandedStepId, setExpandedStepId] = useState<string | undefined>()

  const overviewSteps = useMemo(() => getOverviewSteps(journey.steps), [journey.steps])

  const failedStep = useMemo(() => overviewSteps.find((stage) => stage.status === 'error') ?? journey.steps.find((stage) => stage.status === 'error'), [journey.steps, overviewSteps])

  const errorNodeIds = useMemo(() => {
    const ids = new Set<string>()
    for (const step of journey.steps) {
      if (step.status === 'error' && step.nodeId) ids.add(step.nodeId)
    }
    return ids
  }, [journey.steps])

  const slowestStep = useMemo(
    () =>
      [...overviewSteps]
        .filter((stage) => typeof stage.durationMs === 'number')
        .sort((left, right) => (right.durationMs ?? 0) - (left.durationMs ?? 0))[0],
    [overviewSteps],
  )

  const insights = useMemo(() => {
    const items: InsightItem[] = []

    if (journey.status === 'error' && failedStep) {
      items.push({
        tone: 'error',
        text: `This run failed in ${stepDisplayLabel(failedStep)}.`,
      })
    } else if (journey.status === 'running' || journey.status === 'partial') {
      const currentStep = getJourneySummaryStep(journey) ?? journey.steps.at(-1)
      items.push({
        tone: 'warning',
        text: currentStep ? `This run is still active in ${stepDisplayLabel(currentStep)}.` : 'This run is still active.',
      })
    }

    if (slowestStep && slowestStep.durationMs && journey.steps.length > 1) {
      const slowestDuration = formatDurationLabel(slowestStep.durationMs)
      if (slowestDuration) {
          items.push({
            tone: journey.status === 'error' ? 'neutral' : 'warning',
            text: `Most time was spent in ${stepDisplayLabel(slowestStep)} (${slowestDuration}).`,
          })
        }
      }

    if (overviewSteps.length > 0) {
      items.push({
        tone: 'neutral',
        text: `This run reached ${overviewSteps.length} ${overviewSteps.length === 1 ? 'lifecycle step' : 'lifecycle steps'}.`,
      })
    }

    return items.slice(0, 3)
  }, [failedStep, journey, overviewSteps, slowestStep])

  const identifierEntries = useMemo(() => [
    ['mailbox_owner', journey.identifiers.mailboxOwner],
    ['provider', journey.identifiers.provider],
    ['run_id', journey.identifiers.runId],
    ['thread_id', journey.identifiers.threadId],
    ['reply_draft_id', journey.identifiers.replyDraftId],
    ['job_id', journey.identifiers.jobId],
    ['request_id', journey.identifiers.requestId],
    ['content_hash', journey.identifiers.contentHash],
    ['journey_key', journey.identifiers.journeyKey],
  ].filter((entry): entry is [string, string] => Boolean(entry[1])), [journey.identifiers])

  return (
    <Tabs value={tab} onValueChange={(value) => { const next = value as TabKey; setTab(next); onTabChange?.(next) }} className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[var(--border-default)] px-4 py-3">
        <TabsList className="min-h-0 border-none bg-transparent p-0">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timing">Timing</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="overview" className="mt-0 min-h-0 flex-1 pt-0">
        <ScrollArea className="h-full">
          <div className="space-y-4 px-4 py-3">
            {insights.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Key Insights</h3>
                {insights.map((insight, index) => (
                  <div
                    key={`${insight.text}-${index}`}
                    className={`flex items-start gap-2.5 rounded-lg border border-l-[3px] p-3 text-sm leading-6 ${insightToneClasses(insight.tone)}`}
                  >
                    {insightIcon(insight.tone)}
                    <span>{insight.text}</span>
                  </div>
                ))}
              </section>
            ) : null}

            <section className="space-y-2">
              <h3 className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Path Through Flow</h3>
              {overviewSteps.length === 0 ? (
                <PanelSkeleton lines={2} />
              ) : (
                <div className="relative ml-3">
                    {/* Vertical connecting line */}
                  <div
                    className="absolute left-[7px] top-3 w-px bg-[var(--border-default)]"
                    style={{ height: `calc(100% - 24px)` }}
                  />

                  {overviewSteps.map((stage, index) => {
                    const errorSummary = stepErrorSummary(stage)
                    const isError = stage.status === 'error'
                    const isActive = stage.status === 'running' || stage.status === 'partial'
                    const stepId = stage.instanceId ?? stage.stepId
                    const isExpanded = expandedStepId === stepId
                    const hasAttrs = stage.attrs && Object.keys(stage.attrs).length > 0
                    const dotColor = isError
                      ? 'var(--status-error)'
                      : isActive
                        ? 'var(--status-active)'
                        : stage.status === 'success'
                          ? 'var(--status-success)'
                          : 'var(--text-muted)'

                    return (
                      <div key={stepId ?? `${stage.stepId}-${index}`} className="relative flex gap-3 pb-3">
                          {/* Timeline dot */}
                        <div className="relative z-10 mt-3 flex shrink-0 items-start">
                          <div
                            className="size-[15px] rounded-full border-2 border-[var(--surface-raised)]"
                            style={{
                              backgroundColor: dotColor,
                              boxShadow: isActive ? `0 0 6px ${dotColor}` : undefined,
                              animation: isActive ? 'flowPulse 2s ease-in-out infinite' : undefined,
                            }}
                          />
                        </div>

                        {/* Step card */}
                        <Card
                          className={`flex-1 ${isError ? 'border-l-[3px] border-l-[var(--status-error)]' : ''} ${hasAttrs ? 'cursor-pointer transition-colors hover:bg-[var(--surface-overlay)]/50' : ''}`}
                          onClick={hasAttrs ? () => setExpandedStepId(isExpanded ? undefined : stepId) : undefined}
                        >
                          <CardContent className="p-3">
                            <div className="mb-2 flex items-center gap-2">
                              <span className="text-sm font-medium text-[var(--text-primary)]">{stepDisplayLabel(stage)}</span>
                              <Badge variant={journeyStatusVariant(stage.status)}>{stage.status}</Badge>
                              <DurationBadge durationMs={stage.durationMs} />
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                              <span>step {index + 1}</span>
                              {typeof stage.attempt === 'number' && stage.attempt > 0 ? <span>retry {stage.attempt}</span> : null}
                            </div>
                            {errorSummary ? (
                              <div className="mt-2 rounded-lg border-l-2 border-[var(--status-error)] px-3 py-2 [background-color:color-mix(in_srgb,var(--status-error)_14%,transparent)]">
                                <p className="whitespace-pre-wrap break-all font-mono text-xs leading-5 text-[var(--text-primary)]">{errorSummary}</p>
                              </div>
                            ) : null}
                            {isExpanded && hasAttrs ? (
                              <pre className="mt-3 max-w-full overflow-hidden whitespace-pre-wrap break-all rounded-lg border border-[var(--border-default)] bg-[var(--surface-primary)] p-3 text-xs text-[var(--text-primary)]">
                                {JSON.stringify(stage.attrs, null, 2)}
                              </pre>
                            ) : null}
                          </CardContent>
                        </Card>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {identifierEntries.length > 0 ? (
              <details className="min-w-0 overflow-hidden rounded-lg border border-[var(--border-default)]">
                <summary className="cursor-pointer p-3 text-xs text-[var(--text-muted)]">Run details</summary>
                <div className="mx-3 mb-3 space-y-1.5">
                  {identifierEntries.map(([label, value]) => (
                    <div key={label} className="flex items-baseline gap-2 text-xs">
                      <span className="shrink-0 text-[var(--text-muted)]">{label}</span>
                      <span className="min-w-0 break-all font-mono text-[var(--text-primary)]">{value}</span>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="timing" className="mt-0 min-h-0 flex-1 pt-0">
        <ScrollArea className="h-full">
          <div className="px-4 py-3">
            <WaterfallChart spans={spans} errorNodeIds={errorNodeIds} onSelectNode={onSelectNode} />
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  )
}
