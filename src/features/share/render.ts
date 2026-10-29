// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
// From a card's SVG to something you can see and share. An SVG shown as an image can't reach the page's fonts,
// so the bundled ones (the same files the app uses, read from the app itself, never the network) go inside it.
import newsreader500 from '@fontsource/newsreader/files/newsreader-latin-500-normal.woff2?url';
import plex400 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?url';
import plex500 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2?url';
import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff2?url';
import inter500 from '@fontsource/inter/files/inter-latin-500-normal.woff2?url';

const FACES: [family: string, weight: number, url: string][] = [
  ['Newsreader', 500, newsreader500],
  ['IBM Plex Mono', 400, plex400],
  ['IBM Plex Mono', 500, plex500],
  ['Inter', 400, inter400],
  ['Inter', 500, inter500],
];

let fontCss: Promise<string> | null = null;

async function dataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** @font-face rules with the fonts inlined, made once. */
function fonts(): Promise<string> {
  fontCss ??= Promise.all(FACES.map(async ([family, weight, url]) => `@font-face{font-family:'${family}';font-weight:${weight};src:url(${await dataUrl(url)}) format('woff2');}`)).then((r) => r.join(''));
  return fontCss;
}

/** The card with its fonts inside, as a data URL an <img> can show. */
export async function cardImageUrl(svg: string): Promise<string> {
  const css = await fonts();
  const withFonts = svg.replace(/(<svg[^>]*>)/, `$1<style>${css}</style>`);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(withFonts)}`;
}

/** Draw the card at full size (1080 wide) and return it as base64 PNG. */
export async function cardPng(svg: string, width: number, height: number): Promise<string> {
  const img = new Image();
  img.decoding = 'sync';
  img.src = await cardImageUrl(svg);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
}
