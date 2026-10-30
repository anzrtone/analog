// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
package app.analoglog;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** The end-of-rest alarm: bell and two pulses, even with the app killed and the phone dozing. */
public class RestAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!Timers.ACTION_ALARM.equals(intent.getAction())) return;
        Timers.restOver(ctx);
        Timers.recordAction(ctx, "restOver", System.currentTimeMillis());
    }
}
