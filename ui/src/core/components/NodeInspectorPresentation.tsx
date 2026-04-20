import type { ReactNode } from 'react';

import type { FlowNodeConfig } from '../types';

const shapeLabels: Record<string, string> = {
  diamond: 'Decision',
  cylinder: 'Resource',
};

function resolveNodeRole(node: FlowNodeConfig): string | null {
  if (node.eyebrow) {
    return node.eyebrow.charAt(0) + node.eyebrow.slice(1).toLowerCase();
  }

  const shapeLabel = shapeLabels[node.type];
  if (shapeLabel) return shapeLabel;

  if (node.style?.icon === 'worker') return 'Worker';
  if (node.style?.icon === 'queue') return 'Queue';
  if (node.style?.icon === 'cron') return 'Scheduler';

  const sublabel = node.sublabel?.trim();
  if (!sublabel) return null;
  if (sublabel.toLowerCase() === 'workers') return 'Worker';
  return sublabel.replace(/^\(/, '').replace(/\)$/, '');
}

export function getNodeInspectorPresentation(node: FlowNodeConfig): {
  title: string;
  description: string;
  headerContent: ReactNode;
} {
  const roleLabel = resolveNodeRole(node);
  const notes = node.notes;

  return {
    title: node.label,
    description: roleLabel ?? 'Node details and recent activity.',
    headerContent: (
      <>
        {node.description ? (
          <p className="text-sm leading-6 text-[var(--text-secondary)]">{node.description}</p>
        ) : null}
        {notes && notes.length > 0 ? (
          <div className="mt-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]/70 p-3">
            <h3 className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Notes</h3>
            {notes.length === 1 ? (
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{notes[0]}</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
                {notes.map((note, index) => (
                  <li key={`${note}-${index}`} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--text-muted)]" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </>
    ),
  };
}
