import { describe, expect, it } from 'vitest';

import { formatEasternTime } from '../time';

describe('time helpers', () => {
  it('formats timestamps in 12-hour Eastern time', () => {
    expect(formatEasternTime('2026-03-09T16:00:00.000Z')).toBe('12:00:00 PM ET');
  });

  it('falls back to the original string for invalid timestamps', () => {
    expect(formatEasternTime('not-a-timestamp')).toBe('not-a-timestamp');
  });

  it('can format timestamps with millisecond precision when requested', () => {
    expect(formatEasternTime('2026-03-09T16:00:00.123Z', { precise: true })).toBe(
      '12:00:00.123 PM ET',
    );
  });
});
