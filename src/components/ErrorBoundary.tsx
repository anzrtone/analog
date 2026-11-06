// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { navigate } from '@/features/nav';

/**
 * Without this, one screen throwing while it draws blanks the whole app. A bad row from an import or a sync must not be
 * able to do that, so there is always a way out, and the way to the backups in particular.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app] a screen failed to draw', error, info.componentStack);
  }

  private leave(route: Parameters<typeof navigate>[0]) {
    navigate(route, { root: true });
    this.setState({ failed: false });
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-full flex-col gap-3 bg-paper p-6 text-ink">
        <h1 className="t-title-l">That screen couldn’t open.</h1>
        <p className="text-ink2">Your data hasn’t been touched. Something on this screen is damaged or wasn’t what Analog expected. You can carry on from elsewhere, or restore a backup.</p>
        <button type="button" className="btn-primary" onClick={() => this.leave({ name: 'today' })}>
          Back to Today
        </button>
        <button type="button" className="btn-secondary" onClick={() => this.leave({ name: 'backup' })}>
          Backups
        </button>
      </div>
    );
  }
}
