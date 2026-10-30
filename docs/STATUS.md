# Status (2026-10-30, 0.2.0)

Honest state of the rebuild. "Verified" means a test or a check actually ran on this machine.

## Verified

| What | How |
| --- | --- |
| Engine: set types, units, e1RM/RPE, plate maths, warm-ups, progression, adaptive volume, meso report, imports, PRs, stats, timers, Wrapped | Vitest: the 143 tests carried over from 0.1.0 with the code, unchanged |
| Database: schema, row builders, crash-safe set writes, resume, previous performance, history paging, settings, backup round trip, duplicate-safe import | Vitest on fake-indexeddb (`src/db/db.test.ts`) |
| A 0.1.0 backup restores into 0.2.0 as it is | `src/db/restore010.test.ts` |
| Performance: 20,800 workouts and 416,000 sets; first History page and previous performance | Under 500 ms in `src/db/perf.test.ts`; `src/db/db.test.ts` counts set reads to prove previous performance doesn't load all history |
| Workout and program flows, templates | `src/services/services.test.ts` |
| Automatic backups: once a day, after each workout, keep 7, skip when empty | `tests/autoBackup.test.ts` against a fake platform |
| Share cards render (SVG with embedded fonts) | `tests/cards.test.ts`; PNGs looked at in the browser |
| Welcome questions, tour steps, survey rules, dev log and release check | Vitest, ported from 0.1.0's Jest tests with every expectation kept |
| Brand contrast and the CSS tokens | `src/theme/tokens.test.ts` (from 0.1.0) and `tests/theme-css.test.ts` (the CSS variables match the tokens) |
| Typecheck, lint, tests, web build | `npm run typecheck`, `npm run lint`, `npm test` (227 tests in 19 files), `npm run build`: all clean. The web build is 2.0 MB, 1.7 MB of it the JS bundle with the 876-exercise library |
| Every screen in the browser | Headless Edge driven by `scripts/browse.mjs` and the walks in `scripts/walks/`, at 390 px and 1300 px in Carbon and Paper; the screenshots are in `docs/screenshots/` (`p4-` logger, `p5-` programs/history/stats/share, `p6-` More, `p7-` welcome and tour). Includes a set that survives a reload, the resume prompt, keyboard entry on desktop, and the tour leaving the user's database untouched (0 workouts afterwards, sample database deleted) |
| Android project | `npx cap sync android` succeeds and finds the five Capacitor plugins. The manifest asks only for INTERNET, POST_NOTIFICATIONS, SCHEDULE_EXACT_ALARM and VIBRATE |
| Windows app (no installer) | `npx tauri build --no-bundle` compiles the shell with no warnings into a 4.3 MB `analog.exe`. Launched here: the welcome screen paints in Carbon with the brand fonts (`docs/screenshots/p9-desktop-first-launch.png`); from inside the window, `backup_dir` answers `Documents\Analog Backups`, `backup_list` answers an empty list, `backup_read` refuses `../secrets.json`, and the CSP blocks a fetch to another host |

## Written but not run

- **The Android build.** A JDK is installed here but no Android SDK, so `./gradlew assembleDebug` was not run and the Java (`RestTimerPlugin`, `Timers`, the two receivers, `MainActivity`) has never been compiled. CI builds the APK; the first CI run is its first compile.
- **Everything native on a phone:** the lock-screen countdown with −15 / +15 / Skip, the exact alarm with the bell and two pulses, the AMTAP stopwatch with Stop, the workout note, queued taps replayed on resume, the hardware back button, `analog://program` links, the share sheet for exports, haptics, keep-awake, Android Auto Backup of `files/backups`, the notification and exact-alarm permission prompts.
- **The Windows installers** (NSIS and MSI). The bundler would download NSIS and WiX onto drive C:, which has under 1 GB free, so they are left to CI. In the real window, only first launch was tried (above): not logging a workout, the Save dialog, the "Rest over" notification or writing an automatic backup.
- **The release workflow** (`.github/workflows/build.yml`): copied from Promodoro's, which works, and renamed; it has not run in this repository.
- **The anonymous survey:** `SURVEY_URL` is null, so nothing is ever sent; the sending code is tested against a fake server only.

## Not done / later

- **Health Connect** (0.1.0 had it written but never run). The `healthConnect` setting is kept so backups round-trip.
- Exercise images; home-screen widget; Wear OS; iOS (SPEC §10 marks these "later").
- Scheduled export to a folder the user picks (automatic backups go to the app's own folder).
- Program builder drag-to-reorder (up/down buttons, as in 0.1.0).
- The 0.2.0 entry in `RELEASES` has no date yet: set it when the release goes out.

## Known risks

- **Native code never compiled.** A typo in the Java would fail the first CI Android job. The plugin's method names and arguments match `src/platform/restTimer.ts` by reading, not by running.
- **Exact alarms:** Android 14+ denies `SCHEDULE_EXACT_ALARM` by default. Without it the end-of-rest alert can be a little late with the screen locked. Settings links to the permission page.
- **Android Auto Backup carries the automatic backups, not the live database.** After moving to a new phone, the user restores from More → Backup; it doesn't happen on its own. The newest backup is at most a day (or one workout) old.
- **IndexedDB can be cleared** by the system or the user (clearing the WebView's or browser's site data). The app asks for persistent storage at launch; the automatic backups are the safety net.
- **The Windows .exe is unsigned:** SmartScreen warns on first run.
- **The JS bundle is one 1.7 MB chunk**, most of it the exercise library. It loads from local files on both platforms, so it hasn't been split.
