import type { ReactNode } from 'react'

import { NodeStatusBadge } from './NodeStatusBadge'
import type { FlowNodeConfig, NodeSemanticRole } from '../types'
import type { NodeDetailStatus } from './NodeDetailPanel'

const semanticRoleLabels: Record<NodeSemanticRole, string | null> = {
  trigger: 'Trigger',
  queue: 'Queue',
  worker: 'Worker',
  scheduler: 'Scheduler',
  process: 'Process',
  decision: 'Decision',
  resource: 'Resource',
  detail: 'Detail',
  group: null,
  note: null,
}

function resolveNodeRole(node: FlowNodeConfig): string | null {
  if (node.semanticRole) {
    return semanticRoleLabels[node.semanticRole]
  }

  if (node.style?.icon === 'worker') {
    return 'Worker'
  }
  if (node.style?.icon === 'queue') {
    return 'Queue'
  }
  if (node.style?.icon === 'cron') {
    return 'Scheduler'
  }
  if (node.type === 'diamond') {
    return 'Decision'
  }
  if (node.type === 'cylinder') {
    return 'Resource'
  }
  const sublabel = node.sublabel?.trim()
  if (!sublabel) {
    return null
  }

  if (sublabel.toLowerCase() === 'workers') {
    return 'Worker'
  }

  return sublabel.replace(/^\(/, '').replace(/\)$/, '')
}

export function getNodeInspectorPresentation(node: FlowNodeConfig, status?: NodeDetailStatus): {
  title: string
  description: string
  headerContent: ReactNode
} {
  const roleLabel = resolveNodeRole(node)

  return {
    title: node.label,
    description: roleLabel ?? 'Node details and recent activity.',
    headerContent: (
      <>
        <div className="flex items-center gap-2">
          <NodeStatusBadge status={status?.status ?? 'idle'} />
        </div>
        {node.description ? <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{node.description}</p> : null}
        {node.notes && node.notes.length > 0 ? (
          <div className="mt-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]/70 p-3">
            <h3 className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Notes</h3>
            <ul className="mt-2 space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
              {node.notes.map((note, index) => (
                <li key={`${note}-${index}`} className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--text-muted)]" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </>
    ),
  }
}
