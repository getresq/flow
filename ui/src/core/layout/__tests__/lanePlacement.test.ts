import { describe, expect, it } from 'vitest'

import type { FlowNodeConfig } from '../../types'
import { applyLaneTemplatePositions } from '../lanePlacement'

describe('applyLaneTemplatePositions', () => {
  it('moves sidecar and resource lanes to the right of the main backbone', () => {
    const nodes: FlowNodeConfig[] = [
      {
        id: 'main-a',
        type: 'rectangle',
        label: 'Main A',
        position: { x: 100, y: 100 },
        size: { width: 220, height: 64 },
        layout: { lane: 'main' },
      },
      {
        id: 'branch-a',
        type: 'rectangle',
        label: 'Branch A',
        position: { x: 420, y: 120 },
        size: { width: 240, height: 64 },
        layout: { lane: 'branch' },
      },
      {
        id: 'sidecar-a',
        type: 'roundedRect',
        label: 'Sidecar A',
        position: { x: 300, y: 140 },
        size: { width: 250, height: 64 },
        layout: { lane: 'sidecar' },
      },
      {
        id: 'sidecar-b',
        type: 'rectangle',
        label: 'Sidecar B',
        position: { x: 340, y: 240 },
        size: { width: 210, height: 64 },
        layout: { lane: 'sidecar' },
      },
      {
        id: 'resource-a',
        type: 'cylinder',
        label: 'Resource A',
        position: { x: 500, y: 220 },
        size: { width: 112, height: 128 },
        layout: { lane: 'resource' },
      },
    ]

    const positions = applyLaneTemplatePositions(
      nodes,
      new Map(nodes.map((node) => [node.id, node.position])),
      new Map(),
    )

    expect(positions.get('sidecar-a')).toEqual({ x: 840, y: 140 })
    expect(positions.get('sidecar-b')).toEqual({ x: 840, y: 240 })
    expect(positions.get('resource-a')).toEqual({ x: 1270, y: 220 })
  })

  it('preserves explicit runtime positions for dragged sidecar nodes', () => {
    const nodes: FlowNodeConfig[] = [
      {
        id: 'main-a',
        type: 'rectangle',
        label: 'Main A',
        position: { x: 100, y: 100 },
        size: { width: 220, height: 64 },
        layout: { lane: 'main' },
      },
      {
        id: 'sidecar-a',
        type: 'roundedRect',
        label: 'Sidecar A',
        position: { x: 300, y: 140 },
        size: { width: 250, height: 64 },
        layout: { lane: 'sidecar' },
      },
    ]

    const positions = applyLaneTemplatePositions(
      nodes,
      new Map(nodes.map((node) => [node.id, node.position])),
      new Map([['sidecar-a', { x: 999, y: 222 }]]),
    )

    expect(positions.get('sidecar-a')).toEqual({ x: 300, y: 140 })
  })
})
