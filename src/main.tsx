// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/index.css';
import { App } from './App';

async function boot() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('root')!.innerHTML = `<div style="font-family:Inter,sans-serif;padding:24px;background:#17181C;color:#ECE6D8;height:100%">
    <p>Analog couldn't start: ${String(err?.message ?? err)}. Your data hasn't been touched. Please report this on GitHub.</p></div>`;
});
