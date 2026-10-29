// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
// Haptics and sounds from BRAND §9. Errors never buzz: problems show as text.
import bellUrl from '@/assets/sounds/rest_bell.wav';
import tickUrl from '@/assets/sounds/pencil_tick.wav';
import clankUrl from '@/assets/sounds/plate_clank.wav';
import { settings } from '@/db/settings';
import { platform } from '@/platform';

type Sound = 'bell' | 'tick' | 'clank';
const URLS: Record<Sound, string> = { bell: bellUrl, tick: tickUrl, clank: clankUrl };
const players: Partial<Record<Sound, HTMLAudioElement>> = {};

function play(name: Sound) {
  try {
    const a = (players[name] ??= new Audio(URLS[name]));
    a.currentTime = 0;
    void a.play().catch(() => undefined);
  } catch {
    // Sound is decoration; never let it break logging.
  }
}

const haptic = (kind: Parameters<ReturnType<typeof platform>['haptic']>[0]) => {
  if (!settings().haptics) return;
  try {
    platform().haptic(kind);
  } catch {
    /* no platform yet (tests) */
  }
};

export const sensory = {
  setCompleted() {
    haptic('light');
    if (settings().otherSounds) play('tick');
  },
  /** In-app rest end. On Android the native alarm already rings, so `withSound` is false there. */
  restOver(withSound: boolean) {
    haptic('medium');
    setTimeout(() => haptic('medium'), 300);
    if (withSound && settings().restSound) play('bell');
  },
  restPulse() {
    haptic('selection');
  },
  pr() {
    haptic('heavy');
    if (settings().otherSounds) play('clank');
  },
  holdCue() {
    haptic('success');
    if (settings().restSound) play('bell');
  },
};
