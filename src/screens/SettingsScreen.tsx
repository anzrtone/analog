// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { SupportButton } from '@/components/SupportButton';
import { useEffect, useState } from 'react';
import { INSTALL_URL, SURVEY_URL } from '@/config';
import { patchSettings, useSettings, type AppSettings } from '@/db/settings';
import { formatClock } from '@/engine/math/units';
import { WARMUP_PRESETS } from '@/engine/math/warmup';
import { navigate } from '@/features/nav';
import { openOnboarding, setCounting, setSharing } from '@/features/onboarding/store';
import { startTour } from '@/features/tour/store';
import { platform } from '@/platform';
import { palettes, type Palette, type ThemeName } from '@/theme/tokens';
import { Check } from 'lucide-react';
import { ChoiceRow, cx, Field, MarginNote, Pad, Screen, Section, Segmented, ToggleRow } from '@/components/ui';

const THEMES: { value: ThemeName | 'system'; label: string; note: string }[] = [
  { value: 'carbon', label: 'Carbon', note: 'the default night page' },
  { value: 'paper', label: 'Paper', note: 'cream stock, navy pen' },
  { value: 'blueprint', label: 'Blueprint', note: 'cyanotype drafting sheet' },
  { value: 'darkroom', label: 'Darkroom', note: 'safelight warmth' },
  { value: 'ledger', label: 'Ledger', note: 'green-tint bookkeeping paper' },
  { value: 'system', label: 'System', note: 'follows your device' },
];

/** A tiny log page in a theme's own colours: ruled lines, a pen stroke, and the plate rings. */
function Page({ p, className }: { p: Palette; className?: string }) {
  const rings = [p.plate.red.ring, p.plate.blue.ring, p.plate.yellow.ring, p.plate.green.ring];
  return (
    <svg viewBox="0 0 80 52" aria-hidden className={className} style={{ background: p.paper }}>
      <rect x="0" y="36" width="80" height="16" fill={p.paperSunk} />
      <line x1="0" y1="36.5" x2="80" y2="36.5" stroke={p.rule} />
      <rect x="8" y="9" width="28" height="4" rx="2" fill={p.ink} />
      <rect x="8" y="18" width="44" height="3" rx="1.5" fill={p.ink2} />
      <rect x="8" y="25" width="20" height="3" rx="1.5" fill={p.pencil} />
      {rings.map((c, i) => (
        <circle key={c} cx={14 + i * 12} cy="44" r="4" fill="none" stroke={c} strokeWidth="1.75" />
      ))}
      <rect x="56" y="8" width="16" height="16" rx="4" fill={p.paperRaised} stroke={p.rule} />
      <path d="M60.5 16.5l3 3 5-6" fill="none" stroke={p.ink} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ThemePicker({ value, onChange }: { value: ThemeName | 'system'; onChange: (v: ThemeName | 'system') => void }) {
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {THEMES.map((t) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(t.value)}
            className={cx('flex flex-col overflow-hidden rounded-control border text-left transition-colors duration-200', on ? 'border-ink bg-raised' : 'border-rule hover:bg-sunk')}
          >
            {t.value === 'system' ? (
              <div className="relative h-[72px] w-full overflow-hidden">
                <Page p={palettes.paper} className="absolute inset-0 h-full w-full" />
                <div className="absolute inset-0" style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}>
                  <Page p={palettes.carbon} className="h-full w-full" />
                </div>
              </div>
            ) : (
              <Page p={palettes[t.value]} className="h-[72px] w-full" />
            )}
            <span className="flex flex-col px-2.5 py-2">
              <span className="t-label flex items-center justify-between">
                {t.label}
                {on ? <Check size={14} strokeWidth={2.25} /> : null}
              </span>
              <span className="t-hint">{t.note}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

const PRESET_KEYS = Object.keys(WARMUP_PRESETS) as (keyof typeof WARMUP_PRESETS)[];

const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void patchSettings({ [key]: value } as Partial<AppSettings>);

export function SettingsScreen() {
  const s = useSettings();
  const [notif, setNotif] = useState<string | null>(null);
  const [exact, setExact] = useState(true);
  const android = platform().kind === 'android';
  useEffect(() => {
    void platform().canScheduleExactAlarms().then(setExact);
  }, []);
  return (
    <Screen title="Settings" backButton>
      <Section title="YOU">
        <Pad className="flex flex-col gap-2">
          <Field label="Your name" value={s.profile.name} onChange={(e) => set('profile', { ...s.profile, name: e.target.value.slice(0, 40) })} maxLength={40} autoComplete="given-name" placeholder="Only used to greet you" />
          <MarginNote>Analog never collects it. It only travels between your own devices if you turn on sync.</MarginNote>
        </Pad>
        {SURVEY_URL && s.survey ? <ToggleRow label="Share my welcome answers anonymously" hint="never your name or your training data; off deletes them" checked={s.shareSurvey} onChange={(v) => void setSharing(v)} /> : null}
        {INSTALL_URL ? <ToggleRow label="Count this install anonymously" hint="once, with a random id, your platform and the version; off deletes it" checked={s.shareInstall} onChange={(v) => void setCounting(v)} /> : null}
        <Pad className="flex flex-wrap gap-2 pt-3">
          <button type="button" className="btn-secondary" onClick={() => openOnboarding('survey')}>
            Retake the welcome questions
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              navigate({ name: 'today' });
              void startTour('main');
            }}
          >
            Take the tour again
          </button>
        </Pad>
      </Section>

      <Section title="UNITS AND EFFORT">
        <ChoiceRow label="Units">
          <Segmented label="Units" value={s.unit} onChange={(v) => set('unit', v)} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />
        </ChoiceRow>
        <ChoiceRow label="Effort">
          <Segmented label="Effort" value={s.effort} onChange={(v) => set('effort', v)} options={[{ value: 'rir', label: 'RIR' }, { value: 'rpe', label: 'RPE' }]} />
        </ChoiceRow>
      </Section>

      <Section title="LOOK">
        <Pad className="flex flex-col gap-2 py-3">
          <span>Theme</span>
          <ThemePicker value={s.theme} onChange={(v) => set('theme', v)} />
        </Pad>
        <ChoiceRow label="Muscle map">
          <Segmented label="Muscle map" value={s.bodyFigure} onChange={(v) => set('bodyFigure', v)} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
        </ChoiceRow>
        <ChoiceRow label="Clock">
          <Segmented label="Clock" value={s.clock} onChange={(v) => set('clock', v)} options={[{ value: '12h', label: '6:30 PM' }, { value: '24h', label: '18:30' }]} />
        </ChoiceRow>
      </Section>

      <Section title="REST TIMER">
        <ChoiceRow label="Default rest">
          <Segmented label="Default rest" value={String(s.defaultRestMs)} onChange={(v) => set('defaultRestMs', Number(v))} options={[60000, 90000, 120000, 180000].map((ms) => ({ value: String(ms), label: formatClock(ms) }))} />
        </ChoiceRow>
        <ToggleRow label="Rest-over sound" checked={s.restSound} onChange={(v) => set('restSound', v)} />
        <ToggleRow label="Haptics" checked={s.haptics} onChange={(v) => set('haptics', v)} />
        <ToggleRow label="Other sounds" hint="pencil tick on a set, plate clank on a PR" checked={s.otherSounds} onChange={(v) => set('otherSounds', v)} />
        <ToggleRow label="Keep the screen on during workouts" checked={s.keepAwake} onChange={(v) => set('keepAwake', v)} />
        {android ? (
          <Pad className="flex flex-col gap-2 py-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={async () => {
                const ok = await platform().requestNotificationPermission();
                setNotif(ok ? 'Allowed. The rest countdown shows on the lock screen.' : 'Not allowed. The timer still works in the app.');
              }}
            >
              Allow lock-screen notifications
            </button>
            {notif ? <p className="text-ink2">{notif}</p> : null}
            {!exact ? (
              <>
                <MarginNote>Exact alarms are off, so the rest-over alert can arrive a few seconds late with the screen locked.</MarginNote>
                <button type="button" className="btn-ghost" onClick={() => void platform().openExactAlarmSettings()}>
                  Allow exact alarms
                </button>
              </>
            ) : null}
          </Pad>
        ) : null}
      </Section>

      <Section title="WARM-UPS">
        <ChoiceRow label="Add warm-ups" hint={s.warmupRamp.map((x) => `${Math.round(x.pct * 100)}% × ${x.reps}`).join(', ') + (s.warmupBar ? ', after an empty-bar set' : '')}>
          <Segmented<string>
            label="Warm-up amount"
            value={PRESET_KEYS.find((k) => WARMUP_PRESETS[k].bar === s.warmupBar && JSON.stringify(WARMUP_PRESETS[k].ramp) === JSON.stringify(s.warmupRamp)) ?? ''}
            onChange={(k) => {
              const preset = WARMUP_PRESETS[k as keyof typeof WARMUP_PRESETS];
              void patchSettings({ warmupRamp: [...preset.ramp], warmupBar: preset.bar });
            }}
            options={PRESET_KEYS.map((k) => ({ value: k, label: WARMUP_PRESETS[k].label }))}
          />
        </ChoiceRow>
      </Section>

      <Section title="TIMED HOLDS (AMTAP)">
        <ToggleRow label="3-2-1 countdown before starting" checked={s.holdCountdown} onChange={(v) => set('holdCountdown', v)} />
        <ToggleRow label="Cue at target and at your best" checked={s.holdCues} onChange={(v) => set('holdCues', v)} />
        <ToggleRow label="Show hundredths" checked={s.holdHundredths} onChange={(v) => set('holdHundredths', v)} />
      </Section>

      <Section title="PROGRESSION">
        <ChoiceRow label="Biggest jump between sessions">
          <Segmented label="Jump cap" value={String(s.maxJumpPct)} onChange={(v) => set('maxJumpPct', Number(v))} options={[{ value: '0.05', label: '5%' }, { value: '0.1', label: '10%' }, { value: '0.2', label: '20%' }]} />
        </ChoiceRow>
      </Section>

      <Section title="UPDATES">
        <ToggleRow label="Check for new releases once a day" hint="asks GitHub for the newest version; sends nothing about you" checked={s.checkUpdates} onChange={(v) => set('checkUpdates', v)} />
        <Pad className="py-2">
          <button type="button" className="btn-ghost" onClick={() => navigate({ name: 'devlog' })}>
            Dev log
          </button>
        </Pad>
      </Section>

      <Section title="SUPPORT ANALOG">
        <Pad className="py-2">
          <SupportButton />
        </Pad>
      </Section>

      <Section title="BACKUP REMINDER">
        <ChoiceRow label="Remind me after">
          <Segmented label="Backup reminder" value={String(s.backupReminderDays)} onChange={(v) => set('backupReminderDays', Number(v))} options={[{ value: '7', label: '7 days' }, { value: '14', label: '14 days' }, { value: '30', label: '30 days' }, { value: '36500', label: 'Never' }]} />
        </ChoiceRow>
      </Section>
    </Screen>
  );
}
