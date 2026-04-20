import demoPipelineContractJson from '../flow-contracts/demo-pipeline.json';
import type { FlowConfig, FlowContract, SpanMapping } from '../core/types';
import {
  decisionNode,
  detailNode,
  queueNode,
  resourceNode,
  stepNode,
  triggerNode,
  workerNode,
} from './nodeFactory';

const demoPipelineContract = demoPipelineContractJson as FlowContract;

export const spanMapping: SpanMapping = {
  'external-event': 'external-event',
  'intake-queue': 'intake-queue',
  'intake-worker': 'intake-worker',
  'normalize-record': 'normalize-record',
  'input-valid': 'input-valid',
  'publish-queue': 'publish-queue',
  'publish-worker': 'publish-worker',
  'intake-worker.parse-input': 'parse-input',
  'intake-worker.persist-raw': 'persist-raw',
  'publish-worker.persist-result': 'persist-result',
  'publish-worker.archive-output': 'archive-output',
};

export const demoPipelineFlow: FlowConfig = {
  id: demoPipelineContract.id,
  name: demoPipelineContract.name,
  description:
    'A compact sample flow that exercises triggers, queues, workers, decisions, detail steps, and resource writes.',
  contract: demoPipelineContract,
  hasGraph: true,
  nodes: [
    triggerNode({
      id: 'external-event',
      label: 'External Event',
      description: 'Simulated ingress event that starts the sample pipeline.',
      position: { x: 120, y: 20 },
    }),
    queueNode({
      id: 'intake-queue',
      label: 'Intake Queue',
      description: 'Buffers accepted events before intake processing begins.',
      position: { x: 120, y: 150 },
    }),
    workerNode({
      id: 'intake-worker',
      label: 'Intake Worker',
      description: 'Consumes incoming work and prepares it for publication.',
      position: { x: 120, y: 280 },
    }),
    detailNode({
      id: 'parse-input',
      label: 'Parse Input',
      description: 'Extracts the structured fields needed for downstream processing.',
      position: { x: -80, y: 430 },
    }),
    detailNode({
      id: 'persist-raw',
      label: 'Persist Raw',
      description: 'Stores the raw accepted record for audit and replay.',
      position: { x: 160, y: 430 },
    }),
    resourceNode({
      id: 'postgres',
      label: 'Postgres',
      style: { icon: 'pg' },
      description: 'Primary relational store for the demo pipeline.',
      position: { x: 430, y: 520 },
    }),
    stepNode({
      id: 'normalize-record',
      label: 'Normalize Record',
      description: 'Builds the publishable output shape after intake completes.',
      position: { x: 120, y: 590 },
    }),
    decisionNode({
      id: 'input-valid',
      label: 'Input Valid?',
      description: 'Decision gate that either publishes the record or rejects it.',
      position: { x: 165, y: 735 },
    }),
    detailNode({
      id: 'reject-record',
      label: 'Reject Record',
      description: 'Non-happy-path branch for invalid input.',
      position: { x: 430, y: 760 },
      handles: [{ id: 'in-left', position: 'left', type: 'target' }],
    }),
    queueNode({
      id: 'publish-queue',
      label: 'Publish Queue',
      description: 'Buffers validated work for publishing.',
      position: { x: 120, y: 900 },
    }),
    workerNode({
      id: 'publish-worker',
      label: 'Publish Worker',
      description: 'Publishes the normalized record and archives the final output.',
      position: { x: 120, y: 1030 },
    }),
    detailNode({
      id: 'persist-result',
      label: 'Persist Result',
      description: 'Writes the final result row into Postgres.',
      position: { x: -80, y: 1180 },
    }),
    detailNode({
      id: 'archive-output',
      label: 'Archive Output',
      description: 'Stores the published artifact in object storage.',
      position: { x: 160, y: 1180 },
    }),
    resourceNode({
      id: 'object-store',
      label: 'Object Store',
      style: { icon: 's3' },
      description: 'Archive bucket for demo artifacts.',
      position: { x: 430, y: 1265 },
    }),
  ],
  edges: [
    { id: 'external-event-intake-queue', source: 'external-event', target: 'intake-queue' },
    { id: 'intake-queue-intake-worker', source: 'intake-queue', target: 'intake-worker' },
    { id: 'intake-worker-parse-input', source: 'intake-worker', target: 'parse-input' },
    { id: 'parse-input-persist-raw', source: 'parse-input', target: 'persist-raw' },
    { id: 'persist-raw-postgres', source: 'persist-raw', target: 'postgres' },
    { id: 'persist-raw-normalize-record', source: 'persist-raw', target: 'normalize-record' },
    { id: 'normalize-record-input-valid', source: 'normalize-record', target: 'input-valid' },
    {
      id: 'input-valid-publish-queue',
      source: 'input-valid',
      sourceHandle: 'input-valid-out-bottom',
      target: 'publish-queue',
      label: 'Yes',
    },
    {
      id: 'input-valid-reject-record',
      source: 'input-valid',
      sourceHandle: 'input-valid-out-right',
      target: 'reject-record',
      targetHandle: 'reject-record-in-left',
      label: 'No',
    },
    { id: 'publish-queue-publish-worker', source: 'publish-queue', target: 'publish-worker' },
    { id: 'publish-worker-persist-result', source: 'publish-worker', target: 'persist-result' },
    { id: 'persist-result-postgres', source: 'persist-result', target: 'postgres' },
    { id: 'persist-result-archive-output', source: 'persist-result', target: 'archive-output' },
    { id: 'archive-output-object-store', source: 'archive-output', target: 'object-store' },
  ],
  spanMapping,
};
