// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
package app.analoglog;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.WindowManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * JS side: src/platform/restTimer.ts. The rest countdown with −15/+15/Skip, the exact end-of-rest alarm, the
 * AMTAP stopwatch with Stop, the workout note, and keeping the screen on. Button taps reach JS at once when the app
 * is running ("timerAction"); otherwise they are queued natively and handed over by drainActions on resume.
 */
@CapacitorPlugin(name = "RestTimer")
public class RestTimerPlugin extends Plugin {
    private static RestTimerPlugin live;

    @Override
    public void load() {
        live = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (live == this) live = null;
        super.handleOnDestroy();
    }

    /** Hand a tap to JS. False when the app isn't running (the caller queues it). */
    static boolean dispatch(String action, long at) {
        RestTimerPlugin p = live;
        if (p == null || p.getBridge() == null) return false;
        JSObject data = new JSObject();
        data.put("action", action);
        data.put("at", at);
        p.notifyListeners("timerAction", data, true);
        return true;
    }

    // Timestamps outrun an int, so they are read with optLong from the raw data.
    private static long time(PluginCall call, String key) {
        return call.getData().optLong(key, System.currentTimeMillis());
    }

    @PluginMethod
    public void startRest(PluginCall call) {
        Timers.startRest(getContext(), time(call, "endsAt"), call.getString("title", "Rest"), call.getString("next", ""), call.getBoolean("sound", true));
        call.resolve();
    }

    @PluginMethod
    public void adjustRest(PluginCall call) {
        Timers.adjustRest(getContext(), call.getData().optLong("deltaMs", 0));
        call.resolve();
    }

    @PluginMethod
    public void cancelRest(PluginCall call) {
        Timers.cancelRest(getContext());
        call.resolve();
    }

    @PluginMethod
    public void showStopwatch(PluginCall call) {
        Timers.showStopwatch(getContext(), time(call, "startedAt"), call.getString("title", "Hold"), call.getString("line", ""));
        call.resolve();
    }

    @PluginMethod
    public void cancelStopwatch(PluginCall call) {
        Timers.cancelStopwatch(getContext());
        call.resolve();
    }

    @PluginMethod
    public void showWorkout(PluginCall call) {
        Timers.showWorkout(getContext(), call.getString("title", "Workout"), call.getString("body", ""));
        call.resolve();
    }

    @PluginMethod
    public void cancelWorkout(PluginCall call) {
        Timers.cancelWorkout(getContext());
        call.resolve();
    }

    @PluginMethod
    public void drainActions(PluginCall call) {
        JSONArray queued = Timers.drainActions(getContext());
        JSArray out = new JSArray();
        for (int i = 0; i < queued.length(); i++) {
            JSONObject o = queued.optJSONObject(i);
            if (o == null) continue;
            JSObject a = new JSObject();
            a.put("action", o.optString("action"));
            a.put("at", o.optLong("at"));
            out.put(a);
        }
        JSObject res = new JSObject();
        res.put("actions", out);
        call.resolve(res);
    }

    @PluginMethod
    public void canScheduleExactAlarms(PluginCall call) {
        JSObject res = new JSObject();
        res.put("value", Timers.canScheduleExact(getContext()));
        call.resolve(res);
    }

    /** Android 12+: the system page where the user can allow exact alarms for Analog. */
    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    /** Keep the screen on while a workout is open (Settings → Keep the screen on during workouts). */
    @PluginMethod
    public void keepAwake(PluginCall call) {
        boolean on = call.getBoolean("on", false);
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> {
            if (on) activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }
}
