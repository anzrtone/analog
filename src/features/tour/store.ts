// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { clip } from '@/features/onboarding/logic';
import { fill, fillTarget, needsUnmade, SAMPLE_SCREENS, TOURS, type MakeKind, type Made, type TourScreen, type TourStep } from './script';

// The running tour: a module-level store (subscribe + snapshot, for useSyncExternalStore) that the overlay at the
// app root draws. Everything the tour does to the app goes through `TourHost`, so the Node tests can drive it.

export interface TourHost {
  go: (screen: TourScreen) => void;
  /** Build the throwaway sample database. Called once, before the first step. */
  prepareSample: () => Promise<void> | void;
  /** Point the data layer at the sample (true) or back at the user's own data (false). */
  showSample: (on: boolean) => void;
  discardSample: () => void;
  makeProgram: (name: string) => Promise<{ id: string; name: string }> | { id: string; name: string };
  makeDay: (programId: string, name: string) => Promise<{ id: string; name: string }> | { id: string; name: string };
  /** [program name, day name] to pre-fill make steps. */
  suggestion: () => [string, string];
  userName: () => string;
  /** The tour finished or was skipped. */
  onEnd: (tourId: string) => void;
}

export interface TourView {
  tourId: string;
  index: number;
  count: number;
  /** Which way the user was going, for skipping steps that can't be shown. */
  dir: 1 | -1;
  step: TourStep;
  text: string;
  target: string | null;
  /** Pre-filled name on a make step. */
  suggestion: string | null;
  chapter: string;
  last: boolean;
}

interface State {
  tourId: string;
  index: number;
  dir: 1 | -1;
  made: Made;
}

let host: TourHost | null = null;
let state: State | null = null;
let view: TourView | null = null;
let sampleOn = false;
const listeners = new Set<() => void>();

export function setTourHost(h: TourHost | null): void {
  host = h;
}

export function subscribeTour(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function tourSnapshot(): TourView | null {
  return view;
}

export function tourMade(): Made {
  return state?.made ?? {};
}

function emit() {
  if (!state || !host) view = null;
  else {
    const script = TOURS[state.tourId]!;
    const step = script.steps[state.index]!;
    const [program, day] = host.suggestion();
    view = {
      tourId: state.tourId,
      index: state.index,
      count: script.steps.length,
      dir: state.dir,
      step,
      text: fill(step.text, host.userName(), state.made),
      target: fillTarget(step.target, state.made),
      suggestion: step.make === 'program' ? program : step.make === 'day' ? day : null,
      chapter: step.chapter ?? step.screen,
      last: state.index === script.steps.length - 1,
    };
  }
  for (const fn of listeners) fn();
}

function setSample(on: boolean) {
  if (on === sampleOn || !host) return;
  sampleOn = on;
  host.showSample(on);
}

/** Land on the first showable step from `from`, travelling `dir`. Backing up past the start turns around. */
function settle(from: number, dir: 1 | -1): void {
  if (!state || !host) return;
  const steps = TOURS[state.tourId]!.steps;
  let i = from;
  let d = dir;
  for (let guard = 0; guard <= steps.length * 2; guard++) {
    if (i < 0) {
      i = 0;
      d = 1;
    }
    if (i >= steps.length) return endTour();
    const step = steps[i]!;
    // A make step that's done already is passed over, so nothing is made twice.
    const skip = needsUnmade(step, state.made) || (step.make != null && state.made[step.make] != null);
    if (!skip) {
      state = { ...state, index: i, dir: d };
      // Navigate first, then swap the data: the screen being left has lost focus by then, so it keeps what it
      // showed on its way out instead of re-reading the other database (React renders both changes together).
      host.go(step.screen);
      setSample(SAMPLE_SCREENS.includes(step.screen));
      emit();
      return;
    }
    i += d;
  }
  endTour();
}

export async function startTour(tourId = 'main'): Promise<void> {
  if (!host || !TOURS[tourId] || state) return;
  await host.prepareSample();
  state = { tourId, index: 0, dir: 1, made: {} };
  settle(0, 1);
}

export function nextStep(): void {
  if (!state) return;
  if (state.index === TOURS[state.tourId]!.steps.length - 1) return endTour();
  settle(state.index + 1, 1);
}

export function prevStep(): void {
  if (state) settle(state.index - 1, -1);
}

/** The overlay couldn't find the step's target in time: move on in the direction the user was going. */
export function skipUnreachable(): void {
  if (state) settle(state.index + state.dir, state.dir);
}

/** Make step: create the thing (an empty name takes the suggestion), then move on. */
export async function makeStep(name: string): Promise<void> {
  if (!state || !host || !view) return;
  const kind: MakeKind | undefined = view.step.make;
  if (!kind) return;
  const n = clip(name, 40) || view.suggestion || '';
  const made = await (kind === 'program' ? host.makeProgram(n) : host.makeDay(state.made.program!.id, n));
  if (!state) return;
  state = { ...state, made: { ...state.made, [kind]: made } };
  nextStep();
}

export function endTour(): void {
  if (!state || !host) return;
  const { tourId } = state;
  state = null;
  emit();
  // Home first, then back to the user's data (see settle).
  host.onEnd(tourId);
  setSample(false);
  host.discardSample();
}

export function tourActive(): boolean {
  return state != null;
}
