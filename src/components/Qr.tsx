// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useMemo } from 'react';
import qrcodeGenerator from 'qrcode-generator';

/** Byte capacity of the largest QR code (version 40) at error correction M. */
const QR_MAX_BYTES = 2331;

/** qrcode-generator throws past this, so check before rendering a <Qr>. */
export const qrFits = (data: string) => new TextEncoder().encode(data).length <= QR_MAX_BYTES;

/** The modules as one SVG path, for the screen and for share cards. */
export function qrPath(data: string): { d: string; n: number } {
  const qr = qrcodeGenerator(0, 'M');
  qr.addData(data);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
  return { d, n };
}

/** QR code drawn as one SVG path. */
export function Qr({ data, size, color, background }: { data: string; size: number; color: string; background: string }) {
  const { d, n } = useMemo(() => qrPath(data), [data]);
  return (
    <svg width={size} height={size} viewBox={`-2 -2 ${n + 4} ${n + 4}`} role="img" aria-label="QR code that opens this program in Analog">
      <rect x={-2} y={-2} width={n + 4} height={n + 4} fill={background} />
      <path d={d} fill={color} />
    </svg>
  );
}
