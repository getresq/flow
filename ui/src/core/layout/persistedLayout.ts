import type { Viewport } from '@xyflow/react';

import type { FlowConfig } from '../types';

const LAYOUT_STORAGE_PREFIX = 'resq-flow-layout';
const LAYOUT_STORAGE_VERSION = 'v1';

type Position = { x: number; y: number };

export interface PersistedCanvasState {
  positions: Map<string, Position>;
  viewport: Viewport | null;
}

interface PersistedCanvasPayload {
  positions?: Record<string, Position>;
  viewport?: Viewport | null;
}

function storagePrefixForFlow(flowId: string): string {
  return `${LAYOUT_STORAGE_PREFIX}:${LAYOUT_STORAGE_VERSION}:${flowId}:`;
}

function computeFlowLayoutSignature(flow: FlowConfig): string {
  const seed = [...flow.nodes]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((node) => `${node.id}|${node.parentId ?? ''}|${node.type}`)
    .join(';');

  let hash = 5381;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) + hash) ^ seed.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
}

function storageKey(flow: FlowConfig): string {
  return `${storagePrefixForFlow(flow.id)}${computeFlowLayoutSignature(flow)}`;
}

function clearObsoleteLayouts(flow: FlowConfig, currentKey: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const prefix = storagePrefixForFlow(flow.id);
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(prefix) || key === currentKey) {
      continue;
    }
    window.localStorage.removeItem(key);
  }
}

function sanitizeViewport(viewport: Viewport | null | undefined): Viewport | null {
  if (!viewport) {
    return null;
  }

  if (
    !Number.isFinite(viewport.x) ||
    !Number.isFinite(viewport.y) ||
    !Number.isFinite(viewport.zoom)
  ) {
    return null;
  }

  return {
    x: viewport.x,
    y: viewport.y,
    zoom: viewport.zoom,
  };
}

export function loadPersistedLayout(flow: FlowConfig): PersistedCanvasState {
  if (typeof window === 'undefined') {
    return { positions: new Map(), viewport: null };
  }

  const key = storageKey(flow);
  clearObsoleteLayouts(flow, key);

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return { positions: new Map(), viewport: null };
  }

  try {
    const parsed = JSON.parse(raw) as PersistedCanvasPayload;
    const validNodeIds = new Set(flow.nodes.map((node) => node.id));
    const positions = new Map<string, Position>();

    for (const [nodeId, position] of Object.entries(parsed.positions ?? {})) {
      if (!validNodeIds.has(nodeId)) {
        continue;
      }

      if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) {
        continue;
      }

      positions.set(nodeId, { x: position.x, y: position.y });
    }

    return {
      positions,
      viewport: sanitizeViewport(parsed.viewport),
    };
  } catch {
    window.localStorage.removeItem(key);
    return { positions: new Map(), viewport: null };
  }
}

export function savePersistedLayout(flow: FlowConfig, state: PersistedCanvasState) {
  if (typeof window === 'undefined') {
    return;
  }

  const key = storageKey(flow);
  clearObsoleteLayouts(flow, key);

  const validNodeIds = new Set(flow.nodes.map((node) => node.id));
  const payload: Record<string, Position> = {};

  for (const [nodeId, position] of state.positions.entries()) {
    if (!validNodeIds.has(nodeId)) {
      continue;
    }

    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      continue;
    }

    payload[nodeId] = { x: position.x, y: position.y };
  }

  const viewport = sanitizeViewport(state.viewport);

  if (Object.keys(payload).length === 0 && !viewport) {
    window.localStorage.removeItem(key);
    return;
  }

  const serialized: PersistedCanvasPayload = {
    positions: payload,
    viewport,
  };

  window.localStorage.setItem(key, JSON.stringify(serialized));
}

export function clearPersistedLayout(flow: FlowConfig) {
  if (typeof window === 'undefined') {
    return;
  }

  const prefix = storagePrefixForFlow(flow.id);
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(prefix)) {
      continue;
    }
    window.localStorage.removeItem(key);
  }
}
