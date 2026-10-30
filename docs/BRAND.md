# Analog — Design & Brand Language (v1)

**Analog is the training log you own.** A paper lifting logbook, rebuilt as a free, open-source Android app. Your data lives on your phone and nothing leaves it unless you opt in, nothing is paywalled, and every number means something.

The look comes from two things every lifter already knows: **the paper training log** (cream page, ruled rows, ink, stamps) and **the bumper plate** (red, blue, yellow, green, white). The page stays calm and inky; plate colors are the only color, and they always carry meaning.

---

## 1. Brand idea

### The story
Fitness apps got loud: feeds, streak guilt, AI coaches, paywalls on your own history. Analog goes back to what a lifter's notebook always did well: write down what you lifted, see what to do next, and own the page. Then it adds what paper can't do: adaptive volume, progression rules and stats.

### Personality
| Analog is | Analog is not |
|---|---|
| Honest: shows the reasoning behind every suggestion | Hype, "crush it", motivational shouting |
| Precise: numbers line up, units are exact | Vague "AI-powered" magic |
| Gym-floor: speaks lifter (RIR, top set, back-off) | Clinical or corporate |
| Calm: one color at a time, lots of paper | Neon, gradients, confetti everywhere |
| Generous: everything free, forever | Upsells, locks, "Pro" badges |

### Taglines (pick one per context)
- **The training log you own.** (primary)
- Free. Private. Yours.
- Write it down. Lift more.
- No paywalls between you and your PRs.

### Name usage
- Always **Analog**, capitalized, one word. Never "ANALOG", "Analog App", "AnalogFit".
- In running text it's just "Analog", with no "the".
- Package id suggestion: `app.analoglog` / `io.github.<you>.analog`.

---

## 2. Voice and tone

**Write like a good training partner with a notebook:** short, specific, and on your side.

- **Plain lifter language.** "Add 2.5 kg next time" beats "Optimize progressive overload."
- **Always say why.** "+1 set for quads: you healed early and the workload felt easy."
- **No shame, no guilt.** Missed sessions are just blank pages. Never "You broke your streak!"
- **Numbers before adjectives.** "32.5 × 8, up from 30 × 8" beats "Amazing progress!"
- **Sentence case** everywhere. Contractions are fine. Save exclamation marks for real PRs only.

| Situation | Do | Don't |
|---|---|---|
| PR | "New PR: 32.5 × 8 (prev 30 × 8)" | "INCREDIBLE!!! You're a beast 💪" |
| Missed target | "Hold 82.5 kg next week. Reps dropped from 8 to 6." | "You failed your set." |
| Deload | "Deload week. Half the sets, same weights. You've earned it." | "Take it easy, champ!" |
| Empty history | "Blank page. Start your first workout." | "Nothing here yet :(" |
| Backup reminder | "It's been 14 days since your last backup. Save a copy?" | "WARNING: you may lose data!" |
| Feature request | "Analog is free and open source. Suggest it on GitHub." | "Upgrade to unlock." |

---

## 3. Logo and app icon

### Concept: the plate O
The wordmark is **"Analog"** set in the serif (see §5), with the **"o" replaced by a red plate ring** seen from the front, with a hole in the middle. The ring is the brand's one mark, and it reappears as set badges, the rest timer and the share-card hero.

```
  A n a l [◯] g        ← red ring, ink center hole
```

### App icon (Android adaptive icon)
- **Foreground**: a single red plate ring (`#D93F3C`) with a small navy center hole (`#23324A`), stroke ≈ 22% of the ring's diameter.
- **Background**: Paper cream (`#F6F1E7`).
- **Monochrome layer** (Android 13+ themed icons): the ring alone as a solid shape.
- Safe zone: keep the ring inside the central 66 dp of the 108 dp canvas.
- No text and no barbell in the icon. The ring alone stays readable at 48 px.

### Clear space and minimum size
- Clear space around the wordmark = the height of the ring.
- Minimum wordmark width: 80 dp on screen, 25 mm in print.

### Don't
- Recolor the ring anything but plate red (white or ink only on photos).
- Add shadows, gradients or 3D to the plate.
- Stretch, outline or rotate the wordmark.

---

## 4. Color

### 4.1 Principles
1. **Ink and paper by default.** Most of the UI is navy ink on cream (or chalk on carbon).
2. **Plate colors carry meaning, never decoration.** If something is colored, it should say something.
3. **One plate color per element.** A set badge is one ring and one color.
4. **Never color alone.** Every colored thing also has a letter, a pattern (solid/dashed) or a label (see §12).

### 4.2 Paper theme (light)
| Token | Hex | Use |
|---|---|---|
| `paper` | `#F6F1E7` | App background (the page) |
| `paper-raised` | `#FBF8F1` | Sheets, cards, the open workout |
| `paper-sunk` | `#EDE6D6` | Inputs, pressed rows, inactive tabs |
| `rule` | `#D9D1BF` | Ruled lines, dividers |
| `ink` | `#23324A` | Primary text, numbers, icons |
| `ink-2` | `#4F5A6E` | Secondary text |
| `pencil` | `#69665E` | Hints, metadata, last-time values, engine targets |
| `erased` | `#A9A496` | Disabled controls only (below AA on purpose; WCAG exempts disabled UI) |

### 4.3 Carbon theme (dark)
| Token | Hex | Use |
|---|---|---|
| `paper` | `#17181C` | App background |
| `paper-raised` | `#1F2025` | Sheets, cards |
| `paper-sunk` | `#121316` | Inputs, pressed rows |
| `rule` | `#2C2D33` | Ruled lines, dividers |
| `ink` | `#ECE6D8` | Primary text (chalk) |
| `ink-2` | `#BDB7A9` | Secondary text |
| `pencil` | `#8C8A82` | Hints, metadata |
| `erased` | `#5A5852` | Disabled controls only |

Carbon is the default theme in the gym (dim rooms, battery). Paper is the default for share cards.

### 4.4 Plate palette
Based on the competition bumper-plate colors. Each plate has a **ring** value for strokes and fills, and an **ink** value for text, both tuned per theme.

| Plate | Ring (Paper) | Text (Paper) | Ring (Carbon) | Text (Carbon) | Means |
|---|---|---|---|---|---|
| **Red** (25 kg) | `#D93F3C` | `#A32D2D` | `#E8615E` | `#F4A09D` | Max effort: top sets, AMRAP, AMTAP, failure, PRs |
| **Blue** (20 kg) | `#2F7BD0` | `#185FA5` | `#4F93DE` | `#93BDEE` | Linked work: back-off sets, supersets, programs |
| **Yellow** (15 kg) | `#B17618` | `#8A5A0C` | `#F0A93A` | `#F6C878` | Time and techniques: rest timer, drop sets, myo-reps, rest-pause, clusters, partials |
| **Green** (10 kg) | `#3E8E3A` | `#2C6B28` | `#5AAE55` | `#9AD394` | Growth and recovery: volume added, deloads, healed well, completed weeks |
| **White** (5 kg) | `#858274` | `#67655E` | `#6D6C68` | `#A8A59C` | Light work: warm-ups, feeder sets, technique sets |

*Contrast fixes (2026-10-28), checked by `src/theme/tokens.test.ts` against paper, paper-raised and paper-sunk: Paper pencil #7D7A70 → #69665E, Paper white text #6E6C64 → #67655E, Paper yellow ring #E0961F → #B17618, Paper white ring #B4B2A9 → #858274, Carbon pencil #85827A → #8C8A82, Carbon white ring #5F5E5A → #6D6C68.*

Plain working sets use an **ink** ring, the default "pen" color. They're the most common set, so they stay neutral.

**Danger** (delete, pain flag "a lot") uses red *text with no ring* plus an icon, so it never looks like a PR.

### 4.5 Set type → color map
| Set type | Ring | Letter |
|---|---|---|
| Warm-up, feeder, technique | White | `w` `f` `t` |
| Working (straight) | Ink | set number `1` `2` `3` |
| Top set | Red | `T` |
| AMRAP | Red | `+` |
| AMTAP | Red | `⏱` |
| Failure | Red | `!` |
| Back-off | Blue | `b` |
| Drop set, mechanical drop | Yellow | `d` `md` |
| Myo-reps, myo-rep match | Yellow | `m` `mm` |
| Rest-pause, cluster | Yellow | `rp` `c` |
| Pyramid, wave | Ink | `▲` `▼` `≈` |
| EMOM, density | Yellow | `⏲` |
| Negatives | Yellow | `n` |
| Timed hold (isometric) | Ink | set number |
| Partials, forced (add-ons) | Same ring as the parent set + small suffix (`+4p`, `+2a`) | — |

Groupings (supersets, tri-sets, giant sets, circuits) use a **blue left rail** with labels `A1 A2 A3` in the margin, like a note written beside the page.

### 4.6 Data viz
- Lines and bars are drawn in **ink**; only the thing being highlighted gets a plate color (e.g. the current week in green, a PR point in red).
- Volume bands (MEV → MRV): a pale `paper-sunk` band with ink tick marks at MEV and MRV. Green fill under MEV→MAV, yellow MAV→MRV, red past MRV.
- Muscle heatmap: one hue (red) with 5 steps of opacity on a pencil-outline body. Never a rainbow.

---

## 5. Typography

Three typefaces, each with one job. All are free under the SIL Open Font License and get bundled in the app (no network fonts).

| Role | Typeface | Used for |
|---|---|---|
| **Title (voice)** | **Newsreader** (serif) | Exercise names, program names, screen titles, share-card headlines |
| **Numbers (data)** | **IBM Plex Mono** | Every weight, rep, time, RIR, date and stat. Always tabular. |
| **Interface** | **Inter** | Buttons, settings, body copy, labels, onboarding |

### Type scale (dp / sp)
| Style | Font | Size / line | Weight |
|---|---|---|---|
| Display (share cards, PR) | Plex Mono | 48 / 52 | 500 |
| Title L (screen title) | Newsreader | 28 / 34 | 500 |
| Title M (exercise name) | Newsreader | 20 / 26 | 500 |
| Number L (current set) | Plex Mono | 20 / 24 | 500 |
| Number M (set rows) | Plex Mono | 16 / 20 | 400 |
| Body | Inter | 15 / 22 | 400 |
| Label | Inter | 13 / 18 | 500 |
| Meta (headers, eyebrow) | Plex Mono | 11 / 14 | 400, UPPERCASE, +6% tracking |

### Rules
- **Every number is monospaced with tabular figures** so set columns line up as you scroll.
- Use a real multiplication sign: `32.5 × 8`, never `32.5x8`. Plex Mono has no thin space, so numbers use plain spaces (in a monospace face they line up anyway).
- Plex Mono also lacks ⏱ ⏲ ▲ ▼; those badges are drawn as SVG glyphs at the ink stroke weight.
- Units come after the number in `pencil` color: `32.5 kg`.
- Times use `m:ss` (`1:24`); long durations use `1 h 12 m`.
- Meta lines read like a log header: `PUSH A — W3/5 — 1 RIR`.
- The only UPPERCASE is in meta lines and stamps.
- Respect Android font scaling up to 200%. Set rows wrap and never truncate numbers.

---

## 6. Layout and shape

- **Grid**: 4 dp base, 8 dp rhythm, 16 dp side margins.
- **The ruled row**: set rows are 48 dp tall (the minimum touch target) with a 1 dp `rule` line underneath, like notebook lines. No boxes around rows.
- **Columns** in a set row: `ring (32) | previous (pencil) | weight | reps | RIR | ✓ (48)`.
- **Corners**: sheets and cards 16 dp; buttons and inputs 10 dp; rings and timers are circles.
- **Elevation**: none. Depth comes from paper tones (`paper-sunk` < `paper` < `paper-raised`), not shadows.
- **Dashed lines mean "not yet / editable"**: pending sets, the rest timer box, drop zones in the program builder, editable targets.
- **Solid lines mean "done / fixed"**.
- **Margins as annotations**: group labels (A1/A2), notes and engine explanations sit in the left or right margin in `pencil`, like notes written in a book.

---

### Wide screens: the open logbook *(added 2026-10-29)*
From 1000 px the app opens like a logbook spread instead of stretching the phone layout:
- **Spine** (left, `paper-sunk`): wordmark, the running workout (dashed ring, yellow while resting), navigation with Alt-key hints, the running program in a blue margin note, and where the data is saved. Folds to icons below 1280 px.
- **Page** (centre): the same ruled rows at a readable width (about 820–880 px), with column headings `SET · PREVIOUS · WEIGHT · REPS · RIR`. The set the keyboard acts on has an ink bar in the margin.
- **Margin** (right, `paper-sunk`): elapsed time, the rest ring at full size, the next set with its plates drawn, the engine's note, the one primary button, and a key-cap list of shortcuts.
- **Session outline** (left of the page, from 1360 px): every exercise with a progress ring.
- Sheets become centred cards. History and Today use two pages (list and detail; plan and this week).
- Same tokens, type and rules as the phone: nothing new is coloured, still one primary button per screen.

## 7. Components

### Plate ring (set badge)
- 24 dp circle, 3 dp stroke, letter centered (Plex Mono 11 sp, plate text color).
- **Solid** stroke = completed. **Dashed** stroke (4 on, 3 off) = upcoming. **Half ring** = in progress (for timed sets and AMTAP).
- Tapping the ring opens the set-type picker.

### Set row
- Left: plate ring. Then the previous performance in `pencil` (`30 × 8`), today's weight and reps in `ink`, RIR, and a 48 dp check.
- Completed row: values go solid ink, ring fills in, check turns the plate color.
- Engine target: shown in `pencil` with a dashed underline (dashed = editable) until confirmed. Tap the ✓ to accept. (`erased` failed AA for information people need.)
- Linked back-offs show a thin blue connector from the top-set ring.

### Stamp
The brand's moment of celebration. A rotated (−4°) rectangular outline, 1.5 dp stroke, Plex Mono UPPERCASE text, in the plate text color.
- `PR` (red), `DELOAD` (green), `MESO DONE` (green), `NEW MAX VOLUME` (green), `FAILED` (white/pencil, only when the user marks it).
- Lands with a quick scale 1.15 → 1.0 and a heavy haptic tap (see §9).

### Rest timer
- A plate ring that **empties** clockwise as rest runs down, in yellow, with `m:ss` in Plex Mono in the center.
- Sits in a dashed box at the bottom: `rest · next 27.5 × 10`. Buttons: `−15`, `+15`, `skip`.
- The ongoing notification uses the same ring as its large icon.

### Feedback prompts (adaptive volume)
- One question per card, serif question text ("How was the pump in your chest?").
- Answers are **four rings that fill from 0 to 3** rather than emoji: empty, quarter, half, full. Tap one and move on.
- Skip is always visible and never nags.

### Engine explanation
- A margin note in `pencil` under the exercise title: "+2.5 kg · hit 3 × 10 at 2 RIR last week". Tap it to see the full rule.

### Buttons
- **Primary**: solid ink fill, paper text, 10 dp radius. One per screen ("Finish workout").
- **Secondary**: 1 dp ink outline, no fill.
- **Ghost**: text only, in `ink-2`.
- No colored buttons. Plate colors are for meaning, not actions.

### Program builder
- Each week is a page; each day is a column of ruled rows.
- Drop zones and empty slots use dashed outlines.
- The meso preview is a grid of small rings (sets per muscle per week) that grows greener as volume ramps up.

### Empty states
A blank ruled page with one line of serif text and a single primary button. For example, "Blank page. Start your first workout."

---

## 8. Iconography

- **Base set**: Lucide (ISC license) at a 1.75 dp stroke, which matches the ink weight of the ruled lines. Outline only.
- **Custom glyphs** (drawn in the same stroke): plate ring, barbell, dumbbell, plate stack, stamp, logbook, timer ring, RIR gauge.
- Icons are `ink` or `pencil`. They only take a plate color when they *are* that meaning (e.g. the timer icon is yellow while resting).

---

## 9. Motion, haptics and sound

### Motion: "ink and paper"
| Moment | Motion | Duration |
|---|---|---|
| Set completed | Ring stroke draws closed like a pen circle, row ink darkens | 220 ms, ease-out |
| PR | Stamp drops in (scale 1.15 → 1, slight rotation settle) | 180 ms |
| Next week / page | Content slides with a slight page-turn (horizontal) | 260 ms |
| Rest timer | Ring empties continuously; last 3 s pulse once per second | linear |
| Sheet open | Rises from the bottom like pulling a page out | 240 ms |

- No bouncing, no confetti, no parallax.
- Honor Android "remove animations": swap to instant changes and fades.

### Haptics
- Set completed: light tick.
- Rest over: two medium pulses (plus a sound if enabled).
- PR stamp: one heavy tap.
- Errors: none. Problems show as text, not buzzes.

### Sound (optional, off by default except the rest timer)
- Rest over: a short bell-like tone.
- Set completed: a soft pencil tick.
- PR: a plate clank.
- Sounds are synthesized or CC0, are under 300 ms, and follow the media volume.

---

## 10. Share cards (marketing)

Share cards are **a page torn out of the log**: Paper background, ruled lines, serif headline, Plex Mono numbers, and one big plate ring as the hero.

### Anatomy
```
┌────────────────────────────┐
│ OCT 28 · PUSH A            │  meta line (Plex Mono, pencil)
│ New PR                     │  headline (Newsreader)
│                            │
│          ◯ 32.5            │  hero ring in the plate color + number
│     × 8 · incline DB press │
│        prev 30 × 8         │
│                            │
│ ─────────────────────────  │  rule
│ Analog   free · open source│  footer: wordmark + URL/QR
└────────────────────────────┘
```

### Templates
| Card | Hero | Plate color |
|---|---|---|
| PR | The weight × reps inside a ring | Red |
| Workout summary | A ruled mini-log of every set + duration and volume | Ink, rings in set colors |
| Meso recap | Volume ramp as rings by week + e1RM changes | Green |
| Exercise progress | e1RM line in ink with PR dots | Red dots |
| Wrapped (month or year) | Total tonnage in Display size + a fun comparison | Ink + one plate |
| Program card | Week grid + QR code that imports the program | Blue |

### Rules
- Sizes: 1080 × 1920 (story), 1080 × 1080 (post), 1080 × 1350 (4:5).
- Paper theme by default (stands out in dark feeds), with a Carbon option.
- Keep everything inside a 120 px inset on stories (clear of Instagram UI).
- The footer always shows the wordmark and "free · open source", plus a link or QR.
- Toggles for hiding bodyweight, exact weights (show % change instead) and dates.
- An optional faint paper grain is allowed on cards **only**, not in the app UI.

---

## 11. Store and social presence

- **Play Store icon**: the app icon on Paper.
- **Feature graphic**: the wordmark on Paper with a row of five plate rings (red, blue, yellow, green, white).
- **Screenshots**: Paper theme, with one plain caption each in Newsreader above the phone: "Every set, every PR, forever free", "Volume that adapts to you", "Progression rules that explain themselves", "Your data stays yours: nothing leaves your phone unless you opt in".
- **Instagram grid**: alternate share-card posts with build-in-public posts on the same cream background, so the feed reads as one logbook.
- **Reels**: open on a real paper log page turning into the app screen. That's the brand story in two seconds.

---

## 12. Accessibility

- **Contrast**: text meets WCAG AA (4.5:1) on its background. Plate *text* values are the darker (Paper) or lighter (Carbon) variants for this reason. Rings are graphics (3:1 minimum).
- **Never color alone**: every ring has a letter, every state has solid vs. dashed, and stamps contain words.
- **Color-blind check**: red vs. green never appear as the only difference. Top sets (`T`) and deloads (`DELOAD` stamp) differ in letter and shape.
- **Touch**: 48 dp minimum targets. The ✓ and steppers are 48 dp even when the row looks tighter.
- **One-handed**: primary actions sit in the bottom third of the screen.
- **Screen readers**: rings read as "Top set, completed, 32.5 kilograms, 8 reps, 2 reps in reserve".
- **Font scaling** up to 200% without cutting off numbers.

---

## 13. Do and don't

| Do | Don't |
|---|---|
| Use plate colors only to say something | Color things just to make them pop |
| Keep numbers in Plex Mono, aligned | Mix proportional and mono digits |
| Use dashed for pending, solid for done | Use dashes as decoration |
| Celebrate with a stamp | Use confetti, fireworks or trophies |
| Show the reasoning in a margin note | Hide logic behind "smart" labels |
| Use ruled lines | Box every row in a card |
| Give one primary button per screen | Use colored or multiple primary buttons |
| Keep the page calm | Add gradients, glows, shadows or neon |

---

## 14. Implementation tokens (CSS variables and Tailwind) *(rewritten 2026-10-29 for Analog 0.2.0)*

Every colour is a CSS custom property on `<html>` holding space-separated RGB channels, so Tailwind's opacity modifiers work (`bg-ink/40`) and the theme swaps by setting `data-theme="carbon"` or `data-theme="paper"` (System picks one from `prefers-color-scheme`). The values live in `src/styles/index.css`. `src/theme/tokens.ts` keeps the same values as hex for the contrast test, share cards and the canvas; `tests/theme-css.test.ts` fails if the two drift apart, and `src/theme/tokens.test.ts` fails if any text token drops below 4.5:1 or a ring below 3:1 on any surface.

```css
/* src/styles/index.css: Carbon is the default */
:root[data-theme='carbon'] {
  --paper: 23 24 28;        /* #17181C */  --paper-raised: 31 32 37;  /* #1F2025 */
  --paper-sunk: 18 19 22;   /* #121316 */  --rule: 44 45 51;          /* #2C2D33 */
  --ink: 236 230 216;       /* #ECE6D8 */  --ink-2: 189 183 169;      /* #BDB7A9 */
  --pencil: 140 138 130;    /* #8C8A82 */  --erased: 90 88 82;        /* #5A5852 */
  --red-ring: 232 97 94;    /* #E8615E */  --red-text: 244 160 157;   /* #F4A09D */
  --blue-ring: 79 147 222;  /* #4F93DE */  --blue-text: 147 189 238;  /* #93BDEE */
  --yellow-ring: 240 169 58;/* #F0A93A */  --yellow-text: 246 200 120;/* #F6C878 */
  --green-ring: 90 174 85;  /* #5AAE55 */  --green-text: 154 211 148; /* #9AD394 */
  --white-ring: 109 108 104;/* #6D6C68 */  --white-text: 168 165 156; /* #A8A59C */
}
:root[data-theme='paper'] {
  --paper: 246 241 231;     /* #F6F1E7 */  --paper-raised: 251 248 241;/* #FBF8F1 */
  --paper-sunk: 237 230 214;/* #EDE6D6 */  --rule: 217 209 191;       /* #D9D1BF */
  --ink: 35 50 74;          /* #23324A */  --ink-2: 79 90 110;        /* #4F5A6E */
  --pencil: 105 102 94;     /* #69665E */  --erased: 169 164 150;     /* #A9A496 */
  --red-ring: 217 63 60;    /* #D93F3C */  --red-text: 163 45 45;     /* #A32D2D */
  --blue-ring: 47 123 208;  /* #2F7BD0 */  --blue-text: 24 95 165;    /* #185FA5 */
  --yellow-ring: 177 118 24;/* #B17618 */  --yellow-text: 138 90 12;  /* #8A5A0C */
  --green-ring: 62 142 58;  /* #3E8E3A */  --green-text: 44 107 40;   /* #2C6B28 */
  --white-ring: 133 130 116;/* #858274 */  --white-text: 103 101 94;  /* #67655E */
}
```

The AA contrast fixes from 2026-10-28 are kept: Paper pencil `#69665E`, Paper white text `#67655E`, Paper yellow ring `#B17618`, Paper white ring `#858274`, Carbon pencil `#8C8A82`, Carbon white ring `#6D6C68`. `erased` stays below AA on purpose (disabled controls only).

**Tailwind** (`tailwind.config.js`) replaces the default palette with these tokens only, so nothing off-brand can be used:

| Class | Token |
|---|---|
| `bg-paper` `bg-raised` `bg-sunk` | `paper`, `paper-raised`, `paper-sunk` |
| `border-rule` `bg-rule` | `rule` |
| `text-ink` `text-ink2` `text-pencil` `text-erased` | `ink`, `ink-2`, `pencil`, `erased` |
| `text-red-text` `border-red-ring` (and `blue`, `yellow`, `green`, `white`) | plate text and ring |

**Type** (`src/styles/index.css`, `@layer components`), all fonts bundled with `@fontsource` (Newsreader 500, IBM Plex Mono 400/500, Inter 400/500):

| Class | Style |
|---|---|
| `.t-display` | Plex Mono 48/52, 500, tabular |
| `.t-title-l` | Newsreader 28/34, 500 |
| `.t-title-m` | Newsreader 20/26, 500 |
| `.t-num-l` | Plex Mono 20/24, 500, tabular |
| `.t-num-m` | Plex Mono 16/20, 400, tabular |
| `.t-body` | Inter 15/22, 400 |
| `.t-label` | Inter 13/18, 500 |
| `.t-meta` | Plex Mono 11/14, 400, uppercase, +6% tracking |

**Shape and motion:** `rounded-sheet` (16 px), `rounded-control` (10 px), `min-h-row` and `min-h-touch` (48 px), `px-margin` (16 px). Animations: `animate-sheet-up` (240 ms), `animate-stamp` (180 ms, 1.15 → 1 with the −4° settle), `animate-page-in` (260 ms), the ring's pen-circle draw (`ring-draw`, 220 ms). `prefers-reduced-motion` swaps every animation for an instant change.

**Buttons:** `.btn-primary` (solid ink, paper text, one per screen), `.btn-secondary` (1 px ink outline), `.btn-ghost` (text only, `ink-2`), `.btn-danger` (red text, no ring). No coloured buttons.

**Set type → ring colour** comes from the engine's registry (`src/engine/setTypes.ts`), unchanged from §4.5. Rings in the app use `ringVar()` from `src/theme/tokens.ts` (`rgb(var(--red-ring))` and so on), so they follow the theme without re-rendering.
