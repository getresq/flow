import type { BranchPlacementConfig, FlowNodeConfig } from '../types';
import { resolveNodeDimensions } from '../nodeSizing';

export interface Position {
  x: number;
  y: number;
}

const PRIMARY_VERTICAL_GAP = 132;
const PRIMARY_RANK_SPACING = 132;
const RIGHT_HORIZONTAL_OFFSET = 320;
const RIGHT_DOMAIN_COLUMN_OFFSET = 240;
const LEFT_HORIZONTAL_OFFSET = 220;
const LEFT_DOMAIN_COLUMN_OFFSET = 180;
const RIGHT_BASE_VERTICAL_OFFSET = 8;
const RIGHT_RANK_SPACING = 124;
const BRANCH_VERTICAL_CLEARANCE = 28;
const BRANCH_HORIZONTAL_CLEARANCE = 24;

function nodeDimensions(node: FlowNodeConfig) {
  return resolveNodeDimensions(node);
}

function mergeOffset(base: number, override?: number) {
  return base + (override ?? 0);
}

function rectanglesConflict(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
) {
  const horizontalOverlap =
    left.x < right.x + right.width + BRANCH_HORIZONTAL_CLEARANCE &&
    left.x + left.width + BRANCH_HORIZONTAL_CLEARANCE > right.x;

  if (!horizontalOverlap) {
    return false;
  }

  return left.y < right.y + right.height + BRANCH_VERTICAL_CLEARANCE;
}

function resolveBranchDepth(
  nodeId: string,
  branchById: Map<string, BranchPlacementConfig>,
  stack: Set<string>,
  cache: Map<string, number>,
): number {
  const cached = cache.get(nodeId);
  if (cached !== undefined) {
    return cached;
  }

  const branch = branchById.get(nodeId);
  if (!branch) {
    cache.set(nodeId, 0);
    return 0;
  }

  if (stack.has(nodeId)) {
    cache.set(nodeId, 0);
    return 0;
  }

  stack.add(nodeId);
  const depth = branchById.has(branch.anchorId)
    ? resolveBranchDepth(branch.anchorId, branchById, stack, cache) + 1
    : 1;
  stack.delete(nodeId);
  cache.set(nodeId, depth);
  return depth;
}

export function applyBranchTemplatePositions(
  nodes: FlowNodeConfig[],
  basePositions: Map<string, Position>,
  runtimePositions: Map<string, Position>,
): Map<string, Position> {
  const nextPositions = new Map(basePositions);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const branchNodes = nodes.filter((node) => node.layout?.branch && !node.parentId);

  if (branchNodes.length === 0) {
    return nextPositions;
  }

  const branchById = new Map(
    branchNodes.map((node) => [node.id, node.layout!.branch as BranchPlacementConfig]),
  );
  const depthCache = new Map<string, number>();
  const sortedBranchNodes = [...branchNodes].sort((left, right) => {
    const leftDepth = resolveBranchDepth(left.id, branchById, new Set(), depthCache);
    const rightDepth = resolveBranchDepth(right.id, branchById, new Set(), depthCache);

    if (leftDepth !== rightDepth) {
      return leftDepth - rightDepth;
    }

    const leftOrder = left.layout?.order ?? 0;
    const rightOrder = right.layout?.order ?? 0;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.id.localeCompare(right.id);
  });

  for (const node of sortedBranchNodes) {
    if (runtimePositions.has(node.id)) {
      continue;
    }

    const branch = node.layout?.branch;
    if (!branch) {
      continue;
    }

    const anchorNode = nodeById.get(branch.anchorId);
    const anchorPosition = nextPositions.get(branch.anchorId);
    if (!anchorNode || !anchorPosition) {
      continue;
    }

    const anchorDimensions = nodeDimensions(anchorNode);
    const nodeDimensionsValue = nodeDimensions(node);
    const dx = branch.dx ?? 0;
    const dy = branch.dy ?? 0;

    if (branch.track === 'primary') {
      nextPositions.set(node.id, {
        x: anchorPosition.x + (anchorDimensions.width - nodeDimensionsValue.width) / 2 + dx,
        y:
          anchorPosition.y +
          anchorDimensions.height +
          mergeOffset(PRIMARY_VERTICAL_GAP + branch.rank * PRIMARY_RANK_SPACING, dy),
      });
      continue;
    }

    if (branch.track === 'left') {
      nextPositions.set(node.id, {
        x:
          anchorPosition.x -
          nodeDimensionsValue.width -
          (LEFT_HORIZONTAL_OFFSET + (branch.column ?? 0) * LEFT_DOMAIN_COLUMN_OFFSET) +
          dx,
        y:
          anchorPosition.y +
          mergeOffset(RIGHT_BASE_VERTICAL_OFFSET + branch.rank * RIGHT_RANK_SPACING, dy),
      });
      continue;
    }

    nextPositions.set(node.id, {
      x:
        anchorPosition.x +
        anchorDimensions.width +
        mergeOffset(
          RIGHT_HORIZONTAL_OFFSET + (branch.column ?? 0) * RIGHT_DOMAIN_COLUMN_OFFSET,
          dx,
        ),
      y:
        anchorPosition.y +
        mergeOffset(RIGHT_BASE_VERTICAL_OFFSET + branch.rank * RIGHT_RANK_SPACING, dy),
    });
  }

  const finalizedBranchNodes: FlowNodeConfig[] = [];

  for (const node of sortedBranchNodes) {
    if (runtimePositions.has(node.id)) {
      continue;
    }

    const nodePosition = nextPositions.get(node.id);
    if (!nodePosition) {
      continue;
    }

    const dims = nodeDimensions(node);
    let nextY = nodePosition.y;

    for (const priorNode of finalizedBranchNodes) {
      const priorPosition = nextPositions.get(priorNode.id);
      if (!priorPosition) {
        continue;
      }

      const priorDims = nodeDimensions(priorNode);
      const currentRect = {
        x: nodePosition.x,
        y: nextY,
        width: dims.width,
        height: dims.height,
      };
      const priorRect = {
        x: priorPosition.x,
        y: priorPosition.y,
        width: priorDims.width,
        height: priorDims.height,
      };

      if (!rectanglesConflict(currentRect, priorRect)) {
        continue;
      }

      nextY = Math.max(nextY, priorPosition.y + priorDims.height + BRANCH_VERTICAL_CLEARANCE);
    }

    if (nextY !== nodePosition.y) {
      nextPositions.set(node.id, {
        x: nodePosition.x,
        y: nextY,
      });
    }

    finalizedBranchNodes.push(node);
  }

  return nextPositions;
}
