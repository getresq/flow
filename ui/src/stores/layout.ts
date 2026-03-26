import { create } from 'zustand'

import type { ThemeMode } from '../core/types'

export const THEME_STORAGE_KEY = 'resq-flow-theme'
export const DEFAULT_BOTTOM_PANEL_HEIGHT = 320
export const MIN_BOTTOM_PANEL_HEIGHT = 72
export type BottomPanelTab = 'logs' | 'traces'

export interface LayoutState {
  sidebarOpen: boolean
  focusMode: boolean
  commandPaletteOpen: boolean
  bottomPanelHeight: number
  bottomPanelTab: BottomPanelTab
  theme: ThemeMode
  setSidebarOpen: (open: boolean) => void
  toggleFocusMode: () => void
  setCommandPaletteOpen: (open: boolean) => void
  setBottomPanelHeight: (height: number) => void
  setBottomPanelTab: (tab: BottomPanelTab) => void
  setTheme: (theme: ThemeMode) => void
}

function resolveInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'dark'
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'dark'
}

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarOpen: true,
  focusMode: false,
  commandPaletteOpen: false,
  bottomPanelHeight: DEFAULT_BOTTOM_PANEL_HEIGHT,
  bottomPanelTab: 'logs',
  theme: resolveInitialTheme(),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode })),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setBottomPanelHeight: (height) => set({ bottomPanelHeight: height }),
  setBottomPanelTab: (tab) => set({ bottomPanelTab: tab }),
  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    }

    set({ theme })
  },
}))
