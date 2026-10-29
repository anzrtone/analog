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
