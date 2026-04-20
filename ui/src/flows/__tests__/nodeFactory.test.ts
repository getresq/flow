import { describe, expect, it } from 'vitest';

import {
  normalizeTechnicalAlias,
  queueNode,
  workerNode,
  stepNode,
  detailNode,
  withNodeVisualDefaults,
} from '../nodeFactory';

describe('normalizeTechnicalAlias', () => {
  it('strips queue prefixes and normalizes underscores', () => {
    expect(normalizeTechnicalAlias('rrq:queue:mail-analyze')).toBe('mail-analyze');
    expect(normalizeTechnicalAlias('mail_reply_drafts')).toBe('mail-reply-drafts');
  });

  it('strips handler prefixes and normalizes underscores', () => {
    expect(normalizeTechnicalAlias('handle_mail_send_reply')).toBe('mail-send-reply');
  });

  it('returns undefined for empty values', () => {
    expect(normalizeTechnicalAlias(undefined)).toBeUndefined();
    expect(normalizeTechnicalAlias('   ')).toBeUndefined();
  });
});

describe('preset functions', () => {
  it('applies standard sizing to queue and worker presets', () => {
    const queue = queueNode({
      id: 'analyze-queue',
      label: 'Analyze Queue',
      position: { x: 0, y: 0 },
    });

    const worker = workerNode({
      id: 'analyze-worker',
      label: 'Analyze Worker',
      position: { x: 0, y: 0 },
    });

    expect(queue.size).toEqual({ width: 184, height: 64 });
    expect(worker.size).toEqual({ width: 184, height: 64 });
    expect(queue.type).toBe('roundedRect');
    expect(queue.style?.color).toBe('amber');
    expect(queue.eyebrow).toBe('QUEUE');
    expect(worker.style?.color).toBe('ocean');
    expect(worker.eyebrow).toBe('WORKER');
  });

  it('applies step and detail sizing', () => {
    const step = stepNode({
      id: 'send-process',
      label: 'Send Reply',
      position: { x: 0, y: 0 },
    });

    const detail = detailNode({
      id: 'write-metadata',
      label: 'Write Metadata',
      position: { x: 0, y: 0 },
    });

    expect(step.size).toEqual({ width: 184, height: 64 });
    expect(step.style?.color).toBe('sky');
    expect(detail.size).toEqual({ width: 184, height: 44 });
    expect(detail.style?.color).toBe('muted');
  });

  it('preserves explicit widths', () => {
    const custom = stepNode({
      id: 'custom',
      label: 'Custom',
      position: { x: 0, y: 0 },
      size: { width: 260 },
    });

    expect(custom.size).toEqual({ width: 260, height: 64 });
  });

  it('passes through eyebrow text directly', () => {
    const node = stepNode({
      id: 'handler',
      label: 'Handle Request',
      eyebrow: 'HANDLER',
      position: { x: 0, y: 0 },
    });

    expect(node.eyebrow).toBe('HANDLER');
  });

  it('preset eyebrow can be overridden by explicit eyebrow', () => {
    const node = queueNode({
      id: 'buffer',
      label: 'Request Buffer',
      eyebrow: 'BUFFER',
      position: { x: 0, y: 0 },
    });

    expect(node.eyebrow).toBe('BUFFER');
  });
});

describe('withNodeVisualDefaults (backward compat)', () => {
  it('normalizes rectangle to roundedRect', () => {
    const node = withNodeVisualDefaults({
      id: 'test',
      type: 'rectangle',
      label: 'Test',
      position: { x: 0, y: 0 },
    });

    expect(node.type).toBe('roundedRect');
  });
});
