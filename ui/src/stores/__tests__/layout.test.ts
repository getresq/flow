import { beforeEach, describe, expect, it } from 'vitest';

import { THEME_STORAGE_KEY, useLayoutStore } from '../layout';

describe('useLayoutStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useLayoutStore.setState({
      sidebarOpen: true,
      commandPaletteOpen: false,
      bottomPanelSnap: 'partial',
      bottomPanelTab: 'logs',
      theme: 'dark',
    });
  });

  it('starts with the expected defaults', () => {
    const state = useLayoutStore.getState();

    expect(state.sidebarOpen).toBe(true);
    expect(state.theme).toBe('dark');
    expect(state.bottomPanelSnap).toBe('partial');
    expect(state.bottomPanelTab).toBe('logs');
  });

  it('updates theme state and localStorage', () => {
    useLayoutStore.getState().setTheme('light');

    expect(useLayoutStore.getState().theme).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('stores the bottom panel snap state', () => {
    useLayoutStore.getState().setBottomPanelSnap('full');

    expect(useLayoutStore.getState().bottomPanelSnap).toBe('full');
  });

  it('stores the bottom panel tab', () => {
    useLayoutStore.getState().setBottomPanelTab('traces');

    expect(useLayoutStore.getState().bottomPanelTab).toBe('traces');
  });
});
