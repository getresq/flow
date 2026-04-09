import { create } from 'zustand'

import type { FlowViewMode } from '../core/types'

export interface CommandRunOption {
  traceId: string
  label: string
}

interface CommandPaletteContextState {
  runOptions: CommandRunOption[]
  onSelectViewMode?: (view: FlowViewMode) => void
  onClearLogs?: () => void
  onEscape?: () => void
  registerContext: (
    value: Partial<
      Omit<CommandPaletteContextState, 'registerContext' | 'clearContext'>
    >,
  ) => void
  clearContext: () => void
}

const initialState: Omit<CommandPaletteContextState, 'registerContext' | 'clearContext'> = {
  runOptions: [],
  onSelectViewMode: undefined,
  onClearLogs: undefined,
  onEscape: undefined,
}

export const useCommandPaletteStore = create<CommandPaletteContextState>((set) => ({
  ...initialState,
  registerContext: (value) => set((state) => ({ ...state, ...value })),
  clearContext: () => set(() => ({ ...initialState })),
}))
