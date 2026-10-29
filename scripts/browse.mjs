// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
/**
 * Walk the dev build in a headless Edge (or Chrome) over the DevTools protocol and save screenshots.
 * Dev tool only: `npm run dev`, then `node scripts/browse.mjs <walk.mjs>`, where the walk file exports
 * `default async function (b) { await b.size(1300, 820); await b.shot('docs/screenshots/x.png'); … }`.
 * The browser profile lives in BROWSE_PROFILE (default D:/tmp/analog-browse), so data persists between walks.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const EXE = process.env.BROWSER_EXE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9333;
const PROFILE = process.env.BROWSE_PROFILE ?? 'D:/tmp/analog-browse';
const URL = process.env.ANALOG_URL ?? 'http://localhost:1420/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(EXE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error('browser did not start');
}

const ws = new WebSocket(await target());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });

let width = 1300;
let height = 820;
const b = {
  send,
  sleep,
  async size(w, h, mobile = w < 768) {
    width = w;
    height = h;
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  },
  async goto(url = URL) {
    await send('Page.navigate', { url });
    await sleep(2500);
  },
  /** Evaluate an expression (or async function body) in the page and return its value. */
  async eval(expr) {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr.includes('return') || expr.includes(';') ? expr : `return (${expr})`} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  },
  /** Click the first visible button or link whose text or aria-label contains `text`. */
  async click(text, nth = 0) {
    const ok = await b.eval(`const els = [...document.querySelectorAll('button,[role=button],a,[role=radio],[role=switch],[role=checkbox]')].filter((e) => e.getClientRects().length && ((e.getAttribute('aria-label') ?? '') + ' ' + e.innerText).toLowerCase().includes(${JSON.stringify(text.toLowerCase())})); const el = els[${nth}]; if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true;`);
    if (!ok) throw new Error(`nothing to click: ${text}`);
    await sleep(500);
  },
  async type(text) {
    for (const ch of text) await send('Input.dispatchKeyEvent', { type: 'char', text: ch });
    await sleep(200);
  },
  async key(key, modifiers = 0) {
    const codes = { Enter: 13, Escape: 27, ArrowRight: 39, ArrowLeft: 37, ArrowDown: 40, ArrowUp: 38 };
    const code = codes[key] ?? key.toUpperCase().charCodeAt(0);
    const base = { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, windowsVirtualKeyCode: code, modifiers };
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base, ...(key === 'Enter' ? { text: '\r' } : {}) });
    if (key.length === 1 && !modifiers) await send('Input.dispatchKeyEvent', { type: 'char', text: key, ...base });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await sleep(400);
  },
  async text() {
    return b.eval('document.querySelector("main")?.innerText ?? document.body.innerText');
  },
  async shot(path, full = false) {
    const h = full ? await b.eval('Math.max(document.querySelector("main")?.scrollHeight ?? 0, innerHeight)') : height;
    if (full) await send('Emulation.setDeviceMetricsOverride', { width, height: h, deviceScaleFactor: width < 768 ? 2 : 1, mobile: width < 768 });
    if (full) await b.eval(`document.querySelector('main').style.overflow='visible'; document.documentElement.style.height='auto'; document.body.style.height='auto'; document.getElementById('root').style.height='auto'`);
    await sleep(300);
    const { data } = await send('Page.captureScreenshot', { format: path.endsWith('.jpg') ? 'jpeg' : 'png', quality: path.endsWith('.jpg') ? 85 : undefined });
    mkdirSync(dirname(resolve(path)), { recursive: true });
    writeFileSync(path, Buffer.from(data, 'base64'));
    if (full) {
      await b.eval(`document.querySelector('main').style.overflow=''; document.documentElement.style.height=''; document.body.style.height=''; document.getElementById('root').style.height=''`);
      await b.size(width, height);
    }
    console.log('saved', path);
  },
};

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await b.size(width, height);
  const walk = (await import(pathToFileURL(resolve(process.argv[2])).href)).default;
  await walk(b);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  ws.close();
  proc.kill();
}
