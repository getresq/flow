import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { FlowViewMode } from '../types';

export type SourceMode = 'live' | 'history';

interface UrlStateUpdate {
  node?: string | null;
  run?: string | null;
  log?: string | null;
  runTab?: string | null;
  panel?: null;
  mode?: SourceMode | null;
  view?: FlowViewMode | null;
}

interface UrlStateOptions {
  replace?: boolean;
}

function resolveSourceMode(value: string | null): SourceMode {
  return value === 'history' ? 'history' : 'live';
}

function resolveViewMode(value: string | null): FlowViewMode | undefined {
  if (value === 'canvas' || value === 'metrics' || value === 'logs') {
    return value;
  }

  return undefined;
}

function setOrDeleteParam(params: URLSearchParams, key: string, value: string | null | undefined) {
  if (typeof value === 'string' && value.length > 0) {
    params.set(key, value);
    return;
  }

  params.delete(key);
}

export function useUrlState() {
  const [searchParams, setSearchParams] = useSearchParams();

  const hasModeParam = searchParams.has('mode');
  const hasViewParam = searchParams.has('view');
  const selectedNodeId = searchParams.get('node') ?? undefined;
  const selectedTraceId = searchParams.get('run') ?? undefined;
  const selectedLogSeq = searchParams.get('log') ?? undefined;
  const runTab = searchParams.get('runTab') ?? undefined;
  const sourceMode = resolveSourceMode(searchParams.get('mode'));
  const viewMode = resolveViewMode(searchParams.get('view'));

  const updateUrlState = useCallback(
    (updates: UrlStateUpdate, options?: UrlStateOptions) => {
      setSearchParams(
        (previous) => {
          const previousSearch = previous.toString();
          const next = new URLSearchParams(previous);

          if ('node' in updates) {
            setOrDeleteParam(next, 'node', updates.node);
          }
          if ('run' in updates) {
            setOrDeleteParam(next, 'run', updates.run);
          }
          if ('log' in updates) {
            setOrDeleteParam(next, 'log', updates.log);
          }
          if ('runTab' in updates) {
            setOrDeleteParam(next, 'runTab', updates.runTab);
          }
          if ('panel' in updates) {
            setOrDeleteParam(next, 'panel', updates.panel);
          }
          if ('mode' in updates) {
            setOrDeleteParam(next, 'mode', updates.mode);
          }
          if ('view' in updates) {
            setOrDeleteParam(next, 'view', updates.view);
          }

          return next.toString() === previousSearch ? previous : next;
        },
        { replace: options?.replace ?? false },
      );
    },
    [setSearchParams],
  );

  const setSelectedNodeId = useCallback(
    (nodeId?: string, options?: UrlStateOptions) => {
      updateUrlState({ node: nodeId ?? null }, options);
    },
    [updateUrlState],
  );

  const setSelectedTraceId = useCallback(
    (traceId?: string, options?: UrlStateOptions) => {
      updateUrlState({ run: traceId ?? null }, options);
    },
    [updateUrlState],
  );

  const setSelectedLogSeq = useCallback(
    (logSeq?: string, options?: UrlStateOptions) => {
      updateUrlState({ log: logSeq ?? null }, options);
    },
    [updateUrlState],
  );

  const setSourceMode = useCallback(
    (mode: SourceMode, options?: UrlStateOptions) => {
      updateUrlState({ mode }, options);
    },
    [updateUrlState],
  );

  const setViewMode = useCallback(
    (view: FlowViewMode, options?: UrlStateOptions) => {
      updateUrlState({ view }, options);
    },
    [updateUrlState],
  );

  return {
    hasModeParam,
    hasViewParam,
    selectedNodeId,
    selectedTraceId,
    selectedLogSeq,
    runTab,
    sourceMode,
    viewMode,
    updateUrlState,
    setSelectedNodeId,
    setSelectedTraceId,
    setSelectedLogSeq,
    setSourceMode,
    setViewMode,
  };
}
