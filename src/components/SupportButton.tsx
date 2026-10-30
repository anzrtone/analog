// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import supportIcon from '@/assets/supportkori.png';
import { SUPPORT_URL } from '@/config';
import { openLink } from '@/platform';

/** The quiet "Support me" pill. Bundled icon, no request until the user presses it. */
export function SupportButton() {
  return (
    <div className="flex flex-col items-center gap-2 py-1">
      <p className="t-hint text-center">Analog is free, with no ads, and it always will be.</p>
      <button type="button" className="btn-support" onClick={() => void openLink(SUPPORT_URL)} title="Support the developer on Kori">
        <img src={supportIcon} alt="" width={20} height={20} className="rounded-md" /> Support me
      </button>
    </div>
  );
}
