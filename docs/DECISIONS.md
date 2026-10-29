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
