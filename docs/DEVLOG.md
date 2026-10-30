# Dev log

Newest first. What was built, why it ended up the way it did, and what still hasn't been checked.
For the plain state of each part, see [STATUS.md](STATUS.md); for every judgement call, [DECISIONS.md](DECISIONS.md).

---

## 2026-10-30 · 0.2.0: the rebuild

Analog 0.1.0 was React Native and Expo: a 9.6 MB Hermes bundle, SQLite through three different drivers (native, sql.js in the browser, a file under Electron), and an Android build that needed EAS or a full local SDK just to try. 0.2.0 is the same logbook rebuilt on the stack Promodoro already ships with: **Vite, React 18, TypeScript, Tailwind, Dexie (IndexedDB), Capacitor 8 for Android and Tauri 2 for Windows**. One web app, two thin native shells.

**What carried over unchanged**

- **The engine.** `src/domain` from 0.1.0 is now `src/engine`, copied file for file with its 143 tests: set types, units, e1RM/RPE, plate maths, warm-ups, progression, adaptive volume and the meso report, imports, PRs, stats, timers, Wrapped. Not a line of logic was rewritten.
- **The data.** The Dexie schema mirrors 0.1.0's tables and column names, and the backup file is byte-for-byte the same format (`app: 'analog', format: 1`). A 0.1.0 backup restores as it is (`src/db/restore010.test.ts` restores one).
- **The design.** BRAND.md is followed as before; its §14 now describes CSS variables and the Tailwind palette instead of the React Native theme object. Paper and Carbon, the plate rings, the ruled rows, the stamps.
- **The screens.** Every screen in SPEC.md was ported: Today, the workout logger with its sheets and rest timer, the summary, programs and the builder, program links and QR, the meso report, History, Stats, share cards, the exercise library, gyms and plates, body, import, backup, settings, about, the dev log, the welcome questions and the guided tour.

**What's new or different**

- **A real Android app** (`android/`, Capacitor). The lock-screen rest countdown with −15 / +15 / Skip, the exact end-of-rest alarm with the bell and two pulses, the AMTAP stopwatch with Stop and the workout note are a small Java plugin (`RestTimerPlugin`) that follows 0.1.0's Kotlin module and Promodoro's timer plugin. Taps made while the app sleeps are queued and replayed on resume. `analog://program` links open the import screen.
- **A smaller Windows app** (`src-tauri/`, Tauri 2): NSIS and MSI installers and a portable .exe instead of Electron. Exports use the native Save dialog; the end of rest shows a desktop notification when Analog is behind other windows.
- **Automatic backups.** A copy of everything after each finished workout and once a day at launch, the last seven kept (`files/backups` on Android, which Android Auto Backup carries to a new phone; `Documents/Analog Backups` on Windows). Backup and export lists them so any one can be restored.
- **Speed with years of history.** Previous performance walks an index three sessions at a time instead of loading every set; the first History page and last time's numbers stay well under the 500 ms budget with 20,800 workouts and 416,000 sets (`src/db/perf.test.ts`).
- **Progress photos live in the database** (a `photoFiles` table) instead of the app's folder; they still stay out of backups.
- **Health Connect is left out** of 0.2.0 (STATUS, "Later").

**How it was checked:** typecheck, lint and Vitest on every phase; each screen walked in a headless Edge at 390 px and 1300 px in Paper and Carbon by `scripts/browse.mjs` with screenshots in `docs/screenshots/`; `npx cap sync android`. **Not checked here:** the Android build itself (no Android SDK on this machine; CI builds the APK) and the Windows installers (the shell was compiled and its first launch checked; the installers are left to CI). See STATUS.md.

---

## 2026-10-29 · In-app dev log and release check

A **Dev log** screen (`src/app/devlog.tsx`, linked from More, About and Settings) lists what changed in each release. The notes ship inside the app (`src/features/devlog/releases.ts`), so they read offline.

- **After an update** the first launch shows a "What's new in Analog X" dialog with the newest release's notes, then remembers the version in `lastSeenVersion`. A first install shows nothing, because the welcome flow covers that.
- **The screen** is a card saying which version you're on, with a **Check** button, then one ruled notebook page per release: red margin line, red version, date, a "you are here" pill on the installed one, a one-line summary, and New / Better / Fixed tags on each note.
- **Checking for a newer release only happens when asked.** The Check button asks once, right then. The daily check ("Check once a day") is off by default; when it's on, the app asks GitHub's `releases/latest` at most once a day. The request carries no cookies and no referrer, and it sends nothing about the user. A newer version gets one "Analog X is out" dialog and a card on the dev log with GitHub's notes and a link. A 404 means no releases yet. Any other failure saves nothing, so the next launch tries again.
- About now says the release list is the only thing Analog ever asks the internet for, and only with the check turned on.
- `lastSeenVersion`, `updateCheckedAt` and `latestRelease` belong to the device, so backups leave them out.

**To ship a release:** bump `expo.version` in `app.json`, add an entry at the top of `RELEASES` (a test fails until you do), set its `date`, then publish a GitHub release tagged `vX.Y.Z`.

**Checked:** 11 Jest tests (versions, what's new, once a day, nothing sent on its own while off, 404/failure, parsing, dates, backups). In the browser at 1300 px and phone width: the page, the toggle, and Check getting GitHub's real "no releases yet" answer. **Not checked:** the "is out" card and dialog against a real release (there isn't one yet), the dialog after a real update, and Android.

---

## 2026-10-29 · Welcome questions and guided tour

Replaces the old one-page `src/app/welcome.tsx` (units, effort scale, health note) with a short wizard and a spotlight tour of the real screens. Built from the onboarding prompt first written for Promodoro, adapted to a training log. Not committed yet.

**Principles kept from the prompt:** every page is skippable, nothing is needed to use the app, answers stay on the device, and sending anything is a separate opt-in that defaults to off. No streaks and no guilt.

### Where it lives

| File | What |
| --- | --- |
| `src/features/onboarding/logic.ts` | Modes, pages, answer options, starter programs, `completeOnboarding`. No React Native, so Jest runs it |
| `src/features/onboarding/survey.ts` | The payload builder, `syncSurvey`, `postJson`, the Settings sharing switch |
| `src/features/onboarding/store.ts` | Which wizard is open, launch check, finishing, the sync runner |
| `src/features/onboarding/Welcome.tsx` | The wizard UI (`OnboardingHost`, mounted in `src/app/_layout.tsx`) |
| `src/features/tour/script.ts` | The tour as data, plus the `{name}` / `{program}` / `{day}` fillers |
| `src/features/tour/store.ts` | The running tour: a module-level store for `useSyncExternalStore` |
| `src/features/tour/host.ts` | Connects the store to the app: navigation, sample database, making programs |
| `src/features/tour/targets.ts` | `tourTarget('id')` and how targets are found and measured |
| `src/features/tour/sample.ts` | Four weeks of sample training, built from today's date |
| `src/features/tour/TourOverlay.tsx` | The spotlight and the note |

### Welcome flow

Shown once settings have loaded, when `onboarded` is false or `onboardingVersion` is below `ONBOARDING_VERSION` (now 1).

| Mode | When | Pages |
| --- | --- | --- |
| `full` | nothing the user made yet | hello, name, uses, heard, setup, consent |
| `returning` | the app has workouts, programs, measurements, photos or custom exercises from before onboarding | name, uses, heard, consent |
| `survey` | "Retake the welcome questions" in Settings | uses, heard, consent |

"User data" doesn't count the bundled exercise library or the default gym (`hasUserData`).

**How anaLOG differs from the prompt**

- **Icons, not emoji.** BRAND §8 rules out emoji, so the value props and every chip use Lucide icons (`OptionIcon` → `ICONS`).
- **The setup page** is "units and effort": kg or lb, RIR or RPE, with a looping demo of the app's best idea: a set gets ticked, its ring closes, it beats last time so the PR stamp lands, and next time's weight arrives with its reason. The demo follows the unit and effort picked above it.
- **The health note moved in.** Finishing (or skipping) sets `disclaimerAccepted`, which the old welcome page used to set.
- **Starter content is programs.** anaLOG has no sample content to swap out, so finishing `full` mode on an empty app only *adds* a starter program per picked use (`USE_STARTER`), in one transaction. "Log my own workouts" adds nothing. "Something else" becomes an empty program named from the user's words, clipped to 24 characters.
- **Closing `returning` counts as done**, so people with data aren't asked again on every launch.
- **Last-page labels:** "Let's go" (full), "Save" (survey), "Done" (returning).
- **Backdrop:** paper for `full`, dimmed for the other two.
- **No welcome reward.** anaLOG has no achievements; finishing the tour only records it in `toursSeen`.

**Answer ids** (stable, they're what gets stored and, with consent, sent):

- uses: `strength | muscle | fitness | program | log | sport | comeback | other`
- heard: `friend | social | reddit | youtube | search | store | shared-page | other`

### Guided tour

Starts when `full` mode finishes without "Skip all". 22 steps in five chapters: Today, Workout, Programs, History, Stats.

- **Targets** come from `tourTarget('id')` spread on a View. In the browser and desktop it's a `data-tour` attribute, and the first match that's actually visible wins. Tab screens left behind stay mounted but `aria-hidden`, so those are ignored. On Android it's a ref measured with `measureInWindow`, keeping only rects inside the window.
- **The spotlight** is a rounded rectangle with 8px padding and a `0 0 0 9999px` shadow. The target is tracked every frame. A target not found within 1.5 s is skipped in the direction the user was going. Backing up past step 0 turns around.
- **Make steps** build a program and then name its first day. The suggestion comes from the first "uses" answer (`USE_SUGGESTION`: muscle → "Hypertrophy block" / "Push day"). A new program already has an empty "Day 1", so naming the day renames that one instead of adding a second. Back passes over make steps that are done, so nothing gets made twice.
- **Sample data:** the workout, History and Stats steps read from a throwaway database (`openScratchDatabase` / `showDatabase`). Writes still go to the user's own database, and the sample is discarded when the tour ends. The sample has 12 sessions over four weeks, a push/pull/legs split with warm-ups, top sets, back-offs, drops and AMRAPs, weights that creep up so later sessions set PRs, bodyweight entries, and a half-done workout for the workout steps. It's seeded from today's date, so the same day always gives the same sample.
- **Ordering bug we hit:** swapping the database before navigating made the screen being left re-read the other database and flash empty. The fix is to navigate first, then swap back to real data one tick later (`showSample` in `host.ts`).
- **Keys:** Esc ends the tour, ← and → step through it (off on make steps), and system Back ends it. Ending it goes to Today.

### Anonymous survey sync

Built and tested against a fake server, but **`SURVEY_URL` is null, so nothing is ever sent.** With no URL:

- the consent page says "All set." and explains that answers never leave the device, with no toggle;
- the "heard" hint says word of mouth is everything instead of "this helps a lot";
- `runSurveySync` returns straight away.

When a URL is set, the payload is `{ v:1, installId, uses, usesOther?, heardFrom, heardOther?, platform, appVersion, answeredOn }`. The date is the day only, and the payload never carries the name. Sync runs on every launch and is idempotent: it sends once, withdraws when sharing is turned off, and treats any failure as "retry next launch". A change made while a request is in flight gets its own pass afterwards. `installId` is created only when the user opts in, and backups leave it out (`src/db/backup.ts`). Turning the URL on also means updating the "no servers" lines in About and in the store listing.

### Tests

`onboarding.test.ts` (12) and `tour.test.ts` (8) cover:

- mode choice;
- starter programs per use and the "something else" program;
- nothing picked keeps the earlier answers;
- existing data left untouched;
- what gets stored when finishing, and no install id without opt-in;
- "Skip all" saving only `onboarded`;
- the payload never containing the name;
- send, withdraw and retry, and changed answers re-sent under the same id;
- backups without the install id;
- skipping steps that point at something never made, filling placeholders, and Back over finished make steps;
- turning around at the start and skipping unreachable targets;
- sample data shown only where it should be, then gone, with real data intact and writes going to the real database.

Also checked by hand in the browser at phone width and at 1300 px: every page, finishing, the whole tour, Esc, and retaking from Settings.

### Not checked yet

- **Android.** Targets are measured but not scrolled to there, and none of it has run on a phone.
- **A real survey endpoint.** There isn't one.

---

## Earlier

From the commit history, oldest first.

| Commit | What |
| --- | --- |
| `8159dd8` | Expo scaffold, brand tokens with the contrast fixes, core domain logic |
| `e8a3063` | Progression engine and adaptive mesocycle algorithm |
| `a5ca917` | Importers, exporters, program sharing, stats |
| `994246a` | Database schema, migrations, repositories |
| `a8cf2f7` | Exercise library seeded from free-exercise-db |
| `427d6a9` | Native Android module, sounds, icons |
| `860a2fa` | Workout and program services, design-system components, starter templates |
| `2495fca` | App shell, workout logger, history, exercise library |
| `bd968e5` | Programs, stats, share cards, settings, gyms, import, backup, kitchen sink |
| `f00cba0` | Web preview of the design system, lazy DB connection, font weights |
| `9a59185` | Docs, build config, permission cleanup |
| `996edd4` | Web build on sql.js, in-app dialogs, prefilled sets |
| `e6d5022` | Desktop layout: the open logbook |
| `83541d7` | Electron desktop shell with a smoke test |
| `3c08c7b` | Docs and scripts for the browser and Windows builds |
| `bb15c43` | `desktop:start` script |
| `e1a7b04` | Faster database queries, debounced desktop saves, tactile press animations |
