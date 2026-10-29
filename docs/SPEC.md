# Analog — Product Spec (v0 draft)

**Analog**: the training log you own. Design and brand language live in [BRAND.md](BRAND.md).

Free, open source, offline-first **Android app** (iOS later from the same codebase). All data on device (SQLite). No account. No servers. Only cost: $25 one-time Google Play fee.

**Stack**
- **Expo (React Native) + TypeScript** — reuses web/JS skills, ships Android now and iOS later without a rewrite. (Alternative if iOS is never wanted: Kotlin + Jetpack Compose + Room.)
- **SQLite** via `expo-sqlite` + **Drizzle ORM** (typed schema, migrations). Relational data suits programs/sets/stats queries.
- **State**: Zustand. **Charts**: Victory Native (Skia). **Share cards**: `react-native-view-shot` → `expo-sharing`.
- **Local notifications**: a small in-repo Kotlin module (`modules/analog-native`) instead of `expo-notifications`, which pulls in Firebase and would block the F-Droid build. It draws the lock-screen countdown with the system chronometer, schedules an exact end-of-rest alarm, and handles −15/+15/skip and the AMTAP Stop button. *(Changed 2026-10-28.)*
- **Health Connect**: `react-native-health-connect` (write workouts, read bodyweight).
- Builds: EAS Build free tier or local `expo prebuild` + Gradle (no cost either way).

**Pillars (in priority order)**
1. **Adaptive volume** — RP-style mesocycles that adjust sets per muscle from your feedback, with the reasoning shown.
2. **Progression engine** — linear, double, RPE/%-based, mesocycles, auto-deload. Rules attach to any exercise in any program.
3. **Unlimited, fully customizable** programs, exercises and set types. Nothing paywalled, ever.
4. **Detailed logging** — rich set types (supersets, back-offs, myo-reps…) with clear visual grouping.
5. **Shareable stats** — images generated on the device with the app's name and URL on them = free marketing.
6. **Your data is yours** — full history forever, import from Strong/Hevy, export CSV/JSON, backup reminders.

---

## 1. Set types

Every set has a `type`. The type decides how it's shown (color/badge), whether it counts toward volume/PRs, and how progression reads it.

| Type | Badge | Counts as working volume | Notes |
|---|---|---|---|
| Warm-up | w (white) | No | Auto-generated ramp from working weight (e.g. 40/60/80%) |
| Feeder / ramp | f (white) | No | Heavy singles working up to a top set |
| Working (straight) | set number (ink) | Yes | Default |
| Top set | T (red) | Yes | Heaviest set; back-offs reference it |
| Back-off | b (blue) | Yes | Linked to a top set: `-X%` load or `+N RPE drop`; auto-calculated weight |
| Drop set | d (yellow) | Yes (1 set for the whole chain by default) | Chain of drops, no rest, auto-suggest −20–30% per drop |
| Mechanical drop | md (yellow) | Yes | Same muscle, easier variation (incline → flat → push-up) |
| Myo-reps | m (yellow) | Yes (activation = 1, each mini-set 0.33) | Activation set + mini-sets of 3–5 reps with 3–5 breaths rest |
| Myo-rep match | mm (yellow) | Yes | Match the activation-set reps across mini-sets |
| Rest-pause | rp (yellow) | Yes | Same weight, 10–20s pauses, logs reps per segment |
| Cluster | c (yellow) | Yes | Intra-set rest (e.g. 4×2 @ 20s) logged as one set with segments |
| AMRAP | + (red) | Yes | As many reps as possible; feeds training-max updates |
| Failure | ! (red) | Yes | Marks 0 RIR explicitly |
| Lengthened partials / partials | +P | Add-on | Extra partial reps after full reps (`8 + 4p`) |
| Forced / assisted reps | +A | Add-on | Spotter reps |
| Negatives / eccentric-only | n (yellow) | Yes | Optional eccentric seconds |
| Isometric / timed hold | set number (ink) | Yes | Time instead of reps. Plain working set in time mode, so it differs from AMTAP by its number, not just colour |
| AMTAP (as much time as possible) | stopwatch glyph (red) | Yes | The time version of AMRAP: hold or work until failure while a stopwatch counts up, and the max time is logged. Feeds time-based progression (see AMTAP details below) |
| Pyramid / reverse pyramid | ▲ / ▼ glyphs (ink) | Yes | Generated pattern of load/reps |
| Wave | ≈ | Yes | e.g. 3-2-1 / 3-2-1 waves |
| EMOM / density block | timer glyph (yellow) | Yes | X reps every minute for N minutes, or max reps in N minutes |
| Technique / practice | t (white) | No | Light skill work |

**Groupings** (span multiple exercises, shown as a colored left rail + label A1/A2/A3):
- Superset (2 exercises, any muscles)
- Antagonist superset (pair hint: push/pull)
- Compound set / pre-exhaust (same muscle back-to-back)
- Tri-set, Giant set (3 / 4+)
- Circuit (rounds, with rest between rounds only)

Rest timer is group-aware: no rest between A1→A2, rest after the last exercise in the group.

Badges and colours follow BRAND §4.5. Plex Mono has no ⏱ ⏲ ▲ ▼, so those are drawn as SVG glyphs. *(Aligned 2026-10-28.)*

**AMTAP details (as much time as possible)**
- **Use cases**: planks, side planks, dead hangs, wall sits, L-sits, hollow holds, farmer's carries for time, static holds at lockout, and loaded holds (weighted plank, plate pinch).
- **Logging flow**: tap Start → big stopwatch counts up (hundredths optional) → tap Stop or set the phone down and tap anywhere. Optional 3-2-1 countdown with a beep so you can get into position. Large tap target, works from the lock-screen notification.
- **Milestone cues**: optional vibration/beep at the target time and at your previous best ("PR pace"), so you know when you're past it without looking.
- **Fields**: time (seconds) · load (optional: added weight, or assistance) · side L/R for unilateral holds · RPE/RIR optional · note.
- **Target display**: "Last: 1:12 · Best: 1:20 · Target: 1:15+".
- **Per-side**: unilateral AMTAP (side plank, single-arm hang) logs L and R separately and flags imbalances > 15%.
- **Within a set**: can combine with reps as "AMRAP within a time cap" or "time to complete N reps" via the EMOM/density type; AMTAP is specifically *open-ended time to failure*.
- **PRs**: longest hold per exercise, per load, and per side; shows on PR share cards ("2:05 dead hang 🏆").
- **Progression** (see §5.1 *Time progression*): add time until the target is reached, then add load or switch to a harder variation.

**Per-set fields** (only the relevant ones show): weight · reps · RIR *or* RPE (user preference) · partial reps · tempo (e.g. `3-1-1-0`) · per-side reps L/R for unilateral · assistance (negative weight) · added weight for bodyweight moves · band tension · time · distance · actual rest taken (auto) · pain flag · note.

---

## 2. Logging features

- **Prior performance inline**: last session's sets shown next to each set, plus today's target from the progression engine ("Target: 82.5kg × 8 @ 2 RIR").
- **One-tap complete**: tap ✓ to accept target values; tap the number to adjust with +/− steppers.
- **Crash-safe**: every set written to SQLite as soon as it's ticked; an interrupted workout resumes on reopen.
- **Rest timer**: starts on set complete, per-exercise default, group-aware, built on timestamps. Ongoing notification with a live countdown + action buttons (−15 / +15 / skip, the same as in the app), and a scheduled local notification + vibration when rest ends, even with the screen locked. Optional keep-screen-on during workouts.
- **Active workout notification**: current exercise and next set on the lock screen; tap to return.
- **Home-screen widget** (later): next workout / streak.
- **Plate calculator** per gym profile (your plate inventory, bar weight, microplates), with rounding.
- **Warm-up generator** from the working weight.
- **Exercise swap** mid-workout with substitutes ranked by muscle overlap; option "swap for rest of mesocycle".
- **Machine settings memory** (seat 4, pad 2) sticky per exercise per gym.
- **Sticky notes** per exercise ("elbows tucked") + per-session notes.
- **Gym profiles**: available equipment, plates, dumbbell increments, units.
- **Reorder / skip / add sets & exercises** while working out; ad-hoc empty workouts.
- **Session data**: duration, bodyweight, session RPE, sleep/stress quick rating (optional, feeds autoregulation).
- **One-handed big buttons**, haptics where supported, dark mode default.

---

## 3. Exercises (unlimited, fully custom)

Fields: name, aliases (for import mapping), **primary muscles (1.0 set credit) and secondary (0.5 default, editable)**, equipment, logging mode (weight×reps / bodyweight±weight / assisted / time / distance / reps only), unilateral flag, bar weight, load increment, default rest, default rep range, video/link, notes, image.

Seed library: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (876 exercises, Unlicense) mapped onto our muscle list by `scripts/exercise-mapping.ts`: shoulders split into front/side/rear delts by movement, forearms and neck into flexors/extensors, obliques pulled out of abdominals, stretches kept without set credit; 67 common lifts hand-checked. Images aren't bundled yet (about 66 MB for all of them). Built-ins can be edited or hidden; edits are stored as an override layer so library updates don't wipe them.

Muscle list (granular enough for volume tracking): chest, front/side/rear delts, triceps, biceps, forearm flexors, forearm extensors, upper back & lats (one group), traps, lower back, abs, obliques, glutes, quads, hamstrings, adductors, abductors, calves, neck flexors, neck extensors.

- **Forearm flexors** (palm side): wrist curls, grip work, hangs, farmer's carries.
- **Forearm extensors** (back of the forearm): reverse wrist curls, reverse curls (also hit the brachioradialis).
- **Neck flexors** (front: sternocleidomastoid, deep neck flexors): forward neck curls, lying face up with the chin tucked toward the chest.
- **Neck extensors** (back: splenius, semispinalis, upper traps): reverse neck curls / neck extensions, lying face down with the head lifted back.
- Optional later: lateral neck flexion (side neck raises) as its own group if users want it.

---

## 4. Programs (unlimited, fully custom)

Hierarchy:
```
Program
 └─ Block / Mesocycle (N weeks, optional deload week, goal: hypertrophy/strength/peaking)
     └─ Week
         └─ Day (named, e.g. "Upper A")
             └─ Slot (exercise or group)
                 ├─ set prescriptions (type, reps/range, RIR/RPE or %, load rule)
                 └─ progression rule
```
- **Template vs instance**: a program is a template; starting it creates a run instance that the engine updates. Restarting = a fresh instance seeded from the last one's ending loads.
- **Week overrides**: any week can override any slot (e.g. week 4 = AMRAP test).
- **Frequency-agnostic**: fixed weekdays or "next day in rotation".
- **Builder UX**: duplicate day/week, drag to reorder, bulk-edit set schemes, preview the whole meso as a grid.
- **Share program**: program serialized + compressed into a deep link / QR code (`app://program?d=...`, falling back to a `.json` file share) → import with one tap, no server. A tiny static landing page on GitHub Pages can catch the link for people without the app and point them to Play Store.
- **Starter templates**: generic, unbranded (e.g. "Upper/Lower 4-day hypertrophy", "Full-body 3-day beginner linear", "Top set + back-off powerbuilding"). Don't copy paid programs or use trademarked program names.

---

## 5. Progression engine

Each slot has one rule. Rules are pure functions: `(prescription, history, feedback, settings) → next targets + explanation string`. Every suggestion shows **why** ("+2.5kg: hit 3×10 at 2 RIR last week").

### 5.1 Rule types
| Rule | Logic |
|---|---|
| **Linear** | Success (all sets hit target reps) → +increment. Fail → repeat. N fails in a row (default 3) → deload by X% (default 10%) and climb again. |
| **Double progression** | Rep range (e.g. 8–12). Add reps until all sets reach the top of the range → +increment, reps reset to the bottom. |
| **Triple progression** | Reps → then sets (up to a max) → then load. |
| **RPE / RIR based** | Target reps @ RPE. Load for next session from e1RM (RPE chart, Tuchscherer-style) of recent sets; rounded to plates. |
| **% of training max** | Week-by-week % waves; AMRAP result updates TM: +increment if reps ≥ the AMRAP prescription + 2 (configurable), hold if within 2 under the prescription, −10% below that. Starting TM is set in the builder. |
| **Time progression (AMTAP / timed holds)** | Time range (e.g. 30–60 s). Each session targets last best + a small step (default +5 s). When every set reaches the top of the range → add load (e.g. +5 kg on a plank) or move to the next variation in a user-defined ladder (plank → long-lever plank → weighted plank), and reset to the bottom of the range. Missing the target 3 times → hold, then −10% time. |
| **Top set + back-offs** | Top set via RPE/linear; back-offs = top set −X% (default 10–15%) or RPE drop. |
| **Meso (adaptive)** | See §6 — load via RIR targets, volume via feedback. |
| **Manual** | No suggestions. |

Settings per rule: increment (per exercise, with microplates), rounding, fail threshold, deload %, min/max reps, cap on weekly load jump.

### 5.2 Deloads
- **Scheduled**: last week of a block.
- **Reactive**: triggered by stall counter (linear), performance drop ≥ X% e1RM over 2 sessions, or adaptive-volume recovery flags (§6).
- **Styles** (selectable): volume deload (≈50% sets, same load), intensity deload (−10–15% load, RIR +3), or both. Default: halve sets, keep load, RIR 4+.

---

## 6. Adaptive volume (RP-style, our own transparent algorithm)

### 6.1 Mesocycle shape
- Length 4–6 weeks + deload (user picks; default 4+1).
- **RIR walks down**: e.g. W1 3 RIR → W2 2 → W3 1 → W4 0–1 → Deload.
- **Volume per muscle starts near MEV** (minimum effective volume) and rises toward MRV (maximum recoverable volume) driven by feedback.
- Volume landmarks per muscle: sensible defaults (e.g. chest MEV 8 / MRV 20 sets/week), editable, and **learned over time** from past mesos (where you hit "too much").

### 6.2 Feedback prompts (fast, skippable, emoji scale)
| When | Question | Scale |
|---|---|---|
| After the last set of an exercise | **Pump** for the target muscle | 0 none · 1 mild · 2 good · 3 great |
| After the last set | **Joint pain** | none · some · a lot |
| After the session, per muscle trained | **Workload** (how hard the volume felt) | easy · just right · pushed my limits · too much |
| First time a muscle is trained the next time | **Soreness / recovery** since last session | never sore · healed well before · healed just in time · still sore |

### 6.3 Weekly volume adjustment (per muscle)
Compute a score from last time each muscle was trained:

```
recovery:  never sore → +1 | healed early → +1 | just in time → 0 | still sore → -2
workload:  easy → +1 | just right → 0 | pushed limits → -1 | too much → -2
pump:      0 → +1 | 1 → +0.5 | 2 → 0 | 3 → 0
performance: reps at target RIR ≥ last week → 0 | dropped → -1

score ≥ 2   → +2 sets
score 1     → +1 set
score 0     → hold   (still +1 in W2 if at MEV, to keep momentum — optional)
score -1..-2 → hold
score ≤ -3  → -1 set, flag "approaching MRV"
two consecutive ≤ -3 or still sore twice → trigger early deload for that muscle (or whole program, setting)
```
- New sets are added to the slot with the best stimulus-to-fatigue (highest recent pump, no pain), spread across days.
- Clamp to [MEV, MRV]; never more than +2 sets/muscle/week; total session sets capped (user setting) — overflow → suggest adding a day or hold.
- **Joint pain "a lot"** → suggest a swap to a substitute for the rest of the meso; "some" twice → same.
- Every change produces an explanation card: *"Quads +1 set (Wed leg extension): healed early + easy workload."*

### 6.4 Load within a meso
Per set target = reps from last week at the new (lower) RIR target. If last week you hit the reps with RIR to spare → +increment; if you missed → hold load, keep reps. After the deload, the next meso starts at ~W1 loads of the last meso + small bump, and volume at a new MEV estimate.

### 6.5 End-of-meso report
Volume per muscle per week (chart), e1RM change per lift, best pump exercises, flagged joint-pain exercises, learned MEV/MRV updates → "Start next meso" with suggestions applied. (Also a share card, §8.)

---

## 7. Stats & analytics
- Full history forever, calendar view, streaks.
- Per exercise: e1RM trend, best set, rep PRs by rep count (1–20RM table), volume load, set history.
- **PR detection**: weight PR, rep PR at weight, e1RM PR, volume PR, longest hold (AMTAP) → PR stamp + share prompt (no confetti, per BRAND).
- Weekly sets per muscle (fractional credit) vs MEV/MRV bands; muscle heatmap body diagram.
- Bodyweight & measurements + progress photos (stored locally only).
- Program adherence %, average session duration, tonnage.

---

## 8. Share cards (free marketing)

Rendered as a React Native view on the device → PNG (`react-native-view-shot`) → Android share sheet (Instagram Stories, etc.) or save to gallery. Every card has the app name + URL watermark.

- **Workout summary**: duration, volume, sets, PRs, muscle heatmap.
- **PR card**: big number, lift, previous best, date.
- **Meso recap**: e1RM gains, volume ramp chart, "survived 5 weeks".
- **Exercise progress**: e1RM line over 3/6/12 months.
- **Monthly / yearly "Wrapped"**: total tonnage ("you lifted 3 blue whales"), top lift, most trained muscle, streaks.
- **Program card**: program preview grid + QR/link that imports it — each share is an install funnel.
- Formats: 9:16 story, 1:1 post, 4:5. Themes: light/dark/colorful. Toggles to hide bodyweight or other numbers.

---

## 9. Data, sync, backup
- SQLite on device (Drizzle migrations; never ship a destructive migration).
- **Android Auto Backup**: the DB is included in the user's own Google Drive device backup for free (≤25 MB, restores on new phone). Checkpoint the SQLite WAL before backup so the copy is consistent.
- **Manual backup**: export a JSON/`.db` file via the system file picker (Storage Access Framework) to Drive/any folder; optional scheduled auto-export to a user-chosen folder.
- **Import**: Strong CSV, Hevy CSV, own JSON. Exercise name mapping UI with aliases.
- **Export**: CSV + full JSON.
- **Health Connect**: write completed workouts (type, duration, calories estimate); read bodyweight.
- **Sync between devices**: not needed for v1 (Auto Backup covers phone moves). If wanted later, reuse the Pomodoro Cloudflare Worker pairing-code approach.

### Core tables (sketch)
```
exercises        id, name, aliases[], muscles{primary[], secondary[]}, equipment, mode, unilateral, increment, barWeight, defaultRest, notes, isCustom, hidden
programs         id, name, blocks[] (weeks → days → slots), createdAt, updatedAt
slots (embedded) id, exerciseId | groupId, sets[{type, reps|range, rir|rpe|pct, loadRule}], progressionRule{type, params}
programRuns      id, programId, startedAt, currentWeek, state{per-slot targets, stall counters, muscle volume plan}
workouts         id, runId?, dayRef?, startedAt, endedAt, bodyweight, sessionRpe, notes, gymId
workoutSets      id, workoutId, exerciseId, groupId?, order, type, weight, reps, rir, rpe, partials, tempo, side, timeSec, distance, restSec, pain, note, completedAt, parentSetId? (back-off/drop chains)
feedback         id, workoutId, muscle, kind(pump|pain|workload|soreness), value, exerciseId?
landmarks        muscle, mev, mav, mrv, learnedFrom[]
gyms             id, name, plates[], barWeights, dbIncrements, equipment[]
measurements     id, date, kind, value
settings         units, rirOrRpe, theme, defaults…
```

---

## 10a. Desktop (Windows .exe) *(added 2026-10-29)*
- **Same app, wide layout.** The web build of the Expo app, wrapped in Electron (MIT). One codebase; Android is unchanged.
- **Storage:** SQLite compiled to WASM (sql.js) in the page; the whole database is written atomically (temp file + rename) to `%APPDATA%/Analog/analog.db` after every write. Same schema and migrations as Android, so a `.json` backup moves between them.
- **No network, no account, no auto-updater.** Links open in the default browser. Updates are new installers from GitHub Releases.
- **Keyboard first:** Enter ticks the focused set, arrows move and change weight, `[ ]` reps, W/R/E/T edit, A adds a set, Shift E adds an exercise, S/−/= control rest, Ctrl Enter finishes, Alt 1–5 switch pages, Ctrl N starts a workout.
- **Builds:** `npm run desktop:build` makes an NSIS installer and a portable .exe (unsigned; see Distribution).
- **Not on desktop:** lock-screen notifications, haptics, Health Connect, progress-photo camera. Rest ends with the in-app ring and bell.

## 10. Build phases
1. **Logging core** — exercises, ad-hoc workouts, set types + groups, rest timer, history, plate/warm-up calc, import/export.
2. **Programs + progression** — builder, templates, linear/double/RPE/%/top-set rules, deloads, share links.
3. **Adaptive meso** — feedback prompts, volume algorithm, explanation cards, meso report, learned landmarks.
4. **Stats + share cards** — PRs, charts, heatmap, card generator, Wrapped.
5. **Polish + reach** — onboarding, Health Connect, widget, Wear OS companion (later), iOS build from the same codebase if demand.

## Distribution (all $0 except Play's one-time $25)
- **Google Play**: new personal developer accounts must run a **closed test with 12+ testers for 14 consecutive days** before production access. Recruit testers from Instagram followers early — doubles as launch hype.
- **GitHub Releases**: signed APK on every release (free, for people who avoid Play).
- **F-Droid / IzzyOnDroid**: great for the FOSS audience. Requires no proprietary dependencies in that build — keep Firebase/Google Play Services out (local notifications don't need them).
- **Obtainium** users can track GitHub Releases directly.
- **Windows:** `Analog-Setup-x.y.z.exe` and a portable `.exe` on GitHub Releases. Unsigned for $0: Windows SmartScreen shows "Windows protected your PC" until the file builds reputation; users click *More info → Run anyway*. A code-signing certificate (paid, roughly $100–400 a year) removes that, so it's a later decision. winget and Scoop manifests are free options once releases exist.

## Glossary
- **AMRAP**: as many reps as possible, a set taken to failure and logged in reps.
- **AMTAP**: as much time as possible, a set taken to failure and logged in time.
- **RIR**: reps in reserve, how many more reps you could have done (0 = failure).
- **RPE**: rate of perceived exertion, on a 1–10 scale (RPE 8 ≈ 2 RIR).
- **e1RM**: estimated one-rep max, calculated from a set's weight, reps and RIR.
- **Training max (TM)**: a working estimate of your max that percentage programs are based on.
- **Mesocycle (meso)**: a training block of several weeks that ends in a deload.
- **Deload**: an easier week with fewer sets or lighter weights so fatigue can drop.
- **MEV / MAV / MRV**: the minimum effective, maximum adaptive and maximum recoverable volume, in weekly sets per muscle.
- **Volume**: the number of hard sets per muscle per week (secondary muscles count as a fraction of a set).

## Decisions (were open questions)
- RIR is the default display, with an RPE toggle in settings.
- Secondary muscles get 0.5 set credit, editable per exercise.
- Adaptive volume tracks each muscle globally (landmarks are global and learned); mesocycle settings are per program.
- ~~Name + brand for the app.~~ Decided: **Analog** (see BRAND.md). Still to do: a trademark/store search before launch.
