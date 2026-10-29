// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
// Phase 6 walk: everything under More, at 1300 and 390 px in both themes. Loads the admin demo history first.
import { readFileSync } from 'node:fs';

const OUT = 'D:/Programming Projects/analog-next/docs/screenshots';
const nav = (b, r) => b.eval(`window.analog.navigate(${JSON.stringify(r)}); return true`).then(() => b.sleep(900));
const strong = readFileSync(new URL('../../src/engine/import/fixtures/strong.csv', import.meta.url), 'utf8');

export default async function (b) {
  await b.size(1300, 820);
  await b.goto();
  console.log(await b.eval(`const { loadDemo, dataCounts } = await import('/src/dev/admin.ts'); await loadDemo(); return JSON.stringify(await dataCounts());`));
  const benchId = 'Barbell_Bench_Press_-_Medium_Grip';

  for (const theme of ['paper', 'carbon']) {
    await b.eval(`await window.analog.db.settings.put({ key: 'theme', value: '${theme}' }); return true`);
    await b.goto();
    for (const [w, h, tag] of [[1300, 820, 'wide'], [390, 780, 'phone']]) {
      await b.size(w, h);
      const p = `${OUT}/p6-${tag}-${theme}`;
      await nav(b, { name: 'more' });
      await b.shot(`${p}-01-more.jpg`);
      await nav(b, { name: 'exercises' });
      await b.shot(`${p}-02-library.jpg`);
      await nav(b, { name: 'exercise', id: benchId });
      await b.shot(`${p}-03-exercise.jpg`, true);
      await nav(b, { name: 'exerciseEdit', id: benchId });
      await b.shot(`${p}-04-exercise-edit.jpg`, true);
      await nav(b, { name: 'gyms' });
      await b.shot(`${p}-05-gyms.jpg`, true);
      const gym = await b.eval(`(await window.analog.db.gyms.toArray())[0].id`);
      await nav(b, { name: 'gym', id: gym });
      await b.shot(`${p}-06-gym.jpg`);
      await nav(b, { name: 'measurements' });
      await b.shot(`${p}-07-measurements.jpg`);
      await nav(b, { name: 'backup' });
      await b.shot(`${p}-08-backup.jpg`, true);
      await nav(b, { name: 'settings' });
      await b.shot(`${p}-09-settings.jpg`, true);
      await nav(b, { name: 'about' });
      await b.shot(`${p}-10-about.jpg`);
      await nav(b, { name: 'devlog' });
      await b.shot(`${p}-11-devlog.jpg`, true);
      await nav(b, { name: 'admin' });
      await b.shot(`${p}-12-admin.jpg`);
      await nav(b, { name: 'kitchen' });
      await b.shot(`${p}-13-kitchen.jpg`, true);
    }
  }

  // Strong CSV import, through the real file input.
  await b.size(390, 780);
  await nav(b, { name: 'import' });
  await b.eval(`const input = document.querySelector('input[type=file]'); const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(strong)}], 'strong.csv', { type: 'text/csv' })); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); return true`);
  await b.sleep(1500);
  await b.shot(`${OUT}/p6-phone-carbon-14-import-matches.jpg`, true);
  await b.click('Import 2 workouts');
  await b.sleep(1500);
  console.log('import:', (await b.text()).replace(/\n/g, ' | ').slice(0, 200));
  await b.shot(`${OUT}/p6-phone-carbon-15-imported.jpg`);

  // Add a bodyweight entry; check the settings switch writes.
  await nav(b, { name: 'measurements' });
  await b.eval(`const i = document.querySelector('main input[inputmode=decimal]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '81.4'); i.dispatchEvent(new Event('input', { bubbles: true })); return true`);
  await b.click('Add');
  await b.sleep(600);
  console.log('measurement:', (await b.text()).includes('81.4 kg'));
  await nav(b, { name: 'settings' });
  await b.click('lb');
  console.log('unit now', await b.eval(`(await window.analog.db.settings.get('unit'))?.value`));
  await b.click('kg');
}
