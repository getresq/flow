import { ReactFlowProvider, type NodeProps } from '@xyflow/react'
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { AnnotationNode } from '../AnnotationNode'
import { BadgeNode } from '../BadgeNode'
import { CircleNode } from '../CircleNode'
import { CylinderNode } from '../CylinderNode'
import { DiamondNode } from '../DiamondNode'
import { GroupNode } from '../GroupNode'
import { OctagonNode } from '../OctagonNode'
import { PillNode } from '../PillNode'
import { RectangleNode } from '../RectangleNode'
import { RoundedRectNode } from '../RoundedRectNode'
import type { FlowNode, FlowNodeData } from '../types'

function baseNodeProps(overrides: Partial<FlowNodeData> = {}): NodeProps<FlowNode> {
  return {
    id: 'node-1',
    type: 'rectangle',
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    zIndex: 1,
    selected: false,
    connectable: true,
    selectable: true,
    deletable: true,
    draggable: true,
    isConnectable: true,
    xPos: 0,
    yPos: 0,
    data: {
      label: 'Node Label',
      sublabel: 'Node sublabel',
      bullets: ['one', 'two'],
      status: {
        status: 'active',
        durationMs: 1_200,
        updatedAt: Date.now(),
        durationVisibleUntil: Date.now() + 5_000,
      },
      ...overrides,
    },
  } as unknown as NodeProps<FlowNode>
}

function renderNode(component: ReactElement) {
  render(<ReactFlowProvider>{component}</ReactFlowProvider>)
}

describe('shape nodes', () => {
  it('renders rectangle node content', () => {
    renderNode(<RectangleNode {...baseNodeProps({ style: { color: 'worker' } })} />)

    expect(screen.getByText('Node Label')).toBeInTheDocument()
    expect(screen.getByText('Node sublabel')).toBeInTheDocument()
  })

  it('renders rounded rectangle, diamond, circle, pill, badge, octagon, group, and annotation nodes', () => {
    renderNode(
      <>
        <RoundedRectNode {...baseNodeProps({ label: 'Rounded' })} />
        <DiamondNode {...baseNodeProps({ label: 'Decision' })} />
        <CircleNode {...baseNodeProps({ label: 'Storage' })} />
        <PillNode {...baseNodeProps({ label: 'Trigger' })} />
        <BadgeNode {...baseNodeProps({ label: 'Badge' })} />
        <OctagonNode {...baseNodeProps({ label: 'Stop' })} />
        <GroupNode {...baseNodeProps({ label: 'Group Boundary' })} />
        <AnnotationNode {...baseNodeProps({ label: 'Annotation text block' })} />
      </>,
    )

    expect(screen.getByText('Rounded')).toBeInTheDocument()
    expect(screen.getByText('Decision')).toBeInTheDocument()
    expect(screen.getByText('Storage')).toBeInTheDocument()
    expect(screen.getByText('Trigger')).toBeInTheDocument()
    expect(screen.getByText('Badge')).toBeInTheDocument()
    expect(screen.getByText('Stop')).toBeInTheDocument()
    expect(screen.getByText('Group Boundary')).toBeInTheDocument()
    expect(screen.getByText('Annotation text block')).toBeInTheDocument()
  })

  it('renders nodes for each status without error', () => {
    const withWorker = (status: Parameters<typeof baseNodeProps>[0]) =>
      baseNodeProps({ style: { color: 'worker' }, ...status })

    renderNode(
      <>
        <RectangleNode {...withWorker({ status: { status: 'idle', updatedAt: Date.now() } })} />
        <RectangleNode {...withWorker({ status: { status: 'active', updatedAt: Date.now() } })} />
        <RectangleNode {...withWorker({ status: { status: 'error', updatedAt: Date.now() } })} />
      </>,
    )

    // Glow is applied via CSS classes on the container — just verify the nodes render
    expect(screen.getAllByText('Node Label')).toHaveLength(3)
  })

  it('renders cylinders with concrete resource tags and hides duplicate titles', () => {
    renderNode(
      <>
        <CylinderNode
          {...baseNodeProps({
            label: 'S3',
            style: { color: 'resource', icon: 's3' },
            status: { status: 'idle', updatedAt: Date.now() },
          })}
        />
        <CylinderNode
          {...baseNodeProps({
            id: 'node-2',
            label: 'postgres',
            style: { color: 'resource', icon: 'postgres' },
            status: { status: 'idle', updatedAt: Date.now() },
          })}
        />
      </>,
    )

    expect(screen.getByText('S3')).toBeInTheDocument()
    expect(screen.queryByText(/^postgres$/i)).toBeInTheDocument()
    expect(screen.getByText('PG')).toBeInTheDocument()
  })
})
