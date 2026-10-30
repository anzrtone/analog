// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
// Phase 7 walk: a fresh install at 390 and 1300 px in Carbon and Paper, through the welcome questions and the whole
// guided tour, checking that the tour's sample never reaches the user's database.

const OUT = 'D:/Programming Projects/analog-next/docs/screenshots';

async function freshInstall(b, theme) {
  await b.goto();
  await b.eval(`for (const name of ['analog', 'analog-tour-sample']) await new Promise((r) => { const q = indexedDB.deleteDatabase(name); q.onsuccess = q.onerror = q.onblocked = r; }); return true`);
  await b.goto();
  if (theme === 'paper') {
    await b.eval(`await window.analog.db.settings.put({ key: 'theme', value: 'paper' }); return true`);
    await b.goto();
  }
}

/** Press a button inside the tour note by its exact text. */
const tourButton = (b, label) => b.eval(`const btn = [...document.querySelectorAll('[aria-label="Tour"] button')].find((x) => x.innerText.trim() === ${JSON.stringify(label)}); if (!btn) return false; btn.click(); return true`);

const userCounts = (b) => b.eval(`const d = window.analog.db; return JSON.stringify({ workouts: await d.workouts.count(), sets: await d.workoutSets.count(), programs: (await d.programs.toArray()).map((p) => p.name) })`);

export default async function (b) {
  for (const theme of ['carbon', 'paper']) {
    for (const [w, h, tag] of [[390, 780, 'phone'], [1300, 820, 'wide']]) {
      await b.size(w, h);
      await freshInstall(b, theme);
      const p = `${OUT}/p7-${tag}-${theme}`;
      await b.shot(`${p}-01-hello.jpg`);
      await b.click('Get started');
      await b.type('Sam');
      await b.shot(`${p}-02-name.jpg`);
      await b.click('Next');
      await b.click('Build muscle');
      await b.shot(`${p}-03-uses.jpg`);
      await b.click('Next');
      await b.click('Reddit');
      await b.click('Next');
      await b.sleep(2200); // the set demo plays its beats
      await b.shot(`${p}-04-setup.jpg`);
      await b.click('Next');
      await b.shot(`${p}-05-consent.jpg`);
      await b.click('Let’s go');
      await b.sleep(2500);
      console.log(tag, theme, 'after welcome', await userCounts(b));

      // The tour: step through, making the program and its day on the way.
      let step = 0;
      for (let guard = 0; guard < 40; guard++) {
        const state = await b.eval(`const d = document.querySelector('[aria-label="Tour"]'); if (!d) return null; return d.innerText`);
        if (!state) break;
        step++;
        if ([1, 4, 6, 10, 13, 14, 16, 17, 20, 22].includes(step)) await b.shot(`${p}-t${String(step).padStart(2, '0')}.jpg`);
        if (state.includes('Make program')) await tourButton(b, 'Make program');
        else if (state.includes('Make day')) await tourButton(b, 'Make day');
        else if (state.includes('Start logging')) await tourButton(b, 'Start logging');
        else {
          // While the sample workout is shown, tick its next set: it must change the sample, not the user's data.
          if (state.includes('Tick the set')) await b.eval(`document.querySelector('[data-tour="set-tick"]')?.click(); return true`);
          await tourButton(b, 'Next');
        }
        await b.sleep(900);
      }
      const after = await userCounts(b);
      await b.sleep(500);
      const sampleLeft = await b.eval(`(await indexedDB.databases()).map((x) => x.name).join(',')`);
      console.log(tag, theme, 'tour steps', step, 'after tour', after, 'databases', sampleLeft);
      await b.shot(`${p}-06-after-tour.jpg`);
    }
  }
}
