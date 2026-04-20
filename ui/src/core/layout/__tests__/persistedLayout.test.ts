import { beforeEach, describe, expect, it } from 'vitest';

import type { FlowConfig } from '../../types';
import { clearPersistedLayout, loadPersistedLayout, savePersistedLayout } from '../persistedLayout';

function makeFlow(overrides?: Partial<FlowConfig>): FlowConfig {
  return {
    id: 'mail-pipeline',
    name: 'Mail Pipeline',
    contract: {
      version: 1,
      id: 'mail-pipeline',
      name: 'Mail Pipeline',
      telemetry: {
        log_events: [],
        queue_prefixes: [],
        function_prefixes: [],
        worker_prefixes: [],
        step_prefixes: [],
      },
      keep_context: {
        parent_spans: true,
        root_spans: true,
        error_events: true,
        unmapped_events_for_kept_traces: true,
      },
    },
    hasGraph: true,
    nodes: [
      { id: 'a', type: 'rectangle', label: 'A', position: { x: 0, y: 0 } },
      { id: 'b', type: 'rectangle', label: 'B', position: { x: 100, y: 100 } },
    ],
    edges: [],
    spanMapping: {},
    ...overrides,
  };
}

describe('persistedLayout', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips saved positions for the current flow', () => {
    const flow = makeFlow();
    const positions = new Map([
      ['a', { x: 42, y: 84 }],
      ['b', { x: 128, y: 256 }],
    ]);

    savePersistedLayout(flow, {
      positions,
      viewport: { x: 12, y: 34, zoom: 0.8 },
    });

    expect(loadPersistedLayout(flow)).toEqual({
      positions,
      viewport: { x: 12, y: 34, zoom: 0.8 },
    });
  });

  it('ignores stale node ids when restoring saved positions', () => {
    const flow = makeFlow();
    const positions = new Map([
      ['a', { x: 10, y: 20 }],
      ['ghost', { x: 99, y: 99 }],
    ]);

    savePersistedLayout(flow, {
      positions,
      viewport: null,
    });

    expect(loadPersistedLayout(flow)).toEqual({
      positions: new Map([['a', { x: 10, y: 20 }]]),
      viewport: null,
    });
  });

  it('clears saved positions for a flow', () => {
    const flow = makeFlow();

    savePersistedLayout(flow, {
      positions: new Map([['a', { x: 1, y: 2 }]]),
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    clearPersistedLayout(flow);

    expect(loadPersistedLayout(flow)).toEqual({ positions: new Map(), viewport: null });
    expect(window.localStorage.length).toBe(0);
  });

  it('invalidates saved layouts when the flow graph signature changes', () => {
    const originalFlow = makeFlow();
    savePersistedLayout(originalFlow, {
      positions: new Map([['a', { x: 1, y: 2 }]]),
      viewport: { x: 4, y: 5, zoom: 0.9 },
    });

    const changedFlow = makeFlow({
      nodes: [
        { id: 'a', type: 'rectangle', label: 'A', position: { x: 0, y: 0 } },
        { id: 'c', type: 'rectangle', label: 'C', position: { x: 200, y: 200 } },
      ],
    });

    expect(loadPersistedLayout(changedFlow)).toEqual({ positions: new Map(), viewport: null });
    expect(window.localStorage.length).toBe(0);
  });

  it('drops invalid viewport values when restoring saved state', () => {
    const flow = makeFlow();
    savePersistedLayout(flow, {
      positions: new Map([['a', { x: 1, y: 2 }]]),
      viewport: { x: 1, y: 2, zoom: 0.9 },
    });

    const [storageKey] = Object.keys(window.localStorage);
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        positions: {
          a: { x: 1, y: 2 },
        },
        viewport: { x: 1, y: 2, zoom: 'bad' },
      }),
    );

    expect(loadPersistedLayout(flow)).toEqual({
      positions: new Map([['a', { x: 1, y: 2 }]]),
      viewport: null,
    });
  });
});
