// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
package app.analoglog;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** The −15 / +15 / Skip buttons on the rest notification and Stop on the stopwatch. Applied natively, then told to JS. */
public class TimerActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent.getAction();
        if (a == null) return;
        long now = System.currentTimeMillis();
        switch (a) {
            case Timers.ACTION_MINUS:
                Timers.adjustRest(ctx, -15_000);
                Timers.recordAction(ctx, "minus15", now);
                break;
            case Timers.ACTION_PLUS:
                Timers.adjustRest(ctx, 15_000);
                Timers.recordAction(ctx, "plus15", now);
                break;
            case Timers.ACTION_SKIP:
                Timers.cancelRest(ctx);
                Timers.recordAction(ctx, "skip", now);
                break;
            case Timers.ACTION_STOP:
                Timers.cancelStopwatch(ctx);
                Timers.recordAction(ctx, "stop", now);
                break;
            default:
                break;
        }
    }
}
