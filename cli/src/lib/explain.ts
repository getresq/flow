import { EmptyResultError } from "./errors.js";
import {
  executionKeyForRow,
  groupRowsByExecutionKey,
  normalizeIdentifierValue,
  preferredStepLabel,
  rowAttribute,
  sortLogRows,
} from "./history.js";
import type {
  CliLogRow,
  RunExplainEvidenceRow,
  RunExplainOutcome,
  RunExplainSummary,
  RunExplainTarget,
} from "../types.js";

const TERMINAL_STEP_LEAVES = new Set([
  "final_result",
  "result",
  "complete",
  "completed",
  "done",
  "finished",
]);

const QUEUE_STEP_LEAVES = new Set([
  "enqueue",
  "enqueued",
]);

const PICKUP_STEP_LEAVES = new Set([
  "pickup",
  "picked",
  "start",
  "started",
]);

const RESULT_STEP_LEAVES = new Set([
  "result",
  "final_result",
]);

export function selectTargetRun(
  rows: CliLogRow[],
  target: RunExplainTarget,
): { runId: string; rows: CliLogRow[] } {
  const sortedRows = sortLogRows(rows);

  if (target.kind === "thread") {
    const selected = selectLatestRunGroupByThread(sortedRows, target.threadId);
    if (!selected) {
      throw new EmptyResultError(`no matching run found for thread ${target.threadId}`);
    }

    return selected;
  }

  const matchingRows = sortedRows.filter((row) => {
    const executionKey = executionKeyForRow(row);
    return executionKey === target.runId || normalizeIdentifierValue(row.runId) === target.runId;
  });

  if (matchingRows.length === 0) {
    throw new EmptyResultError(`no matching run found for run ${target.runId}`);
  }

  return {
    runId: target.runId,
    rows: matchingRows,
  };
}

export function buildRunExplainSummary({
  flowId,
  rows,
  target,
}: {
  flowId: string;
  rows: CliLogRow[];
  target: RunExplainTarget;
}): RunExplainSummary {
  const sortedRows = sortLogRows(rows);
  const firstRow = sortedRows.at(0);
  const lastRow = sortedRows.at(-1);

  if (!firstRow || !lastRow) {
    throw new EmptyResultError("no matching results");
  }

  const selectedRunId =
    executionKeyForRow(firstRow) ??
    normalizeIdentifierValue(firstRow.runId) ??
    normalizeIdentifierValue(firstRow.traceId) ??
    "unknown";

  const nodePath = collectNodePath(sortedRows);
  const furthestNode = nodePath.at(-1);
  const firstError = sortedRows.find(isErrorRow);
  const terminalRow = [...sortedRows].reverse().find(isTerminalRow);
  const pickupRow = [...sortedRows].reverse().find(isPickupRow);
  const enqueueRow = [...sortedRows].reverse().find(isQueueRow);
  const resultRow = [...sortedRows].reverse().find(isResultRow);

  const generic = buildGenericExplanation({
    firstError,
    terminalRow,
    pickupRow,
    enqueueRow,
    resultRow,
    lastRow,
    furthestNode,
    nodePath,
  });
  const flowSpecific = buildFlowSpecificExplanation(flowId, sortedRows);
  const evidence = collectEvidenceRows({
    rows: sortedRows,
    firstError,
    terminalRow,
    lastRow,
  });
  const terminalSignal = formatSignal(firstError ?? terminalRow ?? resultRow ?? lastRow);

  return {
    flowId,
    runId: selectedRunId,
    target,
    outcome: flowSpecific.outcome ?? generic.outcome,
    startedAt: firstRow.timestamp,
    endedAt: lastRow.timestamp,
    nodePath,
    furthestNode,
    terminalSignal,
    explanation: [...flowSpecific.lines, ...generic.lines],
    evidence,
    rowCount: sortedRows.length,
  };
}

export function renderRunExplainSummary(summary: RunExplainSummary): string[] {
  const lines = [
    `Run: ${summary.runId}`,
    `Flow: ${summary.flowId}`,
    `Outcome: ${summary.outcome}`,
  ];

  if (summary.startedAt) {
    lines.push(`Started: ${summary.startedAt}`);
  }
  if (summary.endedAt) {
    lines.push(`Ended: ${summary.endedAt}`);
  }
  if (summary.furthestNode) {
    lines.push(`Furthest node: ${summary.furthestNode}`);
  }
  if (summary.terminalSignal) {
    lines.push(`Terminal signal: ${summary.terminalSignal}`);
  }
  if (summary.nodePath.length > 0) {
    lines.push(`Path: ${summary.nodePath.join(" -> ")}`);
  }

  lines.push("");
  lines.push("Summary:");
  for (const line of summary.explanation) {
    lines.push(`- ${line}`);
  }

  if (summary.evidence.length > 0) {
    lines.push("");
    lines.push("Evidence:");
    for (const row of summary.evidence) {
      lines.push(`- ${formatEvidenceRow(row)}`);
    }
  }

  return lines;
}

function buildGenericExplanation({
  firstError,
  terminalRow,
  pickupRow,
  enqueueRow,
  resultRow,
  lastRow,
  furthestNode,
  nodePath,
}: {
  firstError?: CliLogRow | undefined;
  terminalRow?: CliLogRow | undefined;
  pickupRow?: CliLogRow | undefined;
  enqueueRow?: CliLogRow | undefined;
  resultRow?: CliLogRow | undefined;
  lastRow: CliLogRow;
  furthestNode?: string | undefined;
  nodePath: string[];
}): { outcome: RunExplainOutcome; lines: string[] } {
  const lines: string[] = [];

  if (firstError) {
    lines.push(
      `First failure was at ${formatIdentity(firstError)}${
        firstError.message ? `: ${firstError.message}` : "."
      }`,
    );
    if (nodePath.length > 0) {
      lines.push(`The run reached ${nodePath.length} node${nodePath.length === 1 ? "" : "s"} before failing.`);
    }
    return { outcome: "failed", lines };
  }

  if (terminalRow) {
    lines.push(`Latest terminal step was ${formatIdentity(terminalRow)}.`);
    if (furthestNode) {
      lines.push(`The run appears to have completed at ${furthestNode}.`);
    }
    return { outcome: "completed", lines };
  }

  if (pickupRow && !resultRow) {
    lines.push(`Work reached ${formatIdentity(pickupRow)} and appears to still be in progress.`);
    return { outcome: "in_progress", lines };
  }

  if (enqueueRow && !pickupRow) {
    lines.push(`Work was enqueued at ${formatIdentity(enqueueRow)} but no later pickup was found.`);
    return { outcome: "queued", lines };
  }

  if (resultRow) {
    lines.push(`The last result-like signal was ${formatIdentity(resultRow)}.`);
    lines.push("No downstream work was observed after that point.");
    return { outcome: "stopped", lines };
  }

  lines.push(`The run stopped after ${formatIdentity(lastRow)}.`);
  return { outcome: "stopped", lines };
}

function buildFlowSpecificExplanation(
  flowId: string,
  rows: CliLogRow[],
): { outcome?: RunExplainOutcome | undefined; lines: string[] } {
  if (flowId !== "mail-pipeline") {
    return { lines: [] };
  }

  const lastDecisionRow = [...rows].reverse().find((row) => {
    return (
      rowAttribute(row, "reply_status") ||
      rowAttribute(row, "draft_status") ||
      rowAttribute(row, "result_action")
    );
  });

  if (!lastDecisionRow) {
    return { lines: [] };
  }

  const replyStatus = rowAttribute(lastDecisionRow, "reply_status");
  const draftStatus = rowAttribute(lastDecisionRow, "draft_status");
  const resultAction = rowAttribute(lastDecisionRow, "result_action");

  if (replyStatus === "sent") {
    return {
      outcome: "completed",
      lines: ["Mail flow sent the reply successfully."],
    };
  }

  if (replyStatus === "needs_review" || draftStatus === "needs_review") {
    return {
      outcome: "stopped",
      lines: ["Mail flow routed this thread to manual review before send."],
    };
  }

  if (replyStatus === "approval_pending" || draftStatus === "approval_pending") {
    return {
      outcome: "stopped",
      lines: ["Mail flow created a draft and left it pending approval or autosend."],
    };
  }

  if (replyStatus === "executing_actions") {
    return {
      outcome: "in_progress",
      lines: ["Mail flow approved actions and began send execution."],
    };
  }

  if (resultAction) {
    return {
      lines: [`Mail flow ended with result action ${resultAction}.`],
    };
  }

  return { lines: [] };
}

function collectEvidenceRows({
  rows,
  firstError,
  terminalRow,
  lastRow,
}: {
  rows: CliLogRow[];
  firstError?: CliLogRow | undefined;
  terminalRow?: CliLogRow | undefined;
  lastRow?: CliLogRow | undefined;
}): RunExplainEvidenceRow[] {
  const evidence: CliLogRow[] = [];
  const seen = new Set<string>();

  const push = (row: CliLogRow | undefined) => {
    if (!row) {
      return;
    }

    const key = `${row.timestamp}:${row.seq ?? ""}:${row.message}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    evidence.push(row);
  };

  push(rows.at(0));

  const firstSeenByNode = new Map<string, CliLogRow>();
  for (const row of rows) {
    const componentId = normalizeIdentifierValue(row.componentId);
    if (!componentId || firstSeenByNode.has(componentId)) {
      continue;
    }
    firstSeenByNode.set(componentId, row);
  }

  for (const row of firstSeenByNode.values()) {
    push(row);
    if (evidence.length >= 4) {
      break;
    }
  }

  push(firstError);
  push(terminalRow);
  push(lastRow);

  return evidence.slice(0, 5).map((row) => ({
    timestamp: row.timestamp,
    runId: row.runId,
    componentId: row.componentId,
    stepId: row.stepId ?? row.stepName,
    status: row.status,
    message: row.message,
    attributes: row.attributes,
  }));
}

function collectNodePath(rows: CliLogRow[]): string[] {
  const nodePath: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const componentId = normalizeIdentifierValue(row.componentId);
    if (!componentId || seen.has(componentId)) {
      continue;
    }
    seen.add(componentId);
    nodePath.push(componentId);
  }

  return nodePath;
}

function selectLatestRunGroupByThread(
  rows: CliLogRow[],
  threadId: string,
): { runId: string; rows: CliLogRow[] } | undefined {
  const normalizedThreadId = threadId.trim();
  if (!normalizedThreadId) {
    return undefined;
  }

  let best:
    | {
        runId: string;
        rows: CliLogRow[];
        lastSeen: number;
      }
    | undefined;

  for (const [runId, groupedRows] of groupRowsByExecutionKey(rows)) {
    if (!groupedRows.some((row) => rowAttribute(row, "thread_id") === normalizedThreadId)) {
      continue;
    }

    const lastRow = groupedRows.at(-1);
    const lastSeen = lastRow ? Date.parse(lastRow.timestamp) : Number.NEGATIVE_INFINITY;
    if (!best || lastSeen >= best.lastSeen) {
      best = {
        runId,
        rows: groupedRows,
        lastSeen,
      };
    }
  }

  if (!best) {
    return undefined;
  }

  return {
    runId: best.runId,
    rows: best.rows,
  };
}

function isErrorRow(row: CliLogRow): boolean {
  return (
    normalizeIdentifierValue(row.status) === "error" ||
    Boolean(rowAttribute(row, "error_message")) ||
    Boolean(rowAttribute(row, "error_type"))
  );
}

function isTerminalRow(row: CliLogRow): boolean {
  if (normalizeIdentifierValue(row.status) === "error") {
    return false;
  }

  const leaf = stepLeaf(row.stepId ?? row.stepName);
  return Boolean(leaf && TERMINAL_STEP_LEAVES.has(leaf));
}

function isQueueRow(row: CliLogRow): boolean {
  const action = rowAttribute(row, "action");
  if (action === "enqueue") {
    return true;
  }

  const leaf = stepLeaf(row.stepId ?? row.stepName);
  return Boolean(leaf && QUEUE_STEP_LEAVES.has(leaf));
}

function isPickupRow(row: CliLogRow): boolean {
  const action = rowAttribute(row, "action");
  if (action === "worker_pickup") {
    return true;
  }

  const leaf = stepLeaf(row.stepId ?? row.stepName);
  return Boolean(leaf && PICKUP_STEP_LEAVES.has(leaf));
}

function isResultRow(row: CliLogRow): boolean {
  const action = rowAttribute(row, "action");
  if (action === "worker_result") {
    return true;
  }

  const leaf = stepLeaf(row.stepId ?? row.stepName);
  return Boolean(leaf && RESULT_STEP_LEAVES.has(leaf));
}

function stepLeaf(stepId: string | undefined): string | undefined {
  const normalized = normalizeIdentifierValue(stepId);
  if (!normalized) {
    return undefined;
  }

  const withoutNamespace = normalized.split("::").at(-1) ?? normalized;
  return withoutNamespace.split(".").at(-1);
}

function formatIdentity(row: CliLogRow): string {
  const componentId = normalizeIdentifierValue(row.componentId);
  const stepLabel = preferredStepLabel(row);
  const status = normalizeIdentifierValue(row.status);

  if (componentId && stepLabel && stepLabel !== componentId) {
    return status
      ? `${componentId} · ${stepLabel} [${status}]`
      : `${componentId} · ${stepLabel}`;
  }

  if (componentId) {
    return status ? `${componentId} [${status}]` : componentId;
  }

  return status ? `${stepLabel} [${status}]` : stepLabel;
}

function formatSignal(row: CliLogRow | undefined): string | undefined {
  if (!row) {
    return undefined;
  }

  const message = row.message.trim();
  return message ? `${formatIdentity(row)}: ${message}` : formatIdentity(row);
}

function formatEvidenceRow(row: RunExplainEvidenceRow): string {
  const parts = [row.timestamp];

  const identityParts = [row.componentId, row.stepId]
    .map((value) => normalizeIdentifierValue(value))
    .filter((value): value is string => Boolean(value));
  if (identityParts.length > 0) {
    parts.push(identityParts.join(" · "));
  }

  if (row.status) {
    parts.push(`[${row.status}]`);
  }

  parts.push(row.message);
  return parts.join("  ");
}
