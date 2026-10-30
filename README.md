# Analog

**The training log you own.** A free, open-source, offline-first workout tracker that looks like a paper lifting logbook. Android and Windows. No account, no servers, no ads, no tracking, nothing paywalled.

- Adaptive volume: mesocycles that change weekly sets per muscle from your pump, joint, workload and recovery feedback, with the reason for every change shown.
- A progression engine that explains itself: linear, double, triple, RIR-based, % of training max, top set + back-offs, time progression for holds, scheduled and reactive deloads.
- 21 set types including AMRAP and AMTAP (time to failure), supersets, tri-sets, giant sets and circuits.
- Unlimited programs and exercises. 876 built-in exercises from free-exercise-db.
- A rest timer on the lock screen with −15 / +15 / Skip, and a bell that rings on time with the screen off.
- Share cards, program links and QR codes. Strong and Hevy import. JSON and CSV export. Automatic daily backups.

The product spec and design language live in [docs/SPEC.md](docs/SPEC.md) and [docs/BRAND.md](docs/BRAND.md). They are the source of truth. What changed in 0.2.0 and why: [docs/DEVLOG.md](docs/DEVLOG.md) and [docs/DECISIONS.md](docs/DECISIONS.md).

## Status

See [docs/STATUS.md](docs/STATUS.md) for what is tested, what isn't, and what's left. Short version: the engine, database and flows are covered by Vitest; every screen has been walked in a browser at phone and desktop widths in both themes; the Android project syncs and the Windows shell compiles. The APK and the Windows installers are built by CI.

## Stack

Vite, React 18, TypeScript, Tailwind CSS, Dexie (IndexedDB), Vitest. Android through Capacitor 8, Windows through Tauri 2. One web app in `src/`, two thin native shells in `android/` and `src-tauri/`.

## Run it

You need Node 20+ (22 in CI).

```bash
npm install
npm run dev
```

The app opens at http://localhost:1420. It runs fully in the browser: the data lives in the browser's IndexedDB, and wide windows get the desktop layout. Development builds add the admin console and the kitchen sink under More.

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Android

You need JDK 21 and the Android SDK (Android Studio's SDK Manager: Platform 36 and the build tools; set `ANDROID_HOME`).

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

The APK lands in `android/app/build/outputs/apk/debug/`. `npm run android:open` opens the project in Android Studio.

A release APK needs your own signing key: put `storeFile`, `storePassword`, `keyAlias` and `keyPassword` in `android/keystore.properties` (never committed), or set `ANALOG_KEYSTORE`, `ANALOG_KEYSTORE_PASSWORD`, `ANALOG_KEY_ALIAS` and `ANALOG_KEY_PASSWORD`, then `./gradlew assembleRelease`. `ANALOG_VERSION_NAME` and `ANALOG_VERSION_CODE` set the version (CI fills them in from package.json and the run number).

The launcher icons and splash are drawn from `assets/*.png` by `scripts/android-res.ps1`.

## Windows

You need Rust (stable) and the WebView2 runtime (built into Windows 10 and 11).

```bash
npm run desktop:dev
npm run desktop:build
```

`desktop:build` makes the NSIS installer and the .msi under `src-tauri/target/release/bundle/`, and `src-tauri/target/release/analog.exe` runs as a portable app. Automatic backups go to `Documents\Analog Backups`. The .exe is unsigned, so SmartScreen warns on first run (*More info → Run anyway*).

If drive C: is short on space, point the temporary folders at another drive first (PowerShell):

```powershell
$env:TEMP="D:\tmp"; $env:TMP="D:\tmp"; $env:npm_config_cache="D:\tmp\npm"
```

## Release

CI (`.github/workflows/build.yml`) runs typecheck, lint, tests and the web build on every push and pull request, then builds the Windows installers and the APK. To publish a release:

1. Bump `version` in `package.json`.
2. Add the release at the top of `RELEASES` in `src/features/devlog/releases.ts` (a test fails until you do) and give it a `date`.
3. Commit, tag `vX.Y.Z` and push the tag. CI attaches the installers, the portable .exe, the APK and `SHA256SUMS.txt` to a GitHub release.

For a signed APK, add these repository secrets: `ANDROID_KEYSTORE_BASE64` (the keystore, base64), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Without them CI builds a debug-signed APK and says so in a warning.

## Layout

```
src/engine/      pure logic carried over from 0.1.0: progression/, meso/, math/, import/, prs/, stats/, timer/, volume/
src/db/          Dexie schema, repositories, backup, importer, the tour's sample database
src/services/    workout and program flows (engine ↔ database)
src/features/    navigation, state, timers, automatic backups, share cards, welcome, tour, dev log
src/screens/     one file per screen
src/components/  design system (PlateRing, SetRow, Stamp, RestTimer, sheets, charts, …)
src/platform/    the bridge: android.ts (Capacitor), desktop.ts (Tauri), dev.ts (browser)
src/theme/       tokens from BRAND.md §14, Paper and Carbon
android/         Capacitor project; app/src/main/java/app/analoglog/ holds the rest-timer plugin
src-tauri/       Tauri shell: files.rs writes exports and backups
scripts/         browse.mjs (headless Edge for screenshots), walks/, android-res.ps1
```

## Privacy

Everything is stored on your device, in the app's own IndexedDB. Analog sends nothing anywhere. The one network request it can make is to GitHub's public release list, and only when you press **Check** on the dev log or turn on the daily check (off by default); it carries no cookies, no referrer and nothing about you. The welcome questions stay on the device. Progress photos stay out of backups.

## Licences

Analog is free software, licensed under the [GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`). Copyright (c) 2026 The Analog contributors. Every source file carries an SPDX header. If you modify Analog and run it as a network service, or distribute it, you must offer your users the corresponding source under the same licence (AGPL §13). The in-app About screen links to the source. Exercise data: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense). Fonts: Newsreader, IBM Plex Mono, Inter (SIL OFL 1.1). Icons: Lucide (ISC). Every runtime dependency is MIT, Apache-2.0, BSD or ISC.

Analog is a training log, not medical advice.
