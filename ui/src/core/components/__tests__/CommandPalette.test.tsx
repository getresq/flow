import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CommandPalette } from '../CommandPalette'
import { useCommandPaletteStore } from '../../../stores/commandPalette'
import { useLayoutStore } from '../../../stores/layout'

describe('CommandPalette', () => {
  beforeEach(() => {
    useLayoutStore.setState({
      sidebarOpen: true,
      commandPaletteOpen: true,
      bottomPanelSnap: 'partial',
      bottomPanelTab: 'logs',
      theme: 'dark',
    })
    useCommandPaletteStore.getState().clearContext()
  })

  afterEach(() => {
    useLayoutStore.getState().setCommandPaletteOpen(false)
    useCommandPaletteStore.getState().clearContext()
  })

  it('filters command results by search text', async () => {
    const user = userEvent.setup()
    const clearLogs = vi.fn()

    useCommandPaletteStore.getState().registerContext({
      onClearLogs: clearLogs,
    })

    render(
      <MemoryRouter initialEntries={['/flows/mail-pipeline?mode=live']}>
        <CommandPalette />
      </MemoryRouter>,
    )

    await user.type(screen.getByRole('combobox'), 'clear')

    expect(screen.getByText('Clear logs')).toBeVisible()
  })

  it('supports keyboard navigation to a flow command', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<CommandPalette />} />
          <Route path="/flows/:flowId" element={<div>Flow route</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(screen.getByRole('combobox'), 'mail')
    await user.keyboard('{ArrowDown}{Enter}')

    expect(screen.getByText('Flow route')).toBeInTheDocument()
  })
})
