import { describe, expect, it } from 'vitest';

import {
  bottomPanelSizing,
  getBottomPanelSnapFromHeight,
  getBottomPanelSnapHeight,
} from '../bottomPanelSizing';

describe('bottomPanelSizing', () => {
  it('guarantees enough height for five visible rows in partial mode', () => {
    expect(getBottomPanelSnapHeight('partial', 900)).toBe(bottomPanelSizing.partialMinHeight);
    expect(bottomPanelSizing.partialMinHeight).toBeGreaterThan(Math.round(900 * 0.25));
  });

  it('keeps the viewport-based partial height when it already exceeds the minimum', () => {
    expect(getBottomPanelSnapHeight('partial', 1200)).toBe(Math.round(1200 * 0.25));
  });

  it('resolves snaps using the same partial-height contract', () => {
    expect(getBottomPanelSnapFromHeight(bottomPanelSizing.whisperHeight, 900)).toBe('whisper');
    expect(getBottomPanelSnapFromHeight(bottomPanelSizing.partialMinHeight, 900)).toBe('partial');
    expect(getBottomPanelSnapFromHeight(900 - bottomPanelSizing.appHeaderHeight, 900)).toBe('full');
  });
});
