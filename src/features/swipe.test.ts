// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { describe, expect, it } from 'vitest';
import { swipeCommits, swipeIntent, swipeOffset } from './swipe';

describe('swipe to delete', () => {
  it('waits, then calls sideways drags swipes and the rest scrolling', () => {
    expect(swipeIntent(4, 3)).toBe('undecided');
    expect(swipeIntent(-30, 6)).toBe('horizontal');
    expect(swipeIntent(-20, 18)).toBe('vertical');
    expect(swipeIntent(2, 40)).toBe('vertical');
  });
  it('only moves left, and not past the row', () => {
    expect(swipeOffset(40, 360)).toBe(0);
    expect(swipeOffset(-120, 360)).toBe(-120);
    expect(swipeOffset(-900, 360)).toBe(-360);
  });
  it('commits past 40% of the width, or on a quick flick', () => {
    expect(swipeCommits(-100, 360, 0)).toBe(false);
    expect(swipeCommits(-150, 360, 0)).toBe(true);
    expect(swipeCommits(-60, 360, -1)).toBe(true);
    expect(swipeCommits(-30, 360, -1)).toBe(false);
    expect(swipeCommits(-100, 200, 0)).toBe(true);
    expect(swipeCommits(-90, 200, 0)).toBe(false);
  });
});
