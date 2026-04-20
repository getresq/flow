import { describe, expect, it } from 'vitest';

import { computeElkLayout } from '../elkLayout';
import type { FlowEdgeConfig, FlowNodeConfig } from '../../types';
import { mailPipelineFlow } from '../../../flows/mail-pipeline';

describe('computeElkLayout', () => {
  it('includes group containers and their children in the computed layout', async () => {
    const nodes: FlowNodeConfig[] = [
      {
        id: 'queue',
        type: 'roundedRect',
        label: 'queue',
        style: { color: 'amber' },
        position: { x: 0, y: 0 },
      },
      {
        id: 'group',
        type: 'group',
        label: '',
        position: { x: 400, y: 0 },
        size: { width: 360, height: 220 },
      },
      {
        id: 'child-a',
        type: 'rectangle',
        label: 'child-a',
        style: { color: 'muted' },
        position: { x: 24, y: 24 },
        parentId: 'group',
      },
      {
        id: 'child-b',
        type: 'rectangle',
        label: 'child-b',
        style: { color: 'muted' },
        position: { x: 24, y: 120 },
        parentId: 'group',
      },
      {
        id: 'note',
        type: 'annotation',
        label: 'note',
        position: { x: 820, y: 40 },
      },
    ];

    const edges: FlowEdgeConfig[] = [
      { id: 'e-queue-group', source: 'queue', target: 'group' },
      { id: 'e-child-a-child-b', source: 'child-a', target: 'child-b' },
    ];

    const layout = await computeElkLayout(nodes, edges);

    expect(layout.get('queue')).toBeDefined();
    expect(layout.get('group')).toBeDefined();
    expect(layout.get('child-a')).toBeDefined();
    expect(layout.get('child-b')).toBeDefined();
    expect(layout.get('note')).toBeUndefined();

    const group = layout.get('group');
    const childA = layout.get('child-a');
    const childB = layout.get('child-b');

    expect(group?.width).toBeGreaterThan(0);
    expect(group?.height).toBeGreaterThan(0);
    expect(childA?.x).toBeGreaterThanOrEqual(0);
    expect(childA?.y).toBeGreaterThanOrEqual(0);
    expect(childB?.y).toBeGreaterThan(childA?.y ?? 0);
  });

  it('computes layout for the full mail pipeline graph', async () => {
    const layout = await computeElkLayout(mailPipelineFlow.nodes, mailPipelineFlow.edges);
    expect(layout).toBeInstanceOf(Map);
  });
});
