// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Analog ships only inside native shells: Tauri (Windows) and Capacitor (Android).
// The dev server exists for building and testing; there is no PWA or hosted web build.
const host = process.env.TAURI_DEV_HOST;

const CHARSET = '<meta charset="UTF-8" />';

/** Puts the policy first in the page, so it covers every script after it. Fails rather than shipping without one. */
export function withCsp(html: string, csp: string): string {
  if (!html.includes(CHARSET)) throw new Error('index.html: nowhere to put the Content-Security-Policy');
  return html.replace(CHARSET, `${CHARSET}\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
}

/**
 * Tauri sends the policy in tauri.conf.json as a header, but Capacitor serves the page with none. Both shells load this
 * same build, so the page carries the same policy, `ipc:` included: on desktop a page's policy and the header both apply,
 * so leaving it out would cut off Tauri's IPC. Build only, because the dev server relies on inline scripts and a websocket.
 */
export const cspPlugin = (): Plugin => ({
  name: 'analog-csp',
  apply: 'build',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) => {
      const tauri = JSON.parse(readFileSync(new URL('./src-tauri/tauri.conf.json', import.meta.url), 'utf8')) as { app: { security: { csp: string } } };
      return withCsp(html, tauri.app.security.csp);
    },
  },
});

export default defineConfig({
  plugins: [react(), cspPlugin()],
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __DEV_BUILD__: JSON.stringify(process.env.NODE_ENV !== 'production') },
  clearScreen: false,
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**', '**/android/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    // WebView2 (Windows) and Android System WebView are both evergreen Chromium.
    target: 'chrome105',
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30000,
  },
} as never);
