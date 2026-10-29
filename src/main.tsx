// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/index.css';
import seedFile from '@/assets/seed.json';
import { syncSeed, type SeedExercise } from '@/db/exercises';
import { ensureDefaultGym } from '@/db/repos';
import { db, requestPersistence } from '@/db/schema';
import { patchSettings, settings, watchSettings } from '@/db/settings';
import { runAutoBackup } from '@/features/autoBackup';
import { handleBack } from '@/features/back';
import { navigate } from '@/features/nav';
import { applyNativeAction, applyNativeActions } from '@/features/workout/timers';
import { loadPlatform } from '@/platform';
import { App } from './App';

/** The bundled exercise library, refreshed when a release ships a newer one. Overrides and custom exercises stay. */
async function syncLibrary() {
  const seed = seedFile as unknown as { version: number; exercises: (SeedExercise & { checked?: boolean })[] };
  if (settings().seedVersion >= seed.version && (await db.exercises.count()) > 0) return;
  await syncSeed(db, seed.exercises.map(({ checked: _checked, ...e }) => e));
  await patchSettings({ seedVersion: seed.version });
}

async function boot() {
  const p = await loadPlatform();
  // Screens read settings from memory from their first frame, never the defaults.
  await watchSettings();
  void requestPersistence();
  await syncLibrary();
  const gym = await ensureDefaultGym(db, settings().unit);
  if (!settings().defaultGymId) await patchSettings({ defaultGymId: gym.id });

  await p.init({
    onTimerAction: applyNativeAction,
    onResume: () => void applyNativeActions(),
    onBack: handleBack,
    onDeepLink: (url) => {
      const d = /[?&]d=([^&]+)/.exec(url)?.[1];
      if (url.startsWith('analog://program') && d) navigate({ name: 'programImport', data: decodeURIComponent(d) });
    },
  });
  void applyNativeActions();
  // A full backup at launch when today's isn't written yet (and there is something to keep).
  void runAutoBackup(db, p, 'launch');

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

boot().catch((err) => {
  console.error(err);
  const root = document.getElementById('root')!;
  root.textContent = '';
  const box = Object.assign(document.createElement('div'), { style: 'font-family:Inter,sans-serif;padding:24px;background:#17181C;color:#ECE6D8;height:100%' });
  box.textContent = `Analog couldn't open its database: ${String(err?.message ?? err)}. Your data hasn't been touched. Please report this on GitHub.`;
  root.appendChild(box);
});
