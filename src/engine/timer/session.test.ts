// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { LONG_WORKOUT_MS, formatTimeOfDay, parseTimeOfDay, resolveSpan, shouldAskEnded, windBack } from './session';

const at = (h: number, m = 0, day = 29) => new Date(2026, 9, day, h, m).getTime();

describe('workout clock', () => {
  it('reads the ways people type a time', () => {
    expect(parseTimeOfDay('18:30')).toBe(18 * 60 + 30);
    expect(parseTimeOfDay('1830')).toBe(18 * 60 + 30);
    expect(parseTimeOfDay('6:30 pm')).toBe(18 * 60 + 30);
    expect(parseTimeOfDay('630pm')).toBe(18 * 60 + 30);
    expect(parseTimeOfDay(' 6 PM ')).toBe(18 * 60);
    expect(parseTimeOfDay('6.05')).toBe(6 * 60 + 5);
    expect(parseTimeOfDay('12am')).toBe(0);
    expect(parseTimeOfDay('12:15pm')).toBe(12 * 60 + 15);
    expect(parseTimeOfDay('7')).toBe(7 * 60);
  });

  it('rejects what is not a time', () => {
    for (const t of ['', 'soon', '25:00', '18:75', '13pm', '0am', '1:2']) expect(parseTimeOfDay(t)).toBeNull();
  });

  it('formats in the form it reads back', () => {
    expect(formatTimeOfDay(at(7, 5))).toBe('7:05 AM');
    expect(formatTimeOfDay(at(0, 15))).toBe('12:15 AM');
    expect(formatTimeOfDay(at(12, 0))).toBe('12:00 PM');
    expect(formatTimeOfDay(at(7, 5), '24h')).toBe('07:05');
    for (const clock of ['12h', '24h'] as const) {
      for (const [h, m] of [[0, 15], [12, 0], [19, 40]] as const) expect(parseTimeOfDay(formatTimeOfDay(at(h, m), clock))).toBe(h * 60 + m);
    }
  });

  it('winds the counter back but not past now', () => {
    expect(windBack(at(16), 15 * 60000, at(19))).toBe(at(16, 15));
    expect(windBack(at(16), 4 * 3600_000, at(19))).toBe(at(19));
  });

  it('resolves "from x to y" on the day the workout began', () => {
    expect(resolveSpan('16:05', '17:20', at(16), at(21))).toEqual({ ok: true, startedAt: at(16, 5), endedAt: at(17, 20) });
    expect(resolveSpan('4:05 pm', '', at(16), at(21))).toEqual({ ok: true, startedAt: at(16, 5), endedAt: null });
  });

  it('runs past midnight when the end reads earlier', () => {
    expect(resolveSpan('23:00', '0:30', at(23), at(9, 0, 30))).toEqual({ ok: true, startedAt: at(23), endedAt: at(0, 30, 30) });
  });

  it('refuses times in the future and nonsense', () => {
    expect(resolveSpan('20:00', '', at(16), at(19)).ok).toBe(false);
    expect(resolveSpan('16:00', '20:00', at(16), at(19)).ok).toBe(false);
    expect(resolveSpan('later', '', at(16), at(19)).ok).toBe(false);
    expect(resolveSpan('16:00', 'later', at(16), at(19)).ok).toBe(false);
  });

  it('asks after three hours, then not again until the snooze runs out', () => {
    expect(shouldAskEnded(at(16), at(16) + LONG_WORKOUT_MS - 1, null)).toBe(false);
    expect(shouldAskEnded(at(16), at(16) + LONG_WORKOUT_MS, null)).toBe(true);
    expect(shouldAskEnded(at(16), at(19, 30), at(20))).toBe(false);
    expect(shouldAskEnded(at(16), at(20), at(20))).toBe(true);
  });
});
