import { describe, expect, it } from 'vitest';

import { resolveHandleId } from '../nodePrimitives';

describe('resolveHandleId', () => {
  it('uses semantic ids for implicit source and target handles', () => {
    expect(resolveHandleId('incoming-worker', { position: 'bottom', type: 'source' })).toBe(
      'incoming-worker-out-bottom',
    );
    expect(resolveHandleId('send-queue', { position: 'top', type: 'target' })).toBe(
      'send-queue-in-top',
    );
  });

  it('preserves explicit handle ids from the flow contract', () => {
    expect(
      resolveHandleId('postgres-main', { id: 'in-right', position: 'right', type: 'target' }),
    ).toBe('postgres-main-in-right');
  });

  it('derives source and target ids independently for dual-role handles', () => {
    const dualRoleHandle = { position: 'left', type: 'both' } as const;

    expect(resolveHandleId('router', dualRoleHandle, 'target')).toBe('router-in-left');
    expect(resolveHandleId('router', dualRoleHandle, 'source')).toBe('router-out-left');
  });
});
