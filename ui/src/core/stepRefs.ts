import { normalizeTraceIdentifierValue } from './traceIdentifiers';

export function normalizeRawStepId(stepId?: string | null): string | undefined {
  const normalized = normalizeTraceIdentifierValue(stepId);
  if (!normalized) {
    return undefined;
  }

  return normalized;
}

export function stepLeaf(stepId?: string | null): string | undefined {
  return normalizeRawStepId(stepId);
}

export function combinedStepRef(
  componentId?: string | null,
  stepId?: string | null,
): string | undefined {
  const normalizedComponentId = normalizeTraceIdentifierValue(componentId);
  const normalizedStepLeaf = stepLeaf(stepId);

  if (normalizedComponentId && normalizedStepLeaf) {
    return `${normalizedComponentId}.${normalizedStepLeaf}`;
  }

  return normalizedComponentId ?? normalizedStepLeaf;
}
