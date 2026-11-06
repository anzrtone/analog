// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
package app.analoglog;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Everything the lock screen needs while the app may be asleep or killed: the rest countdown (drawn by the
 * system chronometer, so no JavaScript runs while it ticks), the end-of-rest alarm with the bell and two pulses,
 * the AMTAP stopwatch and the quiet workout note. All times are epoch milliseconds.
 */
final class Timers {
    static final String CH_REST = "analog_rest";
    static final String CH_DONE_SOUND = "analog_rest_done_sound";
    static final String CH_DONE_SILENT = "analog_rest_done_silent";
    static final String CH_WORKOUT = "analog_workout";

    static final int ID_REST = 2001;
    static final int ID_DONE = 2002;
    static final int ID_WORKOUT = 2003;
    static final int ID_STOPWATCH = 2004;

    static final String ACTION_MINUS = "app.analoglog.REST_MINUS15";
    static final String ACTION_PLUS = "app.analoglog.REST_PLUS15";
    static final String ACTION_SKIP = "app.analoglog.REST_SKIP";
    static final String ACTION_OVER15 = "app.analoglog.REST_OVER_PLUS15";
    static final String ACTION_OVER30 = "app.analoglog.REST_OVER_PLUS30";
    static final String ACTION_STOP = "app.analoglog.STOPWATCH_STOP";
    static final String ACTION_ALARM = "app.analoglog.REST_ALARM";

    private static final String PREFS = "analog_timers";
    private static final long[] TWO_PULSES = {0, 180, 120, 180};

    private Timers() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void ensureChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CH_WORKOUT) != null) return;
        NotificationChannel rest = new NotificationChannel(CH_REST, "Rest timer", NotificationManager.IMPORTANCE_LOW);
        rest.setDescription("The countdown between sets.");
        rest.setShowBadge(false);
        Uri bell = Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + ctx.getPackageName() + "/raw/rest_bell");
        AudioAttributes attrs = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        NotificationChannel doneSound = new NotificationChannel(CH_DONE_SOUND, "Rest over (with sound)", NotificationManager.IMPORTANCE_HIGH);
        doneSound.setDescription("Rest is over: bell and two pulses.");
        doneSound.setSound(bell, attrs);
        doneSound.enableVibration(true);
        doneSound.setVibrationPattern(TWO_PULSES);
        NotificationChannel doneSilent = new NotificationChannel(CH_DONE_SILENT, "Rest over (vibrate only)", NotificationManager.IMPORTANCE_HIGH);
        doneSilent.setSound(null, null);
        doneSilent.enableVibration(true);
        doneSilent.setVibrationPattern(TWO_PULSES);
        NotificationChannel workout = new NotificationChannel(CH_WORKOUT, "Workout in progress", NotificationManager.IMPORTANCE_LOW);
        workout.setDescription("Current exercise and next set on the lock screen.");
        workout.setShowBadge(false);
        nm.createNotificationChannel(rest);
        nm.createNotificationChannel(doneSound);
        nm.createNotificationChannel(doneSilent);
        nm.createNotificationChannel(workout);
    }

    private static PendingIntent openApp(Context ctx) {
        Intent launch = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        return PendingIntent.getActivity(ctx, 0, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static PendingIntent broadcast(Context ctx, String action, Class<?> cls, int code) {
        Intent i = new Intent(ctx, cls).setAction(action);
        return PendingIntent.getBroadcast(ctx, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** The brand ring, in rest-timer yellow, as the notification's large icon. */
    private static Bitmap ringBitmap() {
        int size = 128;
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        float stroke = size * 0.22f;
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(stroke);
        p.setColor(Color.parseColor("#F0A93A"));
        float inset = stroke / 2 + 4;
        c.drawArc(new RectF(inset, inset, size - inset, size - inset), 0f, 360f, false, p);
        return bmp;
    }

    // ---- Rest timer ----

    static void startRest(Context ctx, long endsAt, String title, String next, boolean sound) {
        prefs(ctx).edit().putLong("endsAt", endsAt).putString("title", title).putString("next", next).putBoolean("sound", sound).apply();
        postRest(ctx);
        scheduleAlarm(ctx, endsAt);
    }

    static void postRest(Context ctx) {
        ensureChannels(ctx);
        SharedPreferences p = prefs(ctx);
        long endsAt = p.getLong("endsAt", 0L);
        if (endsAt <= System.currentTimeMillis()) return;
        Notification n = new NotificationCompat.Builder(ctx, CH_REST)
                .setSmallIcon(R.drawable.ic_stat_analog)
                .setLargeIcon(ringBitmap())
                .setContentTitle(p.getString("title", "Rest"))
                .setContentText(p.getString("next", ""))
                .setUsesChronometer(true)
                .setChronometerCountDown(true)
                .setWhen(endsAt)
                .setShowWhen(true)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(openApp(ctx))
                .addAction(0, "−15", broadcast(ctx, ACTION_MINUS, TimerActionReceiver.class, 1))
                .addAction(0, "+15", broadcast(ctx, ACTION_PLUS, TimerActionReceiver.class, 2))
                .addAction(0, "Skip", broadcast(ctx, ACTION_SKIP, TimerActionReceiver.class, 3))
                .build();
        notify(ctx, ID_REST, n);
    }

    static void adjustRest(Context ctx, long deltaMs) {
        SharedPreferences p = prefs(ctx);
        long now = System.currentTimeMillis();
        long endsAt = Math.max(now, p.getLong("endsAt", now) + deltaMs);
        p.edit().putLong("endsAt", endsAt).apply();
        if (endsAt <= now) {
            restOver(ctx);
            return;
        }
        postRest(ctx);
        scheduleAlarm(ctx, endsAt);
    }

    /** "Rest over" alert: more rest counted from now. The title, next-set text and sound choice are still stored. */
    static void restartRest(Context ctx, long ms) {
        long endsAt = System.currentTimeMillis() + ms;
        prefs(ctx).edit().putLong("endsAt", endsAt).apply();
        NotificationManagerCompat.from(ctx).cancel(ID_DONE);
        postRest(ctx);
        scheduleAlarm(ctx, endsAt);
    }

    static void cancelRest(Context ctx) {
        prefs(ctx).edit().putLong("endsAt", 0L).apply();
        ctx.getSystemService(AlarmManager.class).cancel(broadcast(ctx, ACTION_ALARM, RestAlarmReceiver.class, 10));
        NotificationManagerCompat.from(ctx).cancel(ID_REST);
        NotificationManagerCompat.from(ctx).cancel(ID_DONE);
    }

    static boolean canScheduleExact(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        return ctx.getSystemService(AlarmManager.class).canScheduleExactAlarms();
    }

    /** Exact while idle when allowed; Android 14+ denies exact alarms by default, so fall back to an inexact one. */
    private static void scheduleAlarm(Context ctx, long endsAt) {
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        PendingIntent pi = broadcast(ctx, ACTION_ALARM, RestAlarmReceiver.class, 10);
        try {
            if (canScheduleExact(ctx)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, pi);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, pi);
        }
    }

    /**
     * Called by the alarm: swap the countdown for a "Rest over" alert with the bell and two pulses. It stays until
     * Go, +15 or +30 is tapped (or half an hour passes), so a late look at the phone still has something to act on.
     */
    static void restOver(Context ctx) {
        ensureChannels(ctx);
        SharedPreferences p = prefs(ctx);
        NotificationManagerCompat.from(ctx).cancel(ID_REST);
        String channel = p.getBoolean("sound", true) ? CH_DONE_SOUND : CH_DONE_SILENT;
        Notification n = new NotificationCompat.Builder(ctx, channel)
                .setSmallIcon(R.drawable.ic_stat_analog)
                .setContentTitle("Rest over")
                .setContentText(p.getString("next", ""))
                .setAutoCancel(true)
                .setTimeoutAfter(30 * 60_000)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setVibrate(TWO_PULSES)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(openApp(ctx))
                .addAction(0, "+15", broadcast(ctx, ACTION_OVER15, TimerActionReceiver.class, 5))
                .addAction(0, "+30", broadcast(ctx, ACTION_OVER30, TimerActionReceiver.class, 6))
                .addAction(0, "Go", broadcast(ctx, ACTION_SKIP, TimerActionReceiver.class, 3))
                .build();
        notify(ctx, ID_DONE, n);
        p.edit().putLong("endsAt", 0L).apply();
    }

    // ---- AMTAP stopwatch on the lock screen ----

    static void showStopwatch(Context ctx, long startedAt, String title, String line) {
        ensureChannels(ctx);
        Notification n = new NotificationCompat.Builder(ctx, CH_WORKOUT)
                .setSmallIcon(R.drawable.ic_stat_analog)
                .setContentTitle(title)
                .setContentText(line)
                .setUsesChronometer(true)
                .setWhen(startedAt)
                .setShowWhen(true)
                .setOngoing(true)
                .setSilent(true)
                .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(openApp(ctx))
                .addAction(0, "Stop", broadcast(ctx, ACTION_STOP, TimerActionReceiver.class, 4))
                .build();
        notify(ctx, ID_STOPWATCH, n);
    }

    static void cancelStopwatch(Context ctx) {
        NotificationManagerCompat.from(ctx).cancel(ID_STOPWATCH);
    }

    // ---- Workout in progress ----

    static void showWorkout(Context ctx, String title, String body) {
        ensureChannels(ctx);
        Notification n = new NotificationCompat.Builder(ctx, CH_WORKOUT)
                .setSmallIcon(R.drawable.ic_stat_analog)
                .setContentTitle(title)
                .setContentText(body)
                .setOngoing(true)
                .setSilent(true)
                .setShowWhen(false)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(openApp(ctx))
                .build();
        notify(ctx, ID_WORKOUT, n);
    }

    static void cancelWorkout(Context ctx) {
        NotificationManagerCompat.from(ctx).cancel(ID_WORKOUT);
    }

    // ---- Taps made while JavaScript wasn't running ----

    /** Hand the tap to JS if the app is alive, else queue it for drainActions on the next resume. */
    static void recordAction(Context ctx, String action, long at) {
        if (RestTimerPlugin.dispatch(action, at)) return;
        SharedPreferences p = prefs(ctx);
        try {
            JSONArray arr = new JSONArray(p.getString("queue", "[]"));
            arr.put(new JSONObject().put("action", action).put("at", at));
            p.edit().putString("queue", arr.toString()).apply();
        } catch (JSONException ignored) {
            // A damaged queue only loses taps the native timer has already applied.
        }
    }

    static JSONArray drainActions(Context ctx) {
        SharedPreferences p = prefs(ctx);
        JSONArray arr;
        try {
            arr = new JSONArray(p.getString("queue", "[]"));
        } catch (JSONException e) {
            arr = new JSONArray();
        }
        p.edit().putString("queue", "[]").apply();
        return arr;
    }

    private static void notify(Context ctx, int id, Notification n) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManagerCompat.from(ctx).notify(id, n);
    }
}
