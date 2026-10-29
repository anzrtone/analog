// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import type { RingColor } from '@/theme/tokens';

// One registry for every set type: badge, colour, volume credit, PR eligibility and which fields show.
// Badge letters and colours follow BRAND §4.5. Glyphs Plex Mono lacks (⏱ ⏲ ▲ ▼) are drawn as SVG.

export const SET_TYPES = [
  'warmup',
  'feeder',
  'working',
  'top',
  'backoff',
  'drop',
  'mechDrop',
  'myo',
  'myoMatch',
  'restPause',
  'cluster',
  'amrap',
  'failure',
  'negative',
  'isometric',
  'amtap',
  'pyramid',
  'reversePyramid',
  'wave',
  'emom',
  'technique',
] as const;
export type BuiltInSetType = (typeof SET_TYPES)[number];
/** A built-in type, or the id of a user-made one (see `CustomSetType`). */
export type SetType = BuiltInSetType | (string & {});

/** Drawn emblems. The first five ship with the built-in types; the rest are only for custom ones. */
export const GLYPHS = ['stopwatch', 'timer', 'up', 'down', 'wave', 'bolt', 'flame', 'star', 'heart', 'diamond', 'square', 'plus', 'target', 'check', 'pause', 'chevrons'] as const;
export type Glyph = (typeof GLYPHS)[number];

export interface SetTypeInfo {
  label: string;
  /** Text inside the ring. `null` means "use the set number". */
  letter: string | null;
  glyph?: Glyph;
  ring: RingColor;
  /** Credit toward weekly working volume for the set itself. */
  volumeCredit: number;
  /** Extra credit per segment after the first (myo mini-sets, extra drops). */
  segmentCredit: number;
  prEligible: boolean;
  /** Logged as segments (drops, mini-sets, clusters). */
  segmented: boolean;
  /** Logged as time instead of reps. */
  timed: boolean;
  /** Stopwatch counts up to failure. */
  openEnded: boolean;
  hint: string;
}

const base = {
  volumeCredit: 1,
  segmentCredit: 0,
  prEligible: true,
  segmented: false,
  timed: false,
  openEnded: false,
} as const;

const BUILT_IN_INFO: Record<BuiltInSetType, SetTypeInfo> = {
  warmup: { ...base, label: 'Warm-up', letter: 'w', ring: 'white', volumeCredit: 0, prEligible: false, hint: 'Ramp-up set. Not counted as volume.' },
  feeder: { ...base, label: 'Feeder', letter: 'f', ring: 'white', volumeCredit: 0, prEligible: false, hint: 'Heavy single working up to a top set. Not counted.' },
  technique: { ...base, label: 'Technique', letter: 't', ring: 'white', volumeCredit: 0, prEligible: false, hint: 'Light skill work. Not counted by default.' },
  working: { ...base, label: 'Working', letter: null, ring: 'ink', hint: 'A straight working set.' },
  pyramid: { ...base, label: 'Pyramid', letter: null, glyph: 'up', ring: 'ink', hint: 'Weight goes up, reps come down.' },
  reversePyramid: { ...base, label: 'Reverse pyramid', letter: null, glyph: 'down', ring: 'ink', hint: 'Heaviest first, then lighter with more reps.' },
  wave: { ...base, label: 'Wave', letter: '≈', glyph: 'wave', ring: 'ink', hint: 'Repeating rep waves, e.g. 3-2-1, 3-2-1.' },
  top: { ...base, label: 'Top set', letter: 'T', ring: 'red', hint: 'Heaviest set of the day. Back-offs are worked out from it.' },
  amrap: { ...base, label: 'AMRAP', letter: '+', ring: 'red', hint: 'As many reps as possible. Feeds your training max.' },
  amtap: { ...base, label: 'AMTAP', letter: null, glyph: 'stopwatch', ring: 'red', timed: true, openEnded: true, hint: 'As much time as possible. The stopwatch runs until you stop.' },
  failure: { ...base, label: 'Failure', letter: '!', ring: 'red', hint: 'Taken to failure: 0 reps in reserve.' },
  backoff: { ...base, label: 'Back-off', letter: 'b', ring: 'blue', hint: 'Lighter than the top set by a set percentage.' },
  drop: { ...base, label: 'Drop set', letter: 'd', ring: 'yellow', segmented: true, hint: 'Strip weight and keep going, no rest.' },
  mechDrop: { ...base, label: 'Mechanical drop', letter: 'md', ring: 'yellow', segmented: true, hint: 'Switch to an easier variation, same muscle.' },
  myo: { ...base, label: 'Myo-reps', letter: 'm', ring: 'yellow', segmented: true, segmentCredit: 0.33, hint: 'Activation set, then mini-sets of 3–5 reps after 3–5 breaths.' },
  myoMatch: { ...base, label: 'Myo-rep match', letter: 'mm', ring: 'yellow', segmented: true, segmentCredit: 0.33, hint: 'Match the activation-set reps across mini-sets.' },
  restPause: { ...base, label: 'Rest-pause', letter: 'rp', ring: 'yellow', segmented: true, hint: 'Same weight, 10–20 s pauses between segments.' },
  cluster: { ...base, label: 'Cluster', letter: 'c', ring: 'yellow', segmented: true, hint: 'Short rests inside one set, e.g. 4 × 2 @ 20 s.' },
  emom: { ...base, label: 'EMOM / density', letter: null, glyph: 'timer', ring: 'yellow', segmented: true, hint: 'Reps every minute, or max reps in a time cap.' },
  negative: { ...base, label: 'Negatives', letter: 'n', ring: 'yellow', hint: 'Eccentric-only reps. Add the lowering time if you track it.' },
  isometric: { ...base, label: 'Timed hold', letter: null, ring: 'ink', timed: true, hint: 'Hold for a set time.' },
};

const UNKNOWN_INFO: SetTypeInfo = { ...base, label: 'Custom', letter: '?', ring: 'ink', hint: 'A set type that was deleted or came from another backup.' };

/** Built-ins plus any registered custom types. An unknown id reads as a plain working set rather than crashing. */
export const SET_TYPE_INFO: Record<BuiltInSetType, SetTypeInfo> & Record<string, SetTypeInfo | undefined> = new Proxy({ ...BUILT_IN_INFO } as unknown as Record<BuiltInSetType, SetTypeInfo> & Record<string, SetTypeInfo | undefined>, {
  get: (target, key) => (typeof key === 'string' ? (target[key] ?? UNKNOWN_INFO) : undefined),
});

/** Info for any set type id; unknown ids read as a neutral fallback instead of undefined. */
export function setTypeInfo(type: SetType): SetTypeInfo {
  return SET_TYPE_INFO[type] ?? UNKNOWN_INFO;
}

/** What a user saves for a set type of their own. Lives in settings, so it travels with backups. */
export interface CustomSetType {
  id: string;
  label: string;
  hint: string;
  /** Text inside the ring, 1–2 characters; wins over `glyph` when both are set. */
  letter: string | null;
  glyph: Glyph | null;
  ring: RingColor;
  /** Counts toward weekly working volume. */
  countsAsVolume: boolean;
  prEligible: boolean;
  timed: boolean;
}

export const CUSTOM_PREFIX = 'custom:';
let customIds: string[] = [];

/** Swap the registered custom types. Call on load and after every edit. */
export function registerCustomSetTypes(list: CustomSetType[]): void {
  const raw = SET_TYPE_INFO as unknown as Record<string, SetTypeInfo>;
  for (const id of customIds) delete raw[id];
  customIds = [];
  for (const c of list) {
    raw[c.id] = {
      ...base,
      label: c.label,
      letter: c.letter || null,
      glyph: c.letter ? undefined : (c.glyph ?? undefined),
      ring: c.ring,
      volumeCredit: c.countsAsVolume ? 1 : 0,
      prEligible: c.prEligible,
      timed: c.timed,
      hint: c.hint,
    };
    customIds.push(c.id);
  }
}

/** Ids of every PR-eligible type right now, custom ones included. */
export function prEligibleTypes(): string[] {
  return [...SET_TYPES, ...customIds].filter((t) => setTypeInfo(t).prEligible);
}

/** Volume credit a completed set earns its primary muscles (secondary muscles scale this). */
export function setVolumeCredit(type: SetType, segmentCount: number): number {
  const info = setTypeInfo(type);
  if (info.volumeCredit === 0) return 0;
  const extra = Math.max(0, segmentCount - 1) * info.segmentCredit;
  return Math.round((info.volumeCredit + extra) * 100) / 100;
}

/** Screen-reader name, e.g. "Top set". */
export function setTypeLabel(type: SetType): string {
  return setTypeInfo(type).label;
}

export const PICKER_ORDER: SetType[] = [
  'working',
  'warmup',
  'feeder',
  'top',
  'backoff',
  'amrap',
  'failure',
  'drop',
  'mechDrop',
  'myo',
  'myoMatch',
  'restPause',
  'cluster',
  'negative',
  'isometric',
  'amtap',
  'pyramid',
  'reversePyramid',
  'wave',
  'emom',
  'technique',
];
