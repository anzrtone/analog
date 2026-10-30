# Decisions

Choices made while rebuilding Analog 0.2.0 on the Promodoro stack, with the reason for each. Newest at the bottom of each section.

## Scaffold

- **Versions match Promodoro** (React 18.3, Vite 6, Vitest 3, Tailwind 3.4, TypeScript 5.9, Dexie 4, Capacitor 8, Tauri 2). Promodoro has no lint step, so ESLint 9 (flat config) with `typescript-eslint` and `eslint-plugin-react-hooks` was added for `npm run lint`.
- **`no-irregular-whitespace` skips regular expressions.** The carried-over CSV importer strips a literal byte-order mark inside a regex; the engine is copied unchanged, so the rule is relaxed instead.
- **Tailwind's default palette is replaced, not extended.** Only BRAND tokens exist as colours (`bg-paper`, `text-ink`, `border-red-ring` …), so off-brand colours can't be used by accident.
- **Two copies of the colour values, kept equal by a test.** CSS variables drive the app; `src/theme/tokens.ts` (hex) drives the contrast test, SVG share cards and the canvas. `tests/theme-css.test.ts` fails if they drift.
- **Wide layout from 1024 px** (the rebuild prompt), where anaLOG used 1000 px. The spine folds to icons below 1280 px and the workout's session outline shows from 1360 px, as before.
- **Navigation is a typed back stack** (`src/features/nav.ts`). Promodoro's nav store has tabs only; Analog has pushed pages (workout, program builder, exercise detail…), so the store keeps a stack. Choosing a tab resets it. Esc and the Android back button close the newest sheet first (`closeTopOverlay`), then pop the stack.
- **The phone tab is labelled "Log", the spine item "Today"**, as in anaLOG 0.1.0 (product behaviour follows anaLOG's code).

## Engine

- **`src/domain` was copied to `src/engine` unchanged** apart from `@/domain/` → `@/engine/` imports. All 143 domain tests pass under Vitest with `globals: true`; none needed a Jest → Vitest change.

## Data

- **Dexie tables mirror 0.1.0's SQLite tables one for one**, with the same field names and the same row shapes (every column present, `null` where empty). The backup file is therefore unchanged: `app: "analog"`, `format: 1`, one section per table. A 0.1.0 backup restores into 0.2.0 as is, and a 0.2.0 backup restores into 0.1.0. `src/db/restore010.test.ts` builds a 0.1.0 backup with every table filled and checks the restore row for row.
- **Null-aware indexes.** IndexedDB leaves rows out of an index when the key is null, so `[exerciseId+completedAt]` holds only ticked sets (previous performance, PR baseline, exercise history) and `completedAt` is the date-range index. Unfinished workouts carry an `open: 1` marker that's indexed and removed on finish; it's an index helper only and is stripped from backups and rebuilt on restore. Booleans can't be IndexedDB keys, so `isDefault`, `archived` and `active` are filtered in code (a handful of rows each).
- **Previous performance walks the `[exerciseId+completedAt]` index backwards three sessions at a time** and stops at the first finished one, so an abandoned workout never counts as "last time" and five years of history costs a few dozen reads.
- **Performance gate at the size the prompt names**: 20,800 finished workouts and 416,000 ticked sets (anaLOG's STATUS.md quotes these numbers, but its own test seeded 1,040 workouts and 20,800 sets). Measured in fake-indexeddb: first history page 20 ms, next page 16 ms, previous performance 10 ms.
- **"No full scans" became a read count.** 0.1.0 checked SQLite's query plans; IndexedDB has none, so `countSetReads` (Dexie middleware) counts the set rows each hot path reads and the test bounds them.
- **The data layer is async.** Every repo function and both services (`programFlow`, `workoutFlow`) take the database as their first argument like 0.1.0's, and make the same decisions; only `await` was added. The services test kept every expectation.
- **Tour sample data**: screens read through `readDb()`, which returns the tour's throwaway sample database while it is shown; writes always name the user's `db`. Replaces 0.1.0's proxy over Drizzle.
- **Automatic backups**: one file per day (`analog-backup-YYYY-MM-DD.json`), written after every finished workout (rewriting that day's file) and at launch when the newest is from an earlier day and there is data; the newest 7 are kept. They go to the app's own files (Android: `files/backups`, included in Android Auto Backup; Windows: the app's data folder). Backup and export lists them for restoring. When it last ran is kept in a new device-only setting, `autoBackupAt`, which backups leave out like the other device-only settings.
- **Not carried over:** `shareEqual` (structural sharing for synchronous reads) and the sql.js test. Dexie's live queries replace both.

## App shell and the workout logger

- **Reads use Dexie live queries** (`useData` in `src/features/data.ts`), so a screen re-reads when a table it read changes. This replaces 0.1.0's data-version counter and `useQuery`.
- **Writes from the workout screen go to `editDb()`**: the user's database, or the tour's sample while the tour shows its sample workout, so the tour can be tried out by ticking sets without touching the user's data.
- **Pushed pages cover the phone tab bar**, as 0.1.0's stack screens did; tabs show only on the five tab pages.
- **After a reload or a relaunch the app opens on Today**, which offers the open workout under "In progress" (and the spine shows it on wide screens). 0.1.0's browser build kept the URL; the native apps never did.
- **The rest timer lives in memory**, as in 0.1.0: a reload drops the in-app ring. On Android the native countdown and alarm keep going and the next resume reads them back (`drainActions`).
- **The exercise list draws 120 rows at a time** with "Show more", instead of a virtualised list library.
- **Small zustand stores became `createStore`** (`src/features/store.ts`), a 20-line useSyncExternalStore store in Promodoro's style; no state library.

## Programs, history, stats and share cards

- **Share cards are SVG strings** (`src/features/share/cards.ts`) laid out on a 360-wide ruled page and exported at 1080 px through a canvas (`render.ts`). The preview on screen is the same SVG as an image, so what you see is what is shared. The bundled fonts are inlined into the SVG (an SVG drawn as an image can't use the page's fonts); they are read from the app's own files, never the network. All six 0.1.0 cards exist: workout, PR, program (with its QR code), exercise progress, meso recap and Wrapped.
- **Sharing**: Android shares the PNG through the share sheet (Capacitor Share, from which it can be saved); Windows saves it with the Save dialog. 0.1.0's separate "Save to gallery" button needed a media-library permission and is folded into the share sheet.
- **Program links on Windows and in the dev build are copied to the clipboard**, as 0.1.0's desktop build did; Android uses the share sheet.
- **The muscle heatmap draws 0.1.0's body artwork with plain SVG** (`src/components/Heatmap.tsx`). `react-native-body-highlighter` only runs in React Native, but its body is plain data: the four path files (male and female, front and back) and the two outlines are copied into `src/components/body/` with the MIT licence beside them and credited on About. Same regions, same mapping (a region shows its hardest-worked muscle), one red hue in five opacity steps. Settings > Muscle map picks the male (default, as in 0.1.0) or female body.
- **The exercise picker hands back its choice through a token that carries where it goes** (`builder|program|block|day|slot`), because the builder unmounts while the library page is open.
- **Wide-screen screenshots are taken with headless Edge** driven over the DevTools protocol (`scripts/browse.mjs`, walks in `scripts/walks/`), because the app's browser pane crops wide viewports at small window sizes. Edge was already installed; nothing new was installed.

## More

- **Progress photos are stored in the database** (a new `photoFiles` table, schema version 2, `photos.uri` = `photo:<id>`), downscaled to 1600 px JPEG. They stay out of backups, as in 0.1.0. A plain `<input type="file" accept="image/*">` picks them; on Android the WebView offers the camera and the gallery from it.
- **Imports and restores use `<input type="file">`** on every platform, as the prompt asks; exports go through the platform bridge (share sheet on Android, Save dialog on Windows, a download in the dev build).
- **Backup and export also lists the automatic backups** so any of the last seven can be restored. Without that list the automatic backups would have no way back in.
- **Health Connect is left out of 0.2.0** (STATUS.md, "Later"); the Settings section is gone, the `healthConnect` setting is kept so backups round-trip.
- **Settings switches are toggles** instead of 0.1.0's On/Off segmented controls: same settings, ink-only switch (no plate colour).
- **Spine links start a fresh page stack**, so a page opened from the spine has no back arrow; the arrow shows only when there is a page to go back to.
- **The kitchen sink moved into the developer group with the admin console** (the prompt: admin and kitchen sink only in dev builds). Both are compiled out of release builds through `__DEV_BUILD__`.
- **The admin console's demo history** (`src/dev/admin.ts`) is 0.1.0's, ported to async: three programs played through the real engine, freestyle sessions with every set type, measurements, gyms.

## Welcome, tour, survey, dev log

- **The welcome wizard and the tour spotlight are DOM ports** of 0.1.0's screens, built on Promodoro's `OnboardingScreen` and `TourOverlay` patterns (a data-tour attribute marks each target; the visible match wins, so the phone tab bar and the spine can carry the same id).
- **The tour's sample is its own Dexie database** (`analog-tour-sample`), built from today's date when the tour starts and deleted when it ends. Screens read it through `readDb()`; programs made during the tour go to the user's database on purpose (that's the point of those steps); ticking a sample set changes only the sample.
- **The tour host's `makeProgram` and `makeDay` are async** (Dexie), so `makeStep` awaits them; the tour tests were ported with `await` and kept every expectation.
- **The survey keeps `SURVEY_URL = null`**: nothing is ever sent, the consent page says the answers stay on the device, and Settings hides the sharing switch. The send/withdraw logic and its tests are carried over unchanged.

## Android

- **The rest timer is a local Capacitor plugin in Java** (`RestTimerPlugin`, `Timers`, `TimerActionReceiver`, `RestAlarmReceiver` in `android/app/src/main/java/app/analoglog/`), registered in `MainActivity`. It follows Promodoro's `TimerNotificationPlugin` (a static live instance for instant `notifyListeners`, a SharedPreferences queue drained on resume) and keeps 0.1.0's behaviour from `Timers.kt`: the same channel ids, notification ids 2001-2004, the system chronometer for the countdown, `setExactAndAllowWhileIdle` when exact alarms are allowed and `setAndAllowWhileIdle` when not, the bell and two pulses on "Rest over", a 60 s timeout on that alert.
- **Lock-screen buttons act natively first, then tell JS** (`minus15`, `plus15`, `skip`, `stop`, `restOver`). `applyNativeAction` only moves the page's own copy of the timer, so a tap is never applied twice.
- **Broadcast receivers instead of Promodoro's no-display activity** for the notification buttons, as 0.1.0 did: the buttons never need to open the app.
- **Permissions are INTERNET, POST_NOTIFICATIONS, SCHEDULE_EXACT_ALARM and VIBRATE.** `@capacitor/local-notifications` is used only to ask for the notification permission, so the two permissions it merges in for rescheduling after reboot (`RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`) are removed with `tools:node="remove"`. No `USE_EXACT_ALARM` (0.1.0 didn't ask for it either), no microphone, advertising id or legacy storage.
- **Android Auto Backup carries `files/backups` and shared preferences**, not the WebView's IndexedDB. 0.1.0 checkpointed its SQLite file in a backup agent before copying it; LevelDB under the WebView has no such hook and could be copied mid-write. The automatic daily backups are whole JSON files written atomically, and More → Backup lists them after a restore.
- **Version and signing come from the environment**, as in Promodoro: `ANALOG_VERSION_NAME` / `ANALOG_VERSION_CODE`, and `android/keystore.properties` or `ANALOG_KEYSTORE`, `ANALOG_KEYSTORE_PASSWORD`, `ANALOG_KEY_ALIAS`, `ANALOG_KEY_PASSWORD`. Without them, a release build is unsigned and CI falls back to a debug APK.
- **Icons and splash are drawn from `assets/*.png` by `scripts/android-res.ps1`** (Windows' System.Drawing, no new dependency): the 0.1.0 adaptive foreground and Android 13 themed monochrome on Paper, the legacy and round icons, and the ring on Carbon for the splash. Android 12+ uses the system splash with the same colours.
- **Not built here**: a JDK is installed but no Android SDK, so `./gradlew assembleDebug` was not run and the Java has not been compiled. `npx cap sync android` succeeds. CI builds the APK.

## Desktop

- **The Tauri shell is Promodoro's without the tray, mini mode, global shortcut and alarm scheduler.** A logbook doesn't run in the background the way a focus timer does; closing the window quits. Kept: single instance (two windows would race on IndexedDB), the notification, dialog and opener plugins, and atomic file writes.
- **The window never throttles its timers** (`backgroundThrottling: disabled` and Promodoro's browser flags), so the page's own timeout for the end of rest is on time behind other windows, and a desktop notification says "Rest over" when Analog isn't focused.
- **Automatic backups go to `Documents\Analog Backups`** through four Rust commands (`backup_dir`, `backup_write`, `backup_list`, `backup_read`) that only ever touch `analog-backup-*.json` names in that folder. Exports use the Save dialog and `write_text_file` / `write_base64_file`, as in Promodoro.
- **CSP:** `connect-src 'self' ipc: http://ipc.localhost https://api.github.com` and nothing else. The opener may open only `https://github.com/*` and `https://analog-app.github.io/*`.
- **Window:** 1440 × 900 like 0.1.0's Electron window, minimum 380 × 560, Carbon background so there is no white flash before the first paint.
- **The installers were not built here** (`tauri build --no-bundle` only): the bundler downloads NSIS and WiX into the user profile on drive C:, which is nearly full. CI builds them.

## CI and docs

- **`.github/workflows/build.yml` is Promodoro's**, renamed (`ANALOG_*` variables, `Analog-*.apk`, `Analog-portable.exe`, artifacts `analog-windows` / `analog-android`), with `npm run lint` added to the check job and without Promodoro's official-build variable (Analog has no server). It runs on `main`, pull requests, `v*` tags and by hand; tags publish a release with `SHA256SUMS.txt`.
- **DEVLOG.md keeps 0.1.0's entries** under the new 0.2.0 one, so the project's history stays in one place.

## Page and tour motion (after 0.2.0 phase 10)

- **Pages change without a flash** (`src/components/ScreenStack.tsx`). The new page renders out of sight while the old one stays up; `useData` counts each page's first reads (`src/features/screenReady.ts`), and the swap happens once they are in or after 300 ms, whichever is first. The scroll goes back to the top before the new page's first paint. Before, the new page painted at the old page's scroll position with empty data, then jumped to the top, then filled in.
- **Motion:** tabs fade in with a 6 px rise (200 ms); pushed pages slide in from the right and popped pages from the left (28 px, 240 ms). The system's reduced-motion setting turns all of it off through the existing CSS rule.
- **`useData` boxes its result** so "loaded, and the answer is undefined" (no active workout) isn't mistaken for "still loading", which would have held such pages for the full 300 ms.
- **The tour note and spotlight stay mounted between steps.** They used to unmount on every step and pop back in at the new place. Now the note shows the new words where it is, and once the next target has held still for two frames the note and the ring glide there (300 ms); with no target the ring closes to a point and the whole page dims. Targets inside a page still being prepared don't count.
- **The project lives in a new repository, `anzrtone/analog`**, instead of replacing 0.1.0 in `anzrtone/anaLOG`. `src/config.ts` names it once (`REPO`); the About links, the issues link, the release pages and the optional update check all follow from it.
