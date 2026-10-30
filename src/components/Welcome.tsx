// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { BicepsFlexed, Check, ChevronRight, Dumbbell, Gift, HeartPulse, Lightbulb, ListChecks, MessagesSquare, NotebookPen, PenLine, RotateCcw, Search, Share2, ShieldCheck, Smartphone, Store, TvMinimalPlay, Users, Volleyball, WifiOff } from 'lucide-react';
import { PRIVACY_URL, SURVEY_URL } from '@/config';
import { settings } from '@/db/settings';
import { formatWeight } from '@/engine/math/units';
import { HEALTH_DISCLAIMER } from '@/features/copy';
import { answeredAny, HEARD, PAGES, toSurvey, USES, type OnboardingMode, type Option, type OptionIcon, type PageId, type WizardResult } from '@/features/onboarding/logic';
import { finishOnboarding, onboarding, surveyEnv } from '@/features/onboarding/store';
import { surveyPayload } from '@/features/onboarding/survey';
import { openLink } from '@/platform';
import { Stamp } from './Brand';
import { PlateRing } from './PlateRing';
import { CheckDot } from './SetRow';
import { cx, MarginNote, Segmented, useBackClose } from './ui';

// The first-run welcome: one question per page, every one skippable. Answers stay on the device unless the user
// opts in to sharing them (and only if Analog has somewhere to send them: SURVEY_URL, null as shipped).

type Icon = ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string }>;

const ICONS: Record<OptionIcon, Icon> = {
  dumbbell: Dumbbell,
  biceps: BicepsFlexed,
  heart: HeartPulse,
  list: ListChecks,
  notebook: NotebookPen,
  sport: Volleyball,
  restart: RotateCcw,
  pen: PenLine,
  users: Users,
  phone: Smartphone,
  reddit: MessagesSquare,
  video: TvMinimalPlay,
  search: Search,
  store: Store,
  share: Share2,
};

/** Mounted once at the root; draws the wizard while one is open. */
export function OnboardingHost() {
  const mode = onboarding.use();
  return mode ? <Wizard key={mode} mode={mode} /> : null;
}

function Wizard({ mode }: { mode: OnboardingMode }) {
  // Read once: the wizard edits its own copy and saves everything at the end.
  const [s] = useState(settings);
  const pages = PAGES[mode];
  const retake = mode !== 'full';
  const [nav, setNav] = useState<{ i: number; dir: 1 | -1 }>({ i: 0, dir: 1 });
  const [name, setName] = useState(retake ? s.profile.name : '');
  const [uses, setUses] = useState<string[]>(retake ? (s.survey?.uses ?? []) : []);
  const [usesOther, setUsesOther] = useState(retake ? (s.survey?.usesOther ?? '') : '');
  const [heard, setHeard] = useState<string | null>(retake ? (s.survey?.heardFrom ?? null) : null);
  const [heardOther, setHeardOther] = useState(retake ? (s.survey?.heardOther ?? '') : '');
  const [share, setShare] = useState(retake ? s.shareSurvey : false);
  const [unit, setUnit] = useState(s.unit);
  const [effort, setEffort] = useState(s.effort);
  const busy = useRef(false);

  const { i, dir } = nav;
  const page = pages[i]!;
  const last = i === pages.length - 1;
  const result = (): WizardResult => ({
    name: pages.includes('name') ? name : null,
    uses,
    usesOther,
    heardFrom: heard,
    heardOther,
    share,
    ...(pages.includes('setup') ? { unit, effort } : {}),
  });
  const done = (r: WizardResult) => {
    // Guard the final tap: a double tap must not save (or add starter programs) twice.
    if (busy.current) return;
    busy.current = true;
    void finishOnboarding(mode, r);
  };
  const empty: WizardResult = { name: null, uses: [], usesOther: '', heardFrom: null, heardOther: '', share: s.shareSurvey, skipped: true };
  // "Skip all" on a first install, "Close" otherwise. Closing the returning flow still counts as done, so it never nags.
  const dismiss = () => (mode === 'survey' ? onboarding.set(null) : done(empty));
  const next = () => (last ? done(result()) : setNav({ i: i + 1, dir: 1 }));
  const back = () => {
    if (i > 0) setNav({ i: i - 1, dir: -1 });
    else if (mode !== 'full') dismiss();
  };
  useBackClose(true, back);

  const unanswered = (page === 'name' && !name.trim()) || (page === 'uses' && !uses.length) || (page === 'heard' && !heard);
  const primary = page === 'hello' ? 'Get started' : last ? (mode === 'full' ? 'Let’s go' : mode === 'survey' ? 'Save' : 'Done') : unanswered ? 'Skip for now' : 'Next';

  const body: Record<PageId, () => ReactNode> = {
    hello: () => <Hello />,
    name: () => <NamePage returning={mode === 'returning'} value={name} onChange={setName} onSubmit={next} />,
    uses: () => (
      <Choices
        title="What will you use Analog for?"
        hint={mode === 'full' ? 'Pick any. Your picks add matching starter programs, which you can change or delete.' : 'Pick any. Nothing in your log changes.'}
        options={USES}
        picked={uses}
        onToggle={(id) => setUses((u) => (u.includes(id) ? u.filter((x) => x !== id) : [...u, id]))}
        other={usesOther}
        onOther={setUsesOther}
        otherLabel="What else?"
      />
    ),
    heard: () => (
      <Choices
        title="Where did you hear about Analog?"
        hint={SURVEY_URL ? 'Analog has no ads, so this helps a lot.' : 'Analog has no ads, so word of mouth is everything.'}
        options={HEARD}
        picked={heard ? [heard] : []}
        onToggle={(id) => setHeard((h) => (h === id ? null : id))}
        other={heardOther}
        onOther={setHeardOther}
        otherLabel="Where?"
      />
    ),
    setup: () => <Setup unit={unit} effort={effort} onUnit={setUnit} onEffort={setEffort} />,
    consent: () => <Consent result={result()} installId={s.installId} share={share} onShare={setShare} />,
  };

  return (
    <div className={cx('fixed inset-0 z-[55] flex items-center justify-center p-4', mode === 'full' ? 'bg-paper' : 'bg-scrim/55')}>
      <div role="dialog" aria-modal="true" aria-label="Welcome to Analog" className="flex max-h-full w-full max-w-[520px] animate-card-in flex-col overflow-hidden rounded-sheet border border-rule bg-raised">
        <div className="flex justify-end px-2 pt-2">
          <button type="button" className="btn-ghost btn-compact" onClick={dismiss}>
            {mode === 'full' ? 'Skip all' : 'Close'}
          </button>
        </div>
        <div className="overflow-y-auto px-6 pb-2">
          {/* Keeps the card from jumping between short and tall pages. */}
          <div key={i} className={cx('flex min-h-[180px] flex-col gap-3', dir === 1 ? 'animate-page-in' : 'animate-fade-in')}>
            {body[page]()}
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-rule px-4 py-3">
          <button type="button" className={cx('btn-ghost btn-compact', i === 0 && 'invisible')} onClick={back} disabled={i === 0} aria-hidden={i === 0}>
            Back
          </button>
          <Dots count={pages.length} at={i} />
          <button type="button" className={cx(unanswered ? 'btn-secondary' : 'btn-primary', 'btn-compact')} onClick={next}>
            {primary}
          </button>
        </div>
        {mode === 'full' ? (
          <p className="px-6 pb-3.5 text-center text-[12px] leading-[17px] text-pencil">
            By using Analog you agree to the{' '}
            <button type="button" className="text-ink2 underline" onClick={() => void openLink(PRIVACY_URL)}>
              Terms & Privacy
            </button>
            . You must be 13 or older.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Current dot wider and solid ink, past dots tinted, future dots neutral. */
function Dots({ count, at }: { count: number; at: number }) {
  return (
    <div className="flex flex-1 items-center justify-center gap-1.5" role="progressbar" aria-label={`Page ${at + 1} of ${count}`} aria-valuenow={at + 1} aria-valuemax={count}>
      {Array.from({ length: count }, (_, k) => (
        <span key={k} className={cx('h-1.5 rounded-full transition-all duration-200', k === at ? 'w-[18px] bg-ink' : k < at ? 'w-1.5 bg-ink2/50' : 'w-1.5 bg-rule')} />
      ))}
    </div>
  );
}

function Title({ children, hint }: { children: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="t-title-l">{children}</h1>
      {hint ? <p className="text-ink2">{hint}</p> : null}
    </div>
  );
}

function Hello() {
  const props: [Icon, string][] = [
    [WifiOff, 'Offline and yours. Everything stays on this device.'],
    [Gift, 'Free for good. No ads, no account, nothing paywalled.'],
    [Lightbulb, 'Every suggested weight shows the reason behind it.'],
  ];
  return (
    <>
      <Title hint="A paper training log that does the maths: write down what you lift and see what to do next.">Welcome to Analog</Title>
      <div className="flex flex-col gap-2.5 pt-1">
        {props.map(([I, line]) => (
          <p key={line} className="flex items-center gap-3">
            <I size={20} strokeWidth={1.75} className="shrink-0 text-ink" />
            <span className="flex-1">{line}</span>
          </p>
        ))}
      </div>
    </>
  );
}

function NamePage({ returning, value, onChange, onSubmit }: { returning: boolean; value: string; onChange: (v: string) => void; onSubmit: () => void }) {
  return (
    <>
      <Title hint="Only used to greet you. It never leaves this device.">{returning ? 'Can I ask your name?' : 'What’s your name?'}</Title>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <input className="field min-h-14 text-[20px]" value={value} onChange={(e) => onChange(e.target.value)} autoFocus maxLength={40} autoComplete="given-name" autoCapitalize="words" enterKeyHint="next" aria-label="Your name" />
      </form>
      <MarginNote>A nickname is perfect. You can change it in Settings.</MarginNote>
    </>
  );
}

function Choices({ title, hint, options, picked, onToggle, other, onOther, otherLabel }: { title: string; hint: string; options: Option[]; picked: string[]; onToggle: (id: string) => void; other: string; onOther: (v: string) => void; otherLabel: string }) {
  return (
    <>
      <Title hint={hint}>{title}</Title>
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        {options.map((o, k) => (
          <OptionChip key={o.id} option={o} on={picked.includes(o.id)} tilt={k % 2 ? 1 : -1} onClick={() => onToggle(o.id)} />
        ))}
      </div>
      {picked.includes('other') ? <input className="field" value={other} onChange={(e) => onOther(e.target.value)} placeholder={otherLabel} aria-label={otherLabel} autoFocus maxLength={80} /> : null}
    </>
  );
}

function OptionChip({ option, on, tilt, onClick }: { option: Option; on: boolean; tilt: number; onClick: () => void }) {
  const I = ICONS[option.icon];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cx('flex min-h-touch items-center gap-2.5 rounded-control border px-3 py-2 text-left transition-[transform,background-color,border-color] duration-200', on ? 'border-ink bg-paper' : 'border-rule hover:bg-sunk')}
      style={{ transform: on ? `rotate(${tilt}deg)` : undefined }}
    >
      <I size={18} strokeWidth={1.75} className={on ? 'text-ink' : 'text-ink2'} />
      <span className={cx('t-label flex-1', on ? 'text-ink' : 'text-ink2')}>{option.label}</span>
      {on ? <Check size={16} strokeWidth={2.25} className="text-ink" /> : null}
    </button>
  );
}

function Setup({ unit, effort, onUnit, onEffort }: { unit: 'kg' | 'lb'; effort: 'rir' | 'rpe'; onUnit: (v: 'kg' | 'lb') => void; onEffort: (v: 'rir' | 'rpe') => void }) {
  return (
    <>
      <Title hint="Both can change any time in Settings.">Set up your log</Title>
      <Segmented label="Units" value={unit} onChange={onUnit} options={[{ value: 'kg', label: 'Kilograms' }, { value: 'lb', label: 'Pounds' }]} />
      <Segmented label="Effort scale" value={effort} onChange={onEffort} options={[{ value: 'rir', label: 'Reps in reserve' }, { value: 'rpe', label: 'RPE' }]} />
      <MarginNote>RIR: how many more reps you could have done. RPE 8 ≈ 2 RIR.</MarginNote>
      <SetDemo unit={unit} effort={effort} />
      <MarginNote>{HEALTH_DISCLAIMER}</MarginNote>
    </>
  );
}

const DEMO_MS = 6500;
/** When each beat lands, from the start of a loop: target confirmed, set ticked, PR stamp, next-time note, fade out. */
const BEATS = [700, 1500, 2100, 2900, 5900];

/**
 * Analog's best idea in a few seconds, on a loop: the engine's target (pencil, dashed) is confirmed in ink, the set is
 * ticked and its ring closes, it beats last time so the PR stamp lands, and next time's weight arrives with its reason.
 */
function SetDemo({ unit, effort }: { unit: 'kg' | 'lb'; effort: 'rir' | 'rpe' }) {
  const [beat, setBeat] = useState(0);
  const [loop, setLoop] = useState(0);
  useEffect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    const play = () => {
      setBeat(0);
      setLoop((l) => l + 1);
      timers = BEATS.map((t, i) => setTimeout(() => setBeat(i + 1), t));
    };
    play();
    const every = setInterval(play, DEMO_MS);
    return () => {
      clearInterval(every);
      timers.forEach(clearTimeout);
    };
  }, []);
  const done = beat >= 2;
  const g = unit === 'kg' ? 60000 : 61235;
  const prevG = unit === 'kg' ? 57500 : 58967;
  const step = unit === 'kg' ? '2.5 kg' : '5 lb';
  const how = effort === 'rir' ? '2 RIR' : 'RPE 8';
  const today = `${formatWeight(g, unit)} × 8`;
  const before = `${formatWeight(prevG, unit)} × 8`;
  return (
    <div
      className="rounded-control border border-dashed border-rule p-3"
      role="img"
      aria-label={`Example: last time ${before}. Today's ${today} is ticked, beats it for a new PR, and Analog suggests adding ${step} next time because you hit 3 × 8 at ${how}.`}
    >
      <div className={cx('flex flex-col gap-2 transition-opacity duration-300', beat >= 5 && 'opacity-0')}>
        <p className="t-meta text-pencil">EXAMPLE · BENCH PRESS</p>
        <div className="flex items-center gap-3">
          <span className={cx('transition-transform duration-200', done && 'scale-110')}>
            <PlateRing key={`${loop}-${done}`} color="ink" state={done ? 'done' : 'pending'} letter="3" />
          </span>
          <span className="t-num-m w-[72px] text-[13px] text-pencil">{before}</span>
          <span className="flex-1">
            <span className={cx('t-num-m transition-colors duration-200', beat >= 1 ? 'text-ink' : 'border-b border-dashed border-pencil text-pencil')}>{today}</span>
          </span>
          <CheckDot done={done} color="rgb(var(--ink))" />
        </div>
        <div className="flex min-h-7 items-center gap-2">
          {beat >= 3 ? (
            <>
              <Stamp kind="PR" />
              <span className="t-label animate-fade-in text-red-text">{`New PR: ${today} (prev ${before})`}</span>
            </>
          ) : null}
        </div>
        <div className={cx('transition-[opacity,transform] duration-200', beat >= 4 ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0')}>
          <MarginNote>
            +{step} next time · hit 3 × 8 at {how}
          </MarginNote>
        </div>
      </div>
    </div>
  );
}

function Consent({ result, installId, share, onShare }: { result: WizardResult; installId: string | null; share: boolean; onShare: (v: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [now] = useState(Date.now);
  if (!answeredAny(result)) return <Title hint="You skipped the questions, so there’s nothing to share. You can answer them later in Settings.">All set.</Title>;
  if (!SURVEY_URL) return <Title hint="Your answers stay on this device: Analog has no servers, so they’re never sent anywhere. You can change them later in Settings.">All set.</Title>;
  const preview = JSON.stringify(surveyPayload(installId ?? 'a random id, made when you turn this on', toSurvey(result, now), surveyEnv()), null, 2);
  return (
    <>
      <Title hint="Analog is made by volunteers. Knowing who uses it and how they found it helps decide what to build next.">Help Analog grow?</Title>
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-[160px] flex-1">Share my answers anonymously</span>
        <Segmented label="Share my answers anonymously" value={share ? 'on' : 'off'} onChange={(v) => onShare(v === 'on')} options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
      </div>
      {['Never your name or your training data.', 'Turn it off in Settings and your answers are deleted.'].map((line) => (
        <p key={line} className="flex items-center gap-2.5 text-ink2">
          <ShieldCheck size={18} strokeWidth={1.75} className="text-ink" /> {line}
        </p>
      ))}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="t-label flex min-h-10 items-center gap-1.5 text-ink2">
        <ChevronRight size={16} strokeWidth={1.75} className={cx('transition-transform', open && 'rotate-90')} /> See exactly what gets sent
      </button>
      {open ? <pre className="t-num-m select-text whitespace-pre-wrap rounded-control bg-sunk p-3 text-[12px] leading-[17px] text-ink2">{preview}</pre> : null}
    </>
  );
}
