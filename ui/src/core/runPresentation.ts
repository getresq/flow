import type { FlowEdgeConfig, FlowNodeConfig, TraceJourney, TraceStep, TraceStatus } from './types';
import { summarizeStepOutcome } from './stepOutcomePresentation';
import { combinedStepRef, stepLeaf } from './stepRefs';
import { normalizeTraceIdentifierValue } from './traceIdentifiers';

function compactIdentifier(value: string, maxLength = 10): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}…`;
}

function humanizeMachineLabel(value: string) {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_:.\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return '-';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
}

function preferredRunIdentity(journey: TraceJourney): string | undefined {
  const mailboxOwner = normalizeTraceIdentifierValue(journey.identifiers.mailboxOwner);
  const threadId = normalizeTraceIdentifierValue(journey.identifiers.threadId);
  const replyDraftId = normalizeTraceIdentifierValue(journey.identifiers.replyDraftId);
  const requestId = normalizeTraceIdentifierValue(journey.identifiers.requestId);
  const journeyKey = normalizeTraceIdentifierValue(journey.identifiers.journeyKey);
  const runId = normalizeTraceIdentifierValue(journey.identifiers.runId);
  const jobId = normalizeTraceIdentifierValue(journey.identifiers.jobId);
  const rootEntity = normalizeTraceIdentifierValue(journey.rootEntity);

  if (mailboxOwner && threadId) {
    return `${mailboxOwner} · thread ${compactIdentifier(threadId, 12)}`;
  }
  if (mailboxOwner && replyDraftId) {
    return `${mailboxOwner} · draft ${compactIdentifier(replyDraftId, 12)}`;
  }
  if (mailboxOwner) {
    return mailboxOwner;
  }
  if (threadId) {
    return `Thread ${compactIdentifier(threadId, 12)}`;
  }
  if (replyDraftId) {
    return `Draft ${compactIdentifier(replyDraftId, 12)}`;
  }
  if (requestId) {
    return `Request ${compactIdentifier(requestId, 12)}`;
  }
  if (journeyKey) {
    return `Journey ${compactIdentifier(journeyKey, 12)}`;
  }
  if (runId) {
    return `Run ${compactIdentifier(runId, 12)}`;
  }
  if (jobId) {
    return `Job ${compactIdentifier(jobId, 12)}`;
  }
  if (rootEntity) {
    return rootEntity;
  }

  return undefined;
}

export function formatRunLabel(journey: TraceJourney): string {
  return preferredRunIdentity(journey) ?? `Run ${journey.traceId.slice(0, 8)}…`;
}

export function isRunBackedJourney(journey: TraceJourney): boolean {
  return Boolean(normalizeTraceIdentifierValue(journey.identifiers.runId));
}

export function canonicalStepId(stage: Pick<TraceStep, 'nodeId' | 'stepId'>): string | undefined {
  return combinedStepRef(stage.nodeId, stage.stepId);
}

function readAttrString(
  attributes: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = attributes?.[key];
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

function resolveNodeLabel(
  nodeId: string | undefined,
  nodeMap: Map<string, FlowNodeConfig>,
): string | undefined {
  const normalized = normalizeTraceIdentifierValue(nodeId);
  if (!normalized) {
    return undefined;
  }

  return nodeMap.get(normalized)?.label ?? humanizeMachineLabel(normalized);
}

function resolveStepLeafLabel(
  stage: Pick<TraceStep, 'label' | 'nodeId' | 'stepId'>,
): string | undefined {
  const explicitLabel = normalizeTraceIdentifierValue(stage.label);
  const stepId = normalizeTraceIdentifierValue(stage.stepId);
  const nodeId = normalizeTraceIdentifierValue(stage.nodeId);

  if (explicitLabel && explicitLabel !== stepId && explicitLabel !== nodeId) {
    return humanizeMachineLabel(explicitLabel);
  }

  const leaf = stepLeaf(stage.stepId);
  if (leaf && leaf !== nodeId?.split('.').at(-1)) {
    return humanizeMachineLabel(leaf);
  }

  return undefined;
}

export function formatStepLabel(stage: Pick<TraceStep, 'label' | 'nodeId' | 'stepId'>): string {
  const componentId = normalizeTraceIdentifierValue(stage.nodeId);
  const componentLabel = componentId ? humanizeMachineLabel(componentId) : undefined;
  const detailLabel = resolveStepLeafLabel(stage);

  if (componentLabel && detailLabel && componentLabel !== detailLabel) {
    return `${componentLabel} · ${detailLabel}`;
  }

  return componentLabel ?? detailLabel ?? '-';
}

export function formatStepDisplayLabel(
  stage: Pick<TraceStep, 'label' | 'nodeId' | 'stepId' | 'attrs'>,
): string {
  const summary = summarizeStepOutcome({
    stepId: stage.stepId,
    nodeId: stage.nodeId,
    attributes: stage.attrs,
  });

  if (summary) {
    return summary;
  }

  return formatStepLabel(stage);
}

export interface JourneyOverviewCard {
  key: string;
  nodeId?: string;
  nodeLabel: string;
  summary: string;
  status: TraceStatus;
  durationMs?: number;
  startedAt: string;
  representativeStep: TraceStep;
}

export interface JourneyOverviewModel {
  cards: JourneyOverviewCard[];
  primaryNodePath: string[];
  focusNodeIds: string[];
  focusEdgeIds: string[];
}

interface OverviewGroup {
  key: string;
  nodeId?: string;
  nodeLabel: string;
  firstOrder: number;
  firstReachedAt: string;
  steps: TraceStep[];
}

function stepErrorSummary(stage: Pick<TraceStep, 'attrs' | 'errorSummary'>): string | undefined {
  const attrs = stage.attrs;
  const errorMessage = typeof attrs?.error_message === 'string' ? attrs.error_message : undefined;
  const errorClass = typeof attrs?.error_class === 'string' ? attrs.error_class : undefined;
  const errorCode = typeof attrs?.error_code === 'string' ? attrs.error_code : undefined;

  if (errorMessage) {
    return errorMessage;
  }

  if (errorClass && errorCode) {
    return `${errorClass}:${errorCode}`;
  }

  if (errorClass || errorCode) {
    return [errorClass, errorCode].filter(Boolean).join(':');
  }

  return stage.errorSummary;
}

function compareSteps(left: TraceStep, right: TraceStep) {
  const leftSeq = typeof left.startSeq === 'number' ? left.startSeq : Number.MAX_SAFE_INTEGER;
  const rightSeq = typeof right.startSeq === 'number' ? right.startSeq : Number.MAX_SAFE_INTEGER;
  if (leftSeq !== rightSeq) {
    return leftSeq - rightSeq;
  }

  const byTs = Date.parse(left.startTs) - Date.parse(right.startTs);
  if (byTs !== 0) {
    return byTs;
  }

  return left.stepId.localeCompare(right.stepId);
}

function resolveGroupIdentity(
  step: TraceStep,
  nodeMap: Map<string, FlowNodeConfig>,
): { key: string; nodeId?: string; nodeLabel: string } {
  const resolvedNodeId = normalizeTraceIdentifierValue(step.nodeId);
  if (resolvedNodeId) {
    return {
      key: `node:${resolvedNodeId}`,
      nodeId: resolvedNodeId,
      nodeLabel: resolveNodeLabel(resolvedNodeId, nodeMap) ?? humanizeMachineLabel(resolvedNodeId),
    };
  }

  const componentId = normalizeTraceIdentifierValue(readAttrString(step.attrs, 'component_id'));
  if (componentId) {
    return {
      key: `component:${componentId}`,
      nodeId: nodeMap.has(componentId) ? componentId : undefined,
      nodeLabel: resolveNodeLabel(componentId, nodeMap) ?? humanizeMachineLabel(componentId),
    };
  }

  return {
    key: 'unmapped',
    nodeLabel: 'Other Activity',
  };
}

function formatGroupedStepLabel(step: TraceStep): string {
  const error = step.status === 'error' ? stepErrorSummary(step) : undefined;
  if (error) {
    return error;
  }

  const outcome = summarizeStepOutcome({
    stepId: step.stepId,
    nodeId: step.nodeId,
    attributes: step.attrs,
    message: step.errorSummary,
  });
  if (outcome) {
    return outcome;
  }

  const explicit = resolveStepLeafLabel(step);
  if (explicit) {
    return explicit;
  }

  return humanizeMachineLabel(step.stepId);
}

// Summary picker: first error in the group by seq; otherwise the most recent step.
// Producer owns what's in the run via run_id; the UI presents faithfully.
function pickSummaryStep(steps: TraceStep[]): TraceStep {
  const sorted = [...steps].sort(compareSteps);
  const firstError = sorted.find((step) => step.status === 'error');
  return firstError ?? sorted.at(-1) ?? steps[0]!;
}

function buildOverviewGroups(
  journey: Pick<TraceJourney, 'steps'>,
  nodes?: FlowNodeConfig[],
): OverviewGroup[] {
  const nodeMap = new Map((nodes ?? []).map((node) => [node.id, node]));
  const groups = new Map<string, OverviewGroup>();
  const orderedSteps = [...journey.steps].sort(compareSteps);

  orderedSteps.forEach((step, index) => {
    const identity = resolveGroupIdentity(step, nodeMap);
    const order = typeof step.startSeq === 'number' ? step.startSeq : index;
    const existing = groups.get(identity.key);

    if (existing) {
      existing.steps.push(step);
      if (order < existing.firstOrder) {
        existing.firstOrder = order;
        existing.firstReachedAt = step.startTs;
      }
      return;
    }

    groups.set(identity.key, {
      key: identity.key,
      nodeId: identity.nodeId,
      nodeLabel: identity.nodeLabel,
      firstOrder: order,
      firstReachedAt: step.startTs,
      steps: [step],
    });
  });

  return [...groups.values()].sort((left, right) => {
    if (left.firstOrder !== right.firstOrder) {
      return left.firstOrder - right.firstOrder;
    }
    return Date.parse(left.firstReachedAt) - Date.parse(right.firstReachedAt);
  });
}

function buildFocusEdgeIds(nodeIds: string[], edges: FlowEdgeConfig[] | undefined): string[] {
  if (!edges?.length) {
    return [];
  }

  const focusNodeSet = new Set(nodeIds);
  return edges
    .filter((edge) => focusNodeSet.has(edge.source) && focusNodeSet.has(edge.target))
    .map((edge) => edge.id);
}

export function getJourneyOverviewModel(
  journey: Pick<TraceJourney, 'steps'>,
  nodes?: FlowNodeConfig[],
  edges?: FlowEdgeConfig[],
): JourneyOverviewModel {
  const groups = buildOverviewGroups(journey, nodes);

  const cards = groups.map((group): JourneyOverviewCard => {
    const representative = pickSummaryStep(group.steps);
    return {
      key: group.key,
      nodeId: group.nodeId,
      nodeLabel: group.nodeLabel,
      summary: formatGroupedStepLabel(representative),
      status: representative.status,
      durationMs:
        representative.durationMs ??
        group.steps
          .map((step) => step.durationMs)
          .filter((duration): duration is number => typeof duration === 'number')
          .sort((left, right) => right - left)[0],
      startedAt: group.firstReachedAt,
      representativeStep: representative,
    };
  });

  const focusNodeIds = cards
    .map((card) => card.nodeId)
    .filter((nodeId): nodeId is string => Boolean(nodeId));

  return {
    cards,
    primaryNodePath: focusNodeIds,
    focusNodeIds,
    focusEdgeIds: buildFocusEdgeIds(focusNodeIds, edges),
  };
}

export function getOverviewSteps(steps: TraceStep[]): TraceStep[] {
  return buildOverviewGroups({ steps }).map((group) => pickSummaryStep(group.steps));
}

export function getJourneySummaryStep(
  journey: TraceJourney,
  nodes?: FlowNodeConfig[],
  edges?: FlowEdgeConfig[],
): TraceStep | undefined {
  return (
    getJourneyOverviewModel(journey, nodes, edges).cards.at(-1)?.representativeStep ??
    journey.steps.at(-1)
  );
}
