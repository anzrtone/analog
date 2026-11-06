// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useState } from 'react';
import { formatClock } from '@/engine/math/units';
import { TimeEntrySheet } from './NumberSheet';
import { Segmented } from './ui';

export const MAX_REST_MS = 30 * 60_000;

/**
 * Rest lengths as one ruled track: the usual presets, whatever custom length is set (so it shows as chosen),
 * and "Other…" to type any m:ss. Used for an exercise's rest in the workout and for the default in Settings.
 */
export function RestPicker({ label, valueMs, presetsMs, onChange }: { label: string; valueMs: number; presetsMs: number[]; onChange: (ms: number) => void }) {
  const [typing, setTyping] = useState(false);
  const stops = presetsMs.includes(valueMs) ? presetsMs : [...presetsMs, valueMs].sort((a, b) => a - b);
  return (
    <>
      <Segmented
        label={label}
        value={String(valueMs)}
        onChange={(v) => (v === 'other' ? setTyping(true) : onChange(Number(v)))}
        options={[...stops.map((ms) => ({ value: String(ms), label: formatClock(ms) })), { value: 'other', label: 'Other…' }]}
      />
      {typing ? (
        <TimeEntrySheet
          title={label}
          valueMs={valueMs}
          stepMs={15000}
          onDone={(ms) => {
            if (ms != null && ms >= 5000) onChange(Math.min(ms, MAX_REST_MS));
          }}
          onClose={() => setTyping(false)}
        />
      ) : null}
    </>
  );
}
