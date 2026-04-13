import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  DEFAULT_BROWSER_HISTORY_LIMIT,
  DEFAULT_BROWSER_HISTORY_WINDOW,
  HistoryCursorInvalidationError,
  MAX_BROWSER_HISTORY_PAGES,
  type HistoryWindowRange,
  fetchHistoryPage,
} from '../api/history'
import { compareFlowEventsForDisplay, getEventMergeKey } from '../events'
import type { FlowEvent } from '../types'

interface UseFlowActivityInput {
  flowId: string
  wsUrl: string
  liveEvents: FlowEvent[]
  wasLiveBufferTruncated: boolean
}

export interface FlowActivityState {
  events: FlowEvent[]
  liveEvents: FlowEvent[]
  retainedHistoryEvents: FlowEvent[]
  warnings: string[]
  isBackfilling: boolean
  hasMoreOlder: boolean
  wasLiveBufferTruncated: boolean
  historyLimitReached: boolean
  anchorTo?: string
  loadedWindow?: HistoryWindowRange
  loadOlder: () => Promise<void>
  resetRetainedHistory: () => void
}

interface RetainedHistoryState {
  events: FlowEvent[]
  warnings: string[]
  anchorTo?: string
  loadedWindow?: HistoryWindowRange
  nextCursor?: string
  hasMoreOlder: boolean
  pageCount: number
  historyLimitReached: boolean
}

const EMPTY_HISTORY_STATE: RetainedHistoryState = {
  events: [],
  warnings: [],
  hasMoreOlder: false,
  pageCount: 0,
  historyLimitReached: false,
}

function mergeWarnings(left: string[], right: string[]): string[] {
  return [...new Set([...left, ...right])]
}

function applyHistoryPage(
  previous: RetainedHistoryState,
  page: Awaited<ReturnType<typeof fetchHistoryPage>>,
  options?: { replace?: boolean },
): RetainedHistoryState {
  const replace = options?.replace ?? false
  const mergedHistoryMap = new Map<string, FlowEvent>()
  if (!replace) {
    for (const event of previous.events) {
      mergedHistoryMap.set(getEventMergeKey(event), event)
    }
  }
  for (const event of page.events) {
    mergedHistoryMap.set(getEventMergeKey(event), event)
  }

  const priorPageCount = replace ? 0 : previous.pageCount
  const nextPageCount = priorPageCount + 1
  const anchorTo = replace ? page.anchorTo : previous.anchorTo ?? page.anchorTo
  const historyLimitReached = page.hasMoreOlder && nextPageCount >= MAX_BROWSER_HISTORY_PAGES

  return {
    events: [...mergedHistoryMap.values()].sort(compareFlowEventsForDisplay),
    warnings: mergeWarnings(replace ? [] : previous.warnings, page.warnings),
    anchorTo,
    loadedWindow: {
      from: page.from,
      to: anchorTo,
    },
    nextCursor: historyLimitReached ? undefined : page.nextCursor,
    hasMoreOlder: historyLimitReached ? false : page.hasMoreOlder,
    pageCount: nextPageCount,
    historyLimitReached,
  }
}

function mergeRetainedEvents(historyEvents: FlowEvent[], liveEvents: FlowEvent[]): FlowEvent[] {
  const merged = new Map<string, FlowEvent>()

  for (const event of historyEvents) {
    merged.set(getEventMergeKey(event), event)
  }

  for (const event of liveEvents) {
    merged.set(getEventMergeKey(event), event)
  }

  return [...merged.values()].sort(compareFlowEventsForDisplay)
}

export function useFlowActivity({
  flowId,
  wsUrl,
  liveEvents,
  wasLiveBufferTruncated,
}: UseFlowActivityInput): FlowActivityState {
  const [retainedHistory, setRetainedHistory] = useState<RetainedHistoryState>(EMPTY_HISTORY_STATE)
  const [isBackfilling, setIsBackfilling] = useState(false)

  const backfillAbortRef = useRef<AbortController | null>(null)
  const retainedHistoryRef = useRef(retainedHistory)
  const isBackfillingRef = useRef(isBackfilling)

  useEffect(() => {
    retainedHistoryRef.current = retainedHistory
  }, [retainedHistory])

  useEffect(() => {
    isBackfillingRef.current = isBackfilling
  }, [isBackfilling])

  const resetRetainedHistory = useCallback(() => {
    backfillAbortRef.current?.abort()
    backfillAbortRef.current = null
    setIsBackfilling(false)
    setRetainedHistory(EMPTY_HISTORY_STATE)
  }, [])

  useEffect(() => {
    resetRetainedHistory()
  }, [flowId, resetRetainedHistory, wsUrl])

  const requestHistoryPage = useCallback(async (options?: { replace?: boolean }) => {
    const replace = options?.replace ?? false
    const currentHistory = retainedHistoryRef.current
    if (!replace && (isBackfillingRef.current || currentHistory.historyLimitReached)) {
      return
    }
    if (
      !replace &&
      currentHistory.pageCount > 0 &&
      !currentHistory.hasMoreOlder &&
      !currentHistory.nextCursor
    ) {
      return
    }

    const controller = new AbortController()
    backfillAbortRef.current?.abort()
    backfillAbortRef.current = controller
    setIsBackfilling(true)
    if (replace) {
      setRetainedHistory(EMPTY_HISTORY_STATE)
    }

    try {
      const page = await fetchHistoryPage({
        wsUrl,
        flowId,
        cursor: replace ? undefined : currentHistory.nextCursor,
        window: DEFAULT_BROWSER_HISTORY_WINDOW,
        limit: DEFAULT_BROWSER_HISTORY_LIMIT,
        signal: controller.signal,
      })

      setRetainedHistory((previous) =>
        applyHistoryPage(replace ? EMPTY_HISTORY_STATE : previous, page, { replace }),
      )
    } catch (error) {
      if (error instanceof HistoryCursorInvalidationError) {
        setRetainedHistory(EMPTY_HISTORY_STATE)
      } else if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setRetainedHistory((previous) => ({
          ...previous,
          warnings: mergeWarnings(previous.warnings, [
            error instanceof Error ? error.message : 'history backfill failed',
          ]),
        }))
      }
    } finally {
      if (backfillAbortRef.current === controller) {
        backfillAbortRef.current = null
      }
      setIsBackfilling(false)
    }
  }, [flowId, wsUrl])

  const loadOlder = useCallback(async () => {
    await requestHistoryPage()
  }, [requestHistoryPage])

  useEffect(() => {
    void requestHistoryPage({ replace: true })
  }, [requestHistoryPage])

  useEffect(
    () => () => {
      backfillAbortRef.current?.abort()
    },
    [],
  )

  const events = useMemo(
    () => mergeRetainedEvents(retainedHistory.events, liveEvents),
    [liveEvents, retainedHistory.events],
  )

  return {
    events,
    liveEvents,
    retainedHistoryEvents: retainedHistory.events,
    warnings: retainedHistory.warnings,
    isBackfilling,
    hasMoreOlder: retainedHistory.hasMoreOlder,
    wasLiveBufferTruncated: wasLiveBufferTruncated && retainedHistory.pageCount === 0,
    historyLimitReached: retainedHistory.historyLimitReached,
    anchorTo: retainedHistory.anchorTo,
    loadedWindow: retainedHistory.loadedWindow,
    loadOlder,
    resetRetainedHistory,
  }
}
