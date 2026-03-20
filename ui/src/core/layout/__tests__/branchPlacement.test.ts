import { describe, expect, it } from 'vitest'

import type { BranchPlacementConfig, FlowNodeConfig } from '../../types'
import { applyBranchTemplatePositions } from '../branchPlacement'

function rectangleNode(
  id: string,
  x: number,
  y: number,
  branch?: BranchPlacementConfig,
): FlowNodeConfig {
  return {
    id,
    type: 'rectangle',
    label: id,
    position: { x, y },
    size: { width: 200, height: 64 },
    layout: branch ? { branch } : undefined,
  }
}

describe('applyBranchTemplatePositions', () => {
  it('places primary branches below anchors and right branches to the side', () => {
    const nodes: FlowNodeConfig[] = [
      {
        id: 'decision',
        type: 'diamond',
        label: 'Decision',
        position: { x: 100, y: 200 },
        size: { width: 144, height: 144 },
      },
      rectangleNode('primary', 0, 0, {
        anchorId: 'decision',
        track: 'primary',
        rank: 0,
      }),
      rectangleNode('fallback-a', 0, 0, {
        anchorId: 'decision',
        track: 'right',
        rank: 0,
      }),
      rectangleNode('fallback-b', 0, 0, {
        anchorId: 'decision',
        track: 'right',
        rank: 1,
      }),
      rectangleNode('primary-child', 0, 0, {
        anchorId: 'primary',
        track: 'primary',
        rank: 0,
      }),
    ]

    const positions = applyBranchTemplatePositions(
      nodes,
      new Map(nodes.map((node) => [node.id, node.position])),
      new Map(),
    )

    expect(positions.get('primary')).toEqual({ x: 72, y: 476 })
    expect(positions.get('fallback-a')).toEqual({ x: 564, y: 208 })
    expect(positions.get('fallback-b')).toEqual({ x: 564, y: 332 })
    expect(positions.get('primary-child')).toEqual({ x: 72, y: 672 })
  })

  it('preserves explicit runtime positions for dragged nodes', () => {
    const nodes: FlowNodeConfig[] = [
      {
        id: 'decision',
        type: 'diamond',
        label: 'Decision',
        position: { x: 100, y: 200 },
        size: { width: 144, height: 144 },
      },
      rectangleNode('primary', 0, 0, {
        anchorId: 'decision',
        track: 'primary',
        rank: 0,
      }),
    ]

    const positions = applyBranchTemplatePositions(
      nodes,
      new Map(nodes.map((node) => [node.id, node.position])),
      new Map([['primary', { x: 999, y: 888 }]]),
    )

    expect(positions.get('primary')).toEqual({ x: 0, y: 0 })
  })

  it('supports separate right-side columns and resolves branch collisions downward', () => {
    const nodes: FlowNodeConfig[] = [
      {
        id: 'decision-a',
        type: 'diamond',
        label: 'Decision A',
        position: { x: 100, y: 200 },
        size: { width: 144, height: 144 },
      },
      {
        id: 'decision-b',
        type: 'diamond',
        label: 'Decision B',
        position: { x: 200, y: 220 },
        size: { width: 144, height: 144 },
      },
      rectangleNode('right-a', 0, 0, {
        anchorId: 'decision-a',
        track: 'right',
        rank: 0,
        column: 0,
      }),
      rectangleNode('right-b', 0, 0, {
        anchorId: 'decision-b',
        track: 'right',
        rank: 0,
        column: 0,
      }),
      rectangleNode('right-c', 0, 0, {
        anchorId: 'decision-b',
        track: 'right',
        rank: 0,
        column: 1,
      }),
    ]

    const positions = applyBranchTemplatePositions(
      nodes,
      new Map(nodes.map((node) => [node.id, node.position])),
      new Map(),
    )

    expect(positions.get('right-a')).toEqual({ x: 564, y: 208 })
    expect(positions.get('right-b')).toEqual({ x: 664, y: 300 })
    expect(positions.get('right-c')).toEqual({ x: 904, y: 228 })
  })

  it('supports left-side auxiliary branches for queue side-effects', () => {
    const nodes: FlowNodeConfig[] = [
      {
        id: 'decision',
        type: 'diamond',
        label: 'Decision',
        position: { x: 500, y: 200 },
        size: { width: 144, height: 144 },
      },
      rectangleNode('left-aux', 0, 0, {
        anchorId: 'decision',
        track: 'left',
        rank: 0,
      }),
    ]

    const positions = applyBranchTemplatePositions(
      nodes,
      new Map(nodes.map((node) => [node.id, node.position])),
      new Map(),
    )

    expect(positions.get('left-aux')).toEqual({ x: 80, y: 208 })
  })
})
