import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { CommandPalette } from './core/components/CommandPalette';
import { FlowsHome } from './core/components/FlowsHome';
import { FlowView } from './core/components/FlowView';
import { useKeyboardShortcuts } from './core/hooks/useKeyboardShortcuts';
import type { ThemeMode } from './core/types';
import { fetchRuntimeFlows, FlowRegistryProvider } from './flows';
import { resolveDocumentTitle } from './lib/documentTitle';
import { useLayoutStore } from './stores/layout';

function applyTheme(theme: ThemeMode) {
  const apply = () => {
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
  };

  if (!document.startViewTransition) {
    apply();
    return;
  }

  document.startViewTransition(apply);
}

function App() {
  const {
    data: flows = [],
    error,
    isLoading,
  } = useQuery({
    queryKey: ['flow-definitions'],
    queryFn: () => fetchRuntimeFlows(),
  });
  const theme = useLayoutStore((state) => state.theme);
  const defaultFlowId = flows[0]?.id;
  const location = useLocation();

  useKeyboardShortcuts();

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    document.title = resolveDocumentTitle(location.pathname, flows);
  }, [flows, location.pathname]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--surface-primary)] text-[var(--text-secondary)]">
        Loading flows
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--surface-primary)] text-[var(--text-secondary)]">
        Unable to load flow definitions
      </main>
    );
  }

  if (!defaultFlowId) {
    return null;
  }

  return (
    <FlowRegistryProvider flows={flows}>
      <Routes>
        <Route path="/" element={<FlowsHome registeredFlows={flows} />} />
        <Route path="/flows/:flowId" element={<FlowView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <CommandPalette />
    </FlowRegistryProvider>
  );
}

export default App;
