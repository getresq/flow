import type { BottomPanelSnap } from '../../stores/layout'
import { SNAP_PARTIAL } from '../../stores/layout'

const APP_HEADER_HEIGHT = 48
const WHISPER_HEIGHT = 38

const DEFAULT_PARTIAL_PANEL_SPEC = {
  visibleRows: 5,
  toolbarHeight: 49,
  tableHeaderHeight: 33,
  tableRowHeight: 37,
} as const

function getPartialPanelMinHeight() {
  return (
    DEFAULT_PARTIAL_PANEL_SPEC.toolbarHeight +
    DEFAULT_PARTIAL_PANEL_SPEC.tableHeaderHeight +
    DEFAULT_PARTIAL_PANEL_SPEC.tableRowHeight * DEFAULT_PARTIAL_PANEL_SPEC.visibleRows
  )
}

function getPartialPanelHeight(viewportHeight: number) {
  return Math.max(Math.round(viewportHeight * SNAP_PARTIAL), getPartialPanelMinHeight())
}

export function getBottomPanelSnapHeight(snap: BottomPanelSnap, viewportHeight: number): number {
  if (snap === 'whisper') return WHISPER_HEIGHT
  if (snap === 'full') return viewportHeight - APP_HEADER_HEIGHT
  return getPartialPanelHeight(viewportHeight)
}

export function getBottomPanelSnapFromHeight(
  height: number,
  viewportHeight: number,
): BottomPanelSnap {
  const partialHeight = getPartialPanelHeight(viewportHeight)
  const fullHeight = viewportHeight - APP_HEADER_HEIGHT
  const midToFull = partialHeight + (fullHeight - partialHeight) * 0.4
  const midToWhisper = WHISPER_HEIGHT + (partialHeight - WHISPER_HEIGHT) * 0.4

  if (height >= midToFull) return 'full'
  if (height <= midToWhisper) return 'whisper'
  return 'partial'
}

export const bottomPanelSizing = {
  appHeaderHeight: APP_HEADER_HEIGHT,
  partialMinHeight: getPartialPanelMinHeight(),
  whisperHeight: WHISPER_HEIGHT,
}
