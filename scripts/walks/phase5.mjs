// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
// Phase 5 walk: programs, history, stats, share cards, program links, at 1300 and 390 in both themes.
const OUT = 'D:/Programming Projects/analog-next/docs/screenshots';
const nav = (b, r) => b.eval(`window.analog.navigate(${JSON.stringify(r)}); return true`).then(() => b.sleep(900));

async function setTheme(b, theme) {
  await b.eval(`await window.analog.db.settings.put({ key: 'theme', value: '${theme}' }); return true`);
  await b.goto();
}

export default async function (b) {
  await b.goto();
  // Sample history (the tour's sample) and a running adaptive program.
  const n = await b.eval(`
    const db = window.analog.db;
    if ((await db.workouts.count()) === 0) {
      const { buildSample } = await import('/src/features/tour/sample.ts');
      const seed = (await import('/src/assets/seed.json')).default;
      await buildSample(db, seed.exercises.map(({ checked, ...e }) => e));
      await db.workouts.filter((w) => w.endedAt == null).delete();
      const { TEMPLATES } = await import('/src/services/templates.ts');
      const { saveProgram, startRun } = await import('/src/db/repos.ts');
      const p = TEMPLATES[1].build();
      await saveProgram(db, p);
      await startRun(db, p.id);
      await db.settings.bulkPut([{ key: 'onboarded', value: true }, { key: 'onboardingVersion', value: 1 }]);
    }
    return db.workouts.count();`);
  console.log('workouts', n);

  for (const theme of ['paper', 'carbon']) {
    await setTheme(b, theme);
    for (const [w, h, tag] of [[1300, 820, 'wide'], [390, 780, 'phone']]) {
      await b.size(w, h);
      const p = `${OUT}/p5-${tag}-${theme}`;
      await nav(b, { name: 'today' });
      await b.shot(`${p}-01-today-program.jpg`);
      await nav(b, { name: 'programs' });
      await b.shot(`${p}-02-programs.jpg`, true);
      const progId = await b.eval(`(await window.analog.db.programs.toArray())[0].id`);
      await nav(b, { name: 'program', id: progId });
      await b.shot(`${p}-03-builder.jpg`, true);
      await nav(b, { name: 'programShare', id: progId });
      await b.shot(`${p}-04-program-share.jpg`);
      await nav(b, { name: 'history' });
      await b.shot(`${p}-05-history.jpg`);
      const wid = await b.eval(`(await window.analog.db.workouts.orderBy('startedAt').reverse().first()).id`);
      if (tag === 'phone') {
        await nav(b, { name: 'workoutDetail', id: wid });
        await b.shot(`${p}-06-workout-detail.jpg`);
      }
      await nav(b, { name: 'stats' });
      await b.shot(`${p}-07-stats.jpg`, true);
      await nav(b, { name: 'share', kind: 'workout', id: wid });
      await b.sleep(1500);
      await b.shot(`${p}-08-share-workout.jpg`);
      const prId = await b.eval(`(await window.analog.db.prs.orderBy('createdAt').reverse().first()).id`);
      await nav(b, { name: 'share', kind: 'pr', id: prId });
      await b.sleep(1500);
      await b.shot(`${p}-09-share-pr.jpg`);
      await nav(b, { name: 'share', kind: 'program', id: progId });
      await b.sleep(1500);
      await b.shot(`${p}-10-share-program.jpg`);
      await nav(b, { name: 'mesoReport' });
      await b.shot(`${p}-11-meso-report.jpg`);
    }
  }
  // A program link opens as a new copy.
  const link = await b.eval(`
    const { programLink } = await import('/src/engine/programs/share.ts');
    const p = (await window.analog.db.programs.toArray())[0];
    return programLink({ program: p.data, exercises: [] });`);
  const before = await b.eval(`window.analog.db.programs.count()`);
  await nav(b, { name: 'programImport', data: link.split('d=')[1] });
  await b.sleep(1000);
  const after = await b.eval(`window.analog.db.programs.count()`);
  console.log('program link import: programs', before, '->', after, (await b.text()).slice(0, 60).replace(/\n/g, ' | '));
  await b.shot(`${OUT}/p5-phone-carbon-12-program-from-link.jpg`);
  // Tick through a program day to check the engine wiring end to end.
  await nav(b, { name: 'today' });
  await b.click('Start Upper A');
  await b.sleep(1000);
  console.log('started', (await b.text()).slice(0, 120).replace(/\n/g, ' | '));
}
