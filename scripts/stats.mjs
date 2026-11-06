// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
// Print the install count and the shared survey answers from the relay Worker.
//   ANALOG_ADMIN_TOKEN=... node scripts/stats.mjs          (or: npm run stats)
// The token is the Worker's ADMIN_TOKEN secret (`npx wrangler secret put ADMIN_TOKEN` in worker/). Add --json for raw output.
import { readFileSync } from 'node:fs';

const token = process.env.ANALOG_ADMIN_TOKEN;
if (!token) {
  console.error('Set ANALOG_ADMIN_TOKEN to the Worker\'s ADMIN_TOKEN secret.');
  process.exit(1);
}
const config = readFileSync(new URL('../src/config.ts', import.meta.url), 'utf8');
const base = process.env.ANALOG_RELAY_URL ?? /RELAY_URL: string \| null = '([^']+)'/.exec(config)?.[1];
if (!base) {
  console.error('No relay URL: set ANALOG_RELAY_URL or RELAY_URL in src/config.ts.');
  process.exit(1);
}

const res = await fetch(`${base.replace(/\/+$/, '')}/stats`, { headers: { authorization: `Bearer ${token}` } });
if (res.status === 404) throw new Error('The Worker has no ADMIN_TOKEN secret yet, so /stats is off.');
if (res.status === 401) throw new Error('The Worker did not accept that token.');
if (!res.ok) throw new Error(`The Worker answered ${res.status}.`);
const data = await res.json();
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

// Answers are typed by strangers. The Worker refuses control characters now, but older records may hold some, and they
// would drive this terminal: clear the screen, fake these numbers, set the clipboard.
const clean = (s) => String(s).replace(/\p{Cc}/gu, '?');

if (data.budget) {
  const { limits: l, ...b } = data.budget;
  const gb = (n) => (n / 1024 ** 3).toFixed(2);
  console.log(`BUDGET TODAY (UTC ${clean(b.day)})`);
  console.log(`  stored        ${gb(b.storedBytes)} of ${gb(l.maxStoredBytes)} GB`);
  console.log(`  new bytes     ${gb(b.newBytes)} of ${gb(l.maxNewBytesPerDay)} GB`);
  console.log(`  new pairs     ${b.newPairs} of ${l.maxNewPairsPerDay}`);
  console.log(`  sync writes   ${b.syncWrites} of ${l.maxSyncWritesPerDay}`);
  console.log(`  record writes ${b.recordWrites} of ${l.maxRecordWritesPerDay}; ${b.records} of ${l.maxRecords} kept`);
  console.log(`  reads         ${b.reads} of ${l.maxReadsPerDay}`);
  console.log(`  last full scan ${clean(b.scanDoneDay ?? 'not yet')}\n`);
}
if (data.truncated) console.log('(More records than one request can read: the totals below are a sample.)\n');

const table = (t) => Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, n]) => `  ${String(n).padStart(5)}  ${clean(k)}`).join('\n') || '  (none)';
console.log(`INSTALLS COUNTED: ${data.installs.total}`);
console.log(`by platform\n${table(data.installs.byPlatform)}`);
console.log(`by version\n${table(data.installs.byVersion)}`);
console.log(`first seen, by day\n${table(data.installs.byDay)}`);
console.log(`\nSURVEY ANSWERS: ${data.surveys.total}`);
console.log(`what people use Analog for\n${table(data.surveys.uses)}`);
console.log(`where they heard about it\n${table(data.surveys.heardFrom)}`);
const other = data.surveys.answers.filter((a) => a.usesOther || a.heardOther);
if (other.length) {
  console.log('\nin their own words');
  for (const a of other) console.log(`  ${clean(a.answeredOn)}  uses: ${clean(a.usesOther || '-')}  heard: ${clean(a.heardOther || '-')}`);
}
