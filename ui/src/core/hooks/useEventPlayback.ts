import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { EventPlaybackState, FlowEvent } from '../types'

const DEFAULT_SPEED = 1
const MIN_SPEED = 0.25
const MAX_SPEED = 16
const MIN_DELAY_MS = 20
const MAX_DELAY_MS = 1_200
const FALLBACK_DELAY_MS = 60

function parseTimestampMs(timestamp: string | undefined): number | null {
  if (!timestamp) {
    return null
  }

  const parsed = Date.parse(timestamp)
  if (Number.isNaN(parsed)) {
    return null
  }

  return parsed
}

function getNextDelayMs(previous: FlowEvent | undefined, next: FlowEvent | undefined, speed: number): number {
  if (!next) {
    return 0
  }

  if (!previous) {
    return 0
  }

  const previousMs = parseTimestampMs(previous.timestamp)
  const nextMs = parseTimestampMs(next.timestamp)

  if (typeof previousMs !== 'number' || typeof nextMs !== 'number') {
    return FALLBACK_DELAY_MS
  }

  const delta = nextMs - previousMs
  if (delta <= 0) {
    return MIN_DELAY_MS
  }

  const scaled = delta / speed
  return Math.min(Math.max(scaled, MIN_DELAY_MS), MAX_DELAY_MS)
}

interface UseEventPlaybackOptions {
  resetKey?: number | string
}

export function useEventPlayback(sourceEvents: FlowEvent[], options?: UseEventPlaybackOptions): EventPlaybackState {
  const [visibleCount, setVisibleCount] = useState(0)
  const [speed, setSpeedState] = useState(DEFAULT_SPEED)
  const [paused, setPaused] = useState(false)

  const timerRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const setSpeed = useCallback((nextSpeed: number) => {
    if (!Number.isFinite(nextSpeed) || nextSpeed <= 0) {
      return
    }
    const clamped = Math.min(Math.max(nextSpeed, MIN_SPEED), MAX_SPEED)
    setSpeedState(clamped)
  }, [])

  const pause = useCallback(() => {
    setPaused(true)
  }, [])

  const resume = useCallback(() => {
    setPaused(false)
  }, [])

  const togglePaused = useCallback(() => {
    setPaused((previous) => !previous)
  }, [])

  const stepForward = useCallback(() => {
    clearTimer()
    setVisibleCount((previous) => Math.min(previous + 1, sourceEvents.length))
  }, [clearTimer, sourceEvents.length])

  const clearPlayback = useCallback(() => {
    clearTimer()
    setVisibleCount(0)
    setPaused(false)
  }, [clearTimer])

  useEffect(() => {
    clearPlayback()
  }, [clearPlayback, options?.resetKey])

  useEffect(() => {
    if (sourceEvents.length < visibleCount) {
      setVisibleCount(sourceEvents.length)
    }
  }, [sourceEvents.length, visibleCount])

  useEffect(() => {
    clearTimer()

    if (paused || visibleCount >= sourceEvents.length) {
      return
    }

    const previousEvent = visibleCount > 0 ? sourceEvents[visibleCount - 1] : undefined
    const nextEvent = sourceEvents[visibleCount]
    const delayMs = getNextDelayMs(previousEvent, nextEvent, speed)

    timerRef.current = window.setTimeout(() => {
      setVisibleCount((previous) => Math.min(previous + 1, sourceEvents.length))
      timerRef.current = null
    }, delayMs)

    return clearTimer
  }, [clearTimer, paused, sourceEvents, speed, visibleCount])

  useEffect(
    () => () => {
      clearTimer()
    },
    [clearTimer],
  )

  const events = useMemo(() => sourceEvents.slice(0, visibleCount), [sourceEvents, visibleCount])
  const pendingCount = Math.max(sourceEvents.length - visibleCount, 0)

  return {
    events,
    speed,
    paused,
    pendingCount,
    setSpeed,
    togglePaused,
    pause,
    resume,
    stepForward,
    clearPlayback,
  }
}
