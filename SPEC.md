# AnyGym: product spec (source of truth)

One line pitch: **your training keeps working in any gym.** Full gym at home, a hotel gym with dumbbells to 50, or no equipment at all. You tell AnyGym where you are and how much time you have, it builds the session, shows exact form, and tells you what to beat from last time.

Owner: G (rabahharchaoui-design). Audience: everyone (all goals and levels), with travelers as the sharpest wedge. Ships as an installable iPhone Home Screen web app on GitHub Pages, like Pocket Sim.

## 0. Non negotiables

1. **No bad data.** Wrong form demos, wrong muscles, or wrong weight math are the worst bugs this app can have. When the app is not sure, it says so instead of guessing (see 4.3 and 6).
2. **Plate math is exact.** Every number the plate diagram shows must equal the sum of what is drawn. Covered by exhaustive unit tests.
3. **Never cluttered.** One primary action per screen. Detail lives one tap away in a sheet. Big thumb targets (min 48pt), one hand use, portrait.
4. **Offline first.** Gym basements have no signal. Everything works offline after first load.
5. **User data never leaves the phone** in this version. No analytics, no camera. Location is used only by Run With Me (section 12), only while a run is active, and routes are stored only on the phone.
6. **This repo is public.** Never commit personal data, history files, tokens, or anything from `~/anygym-private/`.

## 1. Stack

- Vite + React 18 + TypeScript, `motion` (Framer Motion) for animation, Dexie (IndexedDB) for storage, `vite-plugin-pwa` (Workbox) for offline and install.
- HashRouter (GitHub Pages has no server rewrites). `base: '/anygym/'` in vite config.
- Deploy: GitHub Actions workflow builds `dist` and publishes to GitHub Pages (`actions/deploy-pages`). Repo: `rabahharchaoui-design/anygym`, public. Live URL: `https://rabahharchaoui-design.github.io/anygym/`.
- Tests: Vitest for logic, Playwright for UI using the WebKit engine with the iPhone 15 Pro device profile (portrait).
- Styling: CSS modules or vanilla CSS with design tokens (no Tailwind needed). Use the frontend-design skill when shaping visuals.
- Manifest: name "AnyGym", short_name "AnyGym", display standalone, theme and background `#000000`, portrait. Proper apple-touch-icon 180px and maskable icons 192/512. Icon: a bold, simple mark (a plate seen edge on forming an "A", or similar). No brand or third party logos.
- Screen Wake Lock during an active workout (feature detect, silent fallback).

## 2. Data model (Dexie)

- `profile`: name (optional), goal, level, daysPerWeek, defaultUnit, createdAt.
- `gyms`: id, name ("Life Time", "Hotel", "Home"), type (`full` | `hotel` | `home` | `none`), unit (`lb` | `kg`), equipment (see 3), bars, plateInventory, dumbbellRange, isActive.
- `exercises`: the curated catalog (static JSON shipped with the app, not user editable in v1).
- `plans` and `planDays`: curated or generated.
- `sessions`: id, gymId, planId, dayId, startedAt, endedAt, timeBudgetMin, imported (bool), importSeq.
- `sets`: id, sessionId, exerciseId, order, kind (`warmup` | `work` | `drop`), reps, seconds, load (see 5.5), rpe (optional), note, uncertain (bool).
- Every write is transactional. Schema versioned with Dexie migrations from day one.

## 3. Gym profiles and equipment

Users can have several gyms and switch the active one from the Today screen header (a compact pill: "Life Time ▾"). Each gym has its own unit, so Japan gyms can be kg while home is lb.

Equipment picker items (icon grid, tap to toggle, presets per gym type):
Barbell and rack, Flat bench, Adjustable bench, Dumbbells (range slider: min, max, step), Kettlebells, Cable station (single / dual / functional trainer), Smith machine, Leg press (stack or plate loaded), Leg extension, Leg curl (lying / seated), Chest press machine, Pec deck / fly, Lat pulldown, Seated row, Shoulder press machine, Calf raise machine, Hip adductor / abductor, Hyperextension bench, Pull up bar, Dip station, Resistance bands, EZ curl bar, Treadmill, Bike, Stair climber, Rower, Jump rope.

Presets:
- **Full gym:** everything on.
- **Hotel gym:** dumbbells 5 to 50 lb step 5 (kg gym: 2 to 24 kg step 2), adjustable bench, one cable station, treadmill, bike. User edits from there.
- **Home:** dumbbells, bands, pull up bar off by default; user picks.
- **No equipment:** nothing; floor and bodyweight only.

## 4. Exercise catalog

### 4.1 Source
Base data from `yuhonas/free-exercise-db` (Unlicense, public domain): name, equipment, primary and secondary muscles, instructions, and two photos per exercise (start and end position). Download once with a script (`scripts/build-catalog.ts`), keep ONLY the curated subset (target 120 to 180 exercises), copy their images into `public/ex/<id>/0.jpg` and `1.jpg`, recompress to max 720px wide, WebP plus JPG fallback. Never hotlink raw.githubusercontent.com at runtime. Credit the dataset on the About screen.

### 4.2 Curated subset must cover
- Every exercise in `data/plans/*.json` (G's program and the six week plan).
- A full movement pattern ladder for every equipment level (see 7.2).

### 4.3 Exact match rule (the "no bad data" rule)
- Mapping from plan names to catalog ids lives in `data/exercise-map.json`, written by hand by the builder with a `match` field: `exact` (same movement, same implement), `variant` (same movement, small stance or grip difference noted in cues), or `none`.
- `none` means: **no demo is shown.** The card shows a clean "Demo coming soon" state with text cues only. Never show a demo of a different exercise.
- `scripts/catalog-report.ts` writes `CATALOG_REPORT.md` listing every plan exercise, its mapped id, match type, and image paths. The tester checks every `exact` match by opening both images.
- Every catalog exercise has `reviewed: false` until G approves it in the Review screen (9.4). Unreviewed demos show a small neutral "Unreviewed" dot only on the Review screen, not to normal users.

### 4.4 What each exercise shows (exercise sheet)
Order, top to bottom, with generous spacing:
1. **Form demo:** the two photos crossfading in a loop (start 1.2s, crossfade 0.35s, end 1.2s, ease in out), rounded corners, tap to pause, a subtle "1 / 2" position dot pair. Respect `prefers-reduced-motion` (show side by side instead).
2. **Muscle map:** front and back body silhouettes, primary muscles in the accent color, secondary at 40% opacity. Small legend: "Primary · Secondary".
3. **How to:** max 3 short cues, each under 12 words, written from the source instructions (never invented).
4. **Watch out:** 1 cue for the most common mistake (only if the source supports it; otherwise omit).
5. **Good for:** one practical line ("Builds the upper chest; carries over to overhead strength").
Collapsed by default during a workout: only the demo and one line of cues show; tap "More" for the rest.

### 4.5 Muscle map
Port the SVG polygon data from `giavinh79/react-body-highlighter` (MIT; keep its license file in `third_party/`) into our own small React component. Map catalog muscles to regions:
abdominals→abs, obliques→obliques, abductors→abductors, adductors→adductor, biceps→biceps, calves→calves, chest→chest, forearms→forearm, glutes→gluteal, hamstrings→hamstring, lats→upper-back, middle back→upper-back, lower back→lower-back, neck→neck, quadriceps→quadriceps, traps→trapezius, triceps→triceps, shoulders→ **must be resolved per exercise** to front-deltoids or back-deltoids (presses and front raises: front; reverse fly, face pulls, rear delt rows: back). The diagram has no side delt region, so lateral raises highlight front-deltoids and the text label says "Side delts".
Under the diagram, always list the primary muscles as text ("Upper chest, front delts · Triceps"), because text can be precise where the drawing is coarse. Ambiguous mappings go in `data/muscle-overrides.json` and are listed in CATALOG_REPORT.md.

## 5. Logging and the plate diagram

### 5.1 Logging flow per set
Big card for the current set: target ("Set 2 of 4 · 10 to 12 reps"), last time line, next target line, then the load input, reps stepper, and a large "Log set" button. After logging: the rest timer starts automatically (ring countdown, +15s / skip, soft tone at 0, works with screen on). Edit or delete any logged set by tapping it.

### 5.2 Load input modes (chosen by exercise loadType and gym)
- **Barbell:** the plate diagram (5.3). A small "Type it" link switches to a number pad that solves the plates for you (5.4).
- **Dumbbell (each hand):** a horizontal snapping wheel of the gym's dumbbell range, showing a drawn dumbbell pair. Label "each hand".
- **Single weight** (goblet, kettlebell): same wheel, label "held".
- **Machine or cable stack:** a stack selector (vertical pin style list of plates, tap the pin position) with the gym's stack step (default 5 lb / 2.5 kg, editable per machine). Label "stack".
- **Plate loaded machine:** the same plate diagram on a machine horn (no bar), "per side", starting resistance from the first use prompt (5.3).
- **Bodyweight:** reps only, optional "+ added weight" toggle.
- **Timed:** a big start/stop timer (plank, stretches).

### 5.3 Plate diagram (barbell)
Tap plates from a tray to add them to the bar; they slide onto **both** sleeves symmetrically with a satisfying motion. Tap a plate on the bar to remove the outermost one. Long press tray plate = add a pair. The total updates live in big type with the math underneath in small type: `45 bar + 2 × (45 + 25) = 185 lb`.

Bars and machines (per gym). Only true standards get defaults. Everything that varies by brand is entered by the user, never guessed:
| Equipment | Default | Rule |
|---|---|---|
| Olympic barbell | 45 lb / 20 kg | standard, editable |
| Women's Olympic bar | 35 lb / 15 kg | standard, editable |
| EZ curl bar | none | ask on first use at this gym |
| Trap bar | none | ask on first use at this gym |
| Fixed weight barbells | none | the weight is the number printed on the bar; user picks it |
| Smith machine | none | ask on first use: "Enter the bar weight (usually on a sticker on the frame)" or "Count plates only" |
| Plate loaded machines (leg press, hack squat, chest press, rows) | none | ask on first use: "Plates only" (starting resistance 0) or enter the listed starting resistance |
| Stack machines and cables | step 5 lb / 2.5 kg | ask "Does this stack go up by 5, 10, or other?" on first use, editable |

First use prompt: a small, friendly sheet with one number field and the "plates only" option, saved to that gym and that machine. Until the user answers, the total shows "+ bar" instead of a made up number (e.g. "2 × 45 + bar"). Editable later in Settings → Gyms → Equipment weights.

Plate inventory (per gym, toggleable):
- lb: 45, 35, 25, 10, 5, 2.5 on by default; 55 and 100 and 1.25 off by default.
- kg: 25, 20, 15, 10, 5, 2.5, 1.25 on by default; 2, 1.5, 1, 0.5 off by default.
- Collars: none (default, spring clips count as 0) or competition collars 2.5 kg each (adds 5 kg).

Plate visuals (draw as SVG, edge on, proportional to these real dimensions):
| lb plate | Diameter in | Thickness in | Look |
|---|---|---|---|
| 45 | 17.01 | 1.81 | black, raised white weight label |
| 35 | 14.92 | 1.80 | black |
| 25 | 12.60 | 1.81 | black |
| 10 | 10.04 | 1.52 | black |
| 5 | 7.24 | 1.05 | black |
| 2.5 | 6.34 | 0.94 | black |
(Hammer Strength round rubber Olympic plates, Life Fitness spec. 55 and 100 lb: draw at 17.7 in and the thickness of a 45 times 1.2 and 2.2.)

| kg plate | Color (IWF) | Diameter mm | Thickness mm |
|---|---|---|---|
| 25 | red | 450 | 64 |
| 20 | blue | 450 | 54 |
| 15 | yellow | 450 | 44 |
| 10 | green | 450 | 32 |
| 5 | white | 230 (approx) | 26 (approx) |
| 2.5 | red | 210 (approx) | 19 (approx) |
| 2 | blue | 190 (approx) | 19 (approx) |
| 1.5 | yellow | 175 (approx) | 18 (approx) |
| 1.25 | chrome | 160 (approx) | 16 (approx) |
| 1 | green | 160 (approx) | 15 (approx) |
| 0.5 | white | 135 (approx) | 12 (approx) |
(25 to 10 kg from Rogue IWF training plate spec. Change plate sizes vary by brand; they only need to look right relative to each other. Weight math is what must be exact.)

Settings toggle: "Plate colors: Black iron / Color coded" (lb gyms default black iron, kg gyms default color coded).

Drawing rules: heaviest plates innermost, then descending outward, identical on both sides. Sleeve drawn to scale (Olympic loadable sleeve about 16.4 in / 415 mm). If plates would overflow the sleeve, block the add with a gentle shake and "Sleeve is full".

### 5.6 Bar realism (G's feedback, Oct 23: "bar looks very novice")
The barbell must look like a real, premium Olympic bar, not a flat gray rectangle:
- Correct proportions: thin shaft (28 mm feel) and fatter sleeves (50 mm feel), inner collars as a raised flange where shaft meets sleeve, end caps on the sleeves.
- Materials: brushed steel shaft with a subtle knurling texture (fine diamond pattern, two grip zones plus a center knurl), polished chrome sleeves with a soft specular highlight and gradient, slight shadow under the bar.
- Plates: real plate look, not flat rectangles. Beveled outer rim with a lighter lip, a darker hub ring near the sleeve, subtle depth shading so they read as round discs seen edge on. Black iron mode looks like rubber coated iron; color mode uses the IWF colors with the same depth.
- Weight labels stay readable and upright (horizontal text on or under each plate edge, never sideways text that has to be read by tilting your head).
- Plates slide onto the sleeve with a tiny settle bounce; removing slides them off. 60 fps.
- Keep the math line and total exactly as they are now (G likes them).
- TRUE SCALE (G, Oct 25 3:51 PM: "the middle is like an inch, smaller than the area you put weights on. Make it to scale like a real barbell"): draw the whole bar to real proportions with one scale factor. Men's Olympic bar: 2200 mm total, 1310 mm between the inner collars (the grip shaft), 415 mm loadable sleeve each side, collars about 30 mm, shaft 28 mm thick, sleeves 50 mm. So the middle is about 3 times as long as each sleeve, never shorter. Women's 15 kg bar: 2010 mm total, 1310 mm between collars, 320 mm sleeves, 25 mm shaft. Other bars use their own real dimensions from SPEC 5.3 (EZ, trap, Smith). Plates to the same scale: 450 mm diameter for 45 lb / 20 kg and up, smaller plates at their real diameters, real thicknesses (iron vs bumper). The bar fills the card width with side margins; plates stack outward from the collar on the sleeve. If a load would run past the sleeve end, show the overflow state from SPEC 5.3 instead of shrinking the shaft. Keep labels readable: weight numbers go under each plate group, never squeezed onto thin plates. Same look on every phone width (320 floor to Pro Max). Add a test that measures the rendered SVG: shaft length / sleeve length is within 5% of 1310/415 for the Olympic bar.

### 5.4 Weight math (pure functions in `src/lib/load.ts`, 100% unit tested)
- `total = bar + 2 × sum(perSidePlates) + collars`.
- Internally store every load as `{ unit, value }` plus the loading breakdown, **never convert on save.** Convert only for display, using exactly 1 lb = 0.45359237 kg. Display kg to 1 decimal, lb to 1 decimal only when needed (e.g. 132.5).
- `solvePlates(target, bar, inventory, collars)`: greedy heaviest first per side, returns exact solution or the nearest loadable below and above with the difference shown ("Closest: 185 or 190").
- Tests: every combination of up to 6 plates per side from each default inventory sums correctly; solve then sum round trips to the same total; overflow detection; kg and lb both; Smith "plates only"; plate loaded machines with starting resistance.

### 5.5 Load stored on each set
`{ kind: 'barbell'|'dumbbell_each'|'single'|'stack'|'plate_machine'|'bodyweight'|'timed', unit, total, barWeight?, perSide?: number[], stackValue?, added? }`.

## 6. Progression engine ("last time" and "next time")

Shown on every exercise card: **Last time** (date, each set as `12 × 60`) and **Next** (the target, with a one line reason).

History is keyed by exercise, and for machines, cables, Smith and plate loaded machines also by gym (different machines are not comparable). Free weights (barbells, dumbbells, kettlebells, bodyweight) share history across gyms.

Double progression (default, all goals):
1. Working sets only (ignore warmups and drops).
2. If **every** working set hit the **top** of the rep range at the same load → Next = load + smallest increment: barbell +5 lb total (2.5 per side) or +2.5 kg; dumbbells next dumbbell up in the gym's range; stack next stack step; bodyweight +1 rep per set, then suggest adding load after 3 sessions at the top.
3. Else if any working set fell **below the bottom** of the range two sessions in a row → Next = load − ~10%, rounded to a loadable weight. Reason: "Reset and build back up".
4. Else → same load, beat the reps: "Aim for 12, 12, 11 or better".
5. Exercise never done at this gym, or no history → no fake number. Show "First time: pick a weight you could lift 2 more reps with". After the first session it has its own history.
6. Weekly table plans (six week volume plan) override reps with that week's prescription and keep load suggestions from rule 2 to 4.
7. Units: if the user logged in lb and the active gym is kg, convert the suggestion and round to the nearest loadable kg weight, showing both ("≈ 27.5 kg, last time 60 lb").

Strength goal uses the same engine with lower rep ranges (see 7.3). No estimated 1RM numbers are shown to users in v1.

## 7. Plans

### 7.1 Onboarding questionnaire (the first impression; make it gorgeous). SUPERSEDED by section 14, which expands it.
Full screen cards, one question each, big tappable choices with icons, progress bar on top, swipe or tap Next, back always available, finish in under 60 seconds:
1. "What's the goal?" Build muscle · Get stronger · Lose fat · Stay fit · Athletic
2. "How long have you been training?" New · Under 2 years · 2+ years
3. "Days per week?" 2 · 3 · 4 · 5 · 6
4. "Where are you training?" Full gym · Hotel gym · Home · No equipment
5. "What's there?" equipment grid with the preset from 4 preselected (skip for No equipment)
6. "Pounds or kilograms?" (default from locale)
7. Plan reveal: "Your plan" with the week laid out, plus "Or pick a curated plan" which lists curated plans that fit the equipment.
All answers editable later in Settings and per gym.

### 7.2 Movement pattern ladders (also the swap engine)
Patterns: squat, hinge, lunge, horizontal push, vertical push, horizontal pull, vertical pull, chest isolation, lateral delt, rear delt, biceps, triceps, quads isolation, hamstrings isolation, glutes, calves, core.
For each pattern, an ordered list of candidate exercises with required equipment, best first. Example horizontal push: barbell bench → dumbbell bench → machine chest press → Smith bench → push up (weighted) → push up → incline push up. The generator and the "Swap" button both pick the best candidate the active gym supports. Swap sheet shows up to 4 alternatives with the reason ("No barbell here").
Data in `data/patterns.json`, every id must exist in the catalog.

### 7.3 Generator
Split by days: 2 full body A/B · 3 full body A/B/C · 4 upper/lower · 5 upper/lower/push/pull/legs · 6 push/pull/legs ×2.
Rep ranges by goal: muscle compounds 8 to 12, isolation 10 to 15, rest 90/60s · strength compounds 4 to 6 rest 150s, accessories 8 to 10 · fat loss 10 to 15, rest 45s, plus a 10 min finisher (circuit or cardio) · stay fit 8 to 12 rest 75s · athletic: compounds 5 to 8 plus a power or conditioning finisher.
Sets: new 2 to 3, under 2 years 3, 2+ years 3 to 4.

### 7.4 Time budget (before each workout)
Sheet before Start: "How much time today?" 20 · 30 · 45 · 60 · 75+ min (remember last choice per gym). Estimated duration = sum over sets of (40s work + rest) + 60s per exercise change + warmups. Trim order to fit: drop stretches to 1 combined mobility block → reduce accessory sets to 2 → drop lowest priority accessories (last in the day first) → never drop the first two compound lifts. Show "Fits in ~42 min" and what was cut ("Cut: wrist twist, calf raise").

### 7.5 Curated plans (shipped)
1. **The OhRabah Split** (`data/plans/five-day-split.json (shown as "Classic 5 Day Split"; never show G's name or brand in the app)`): G's 5 day split. Full gym.
2. **Six Week Volume Builder** (`data/plans/six-week-volume.json`).
3. **Hotel Gym 3 Day**: dumbbells to 50 lb, bench, one cable. Full body A/B/C.
4. **No Equipment 3 Day**: bodyweight only.
5. **Beginner Full Body 3 Day**: full gym, machines first.
Plans 3 to 5 are generated from patterns, then frozen into JSON and reviewed.
When a curated plan meets a gym missing equipment, every unavailable exercise is auto swapped via 7.2 with a small "Swapped" tag.

## 8. Screens

Bottom tabs: **Today · Run · History · Plans**. Settings opens from a profile icon at the top right of Today.

1. **Today** (home): active gym pill, today's day card ("Day 3 · Back and biceps · ~55 min"), big Start button, week strip below. Empty state routes to onboarding.
2. **Workout:** list of exercises as cards; the current one expanded with the set card (5.1). Top bar: elapsed time, music buttons, finish. Supersets visually grouped with a colored rail.
3. **Exercise sheet** (4.4).
4. **Finish summary:** total sets, volume, PRs (rep PR at a load, load PR), duration. A clean shareable card (Web Share API image) with the AnyGym mark.
5. **History:** calendar dots + list; tap a session to see sets. Per exercise history chart (load over time).
6. **Plans:** curated list + "Generate a new plan".
7. **Settings:** profile, gyms (add, edit, set active), units, plate colors, rest timer defaults, Backup (export JSON via share sheet), Restore (import JSON), Import history (9.3), About and credits.

Music: two small buttons in the workout top bar that open Spotify (`spotify://`) or Apple Music (`music://`). No API, no login. If the app is not installed, fail silently.

## 9. Backup, import, review

### 9.1 Backup
Export everything to `anygym-backup-YYYY-MM-DD.json` via the share sheet (fallback: download). Gentle reminder banner if no backup in 14 days and more than 5 sessions exist.

### 9.2 Restore
Import a backup file, show what it contains, merge or replace.

### 9.3 Import history (`anygym-import-v1`)
Settings → Import history → pick file. Shows a review screen grouped by exercise with every set; `uncertain` sets highlighted with the reason, editable inline; `loadType: unknown` asks the user to choose. On confirm, writes sessions with `imported: true` and order preserved (display "Imported" instead of a date). Map `planExercise` to the catalog via the exercise map. G's file lives outside the repo at `~/anygym-private/g-history.json` and must **never** be committed.

### 9.4 Review screen (owner tool)
Hidden route `#/review` (reachable by tapping the About version number 5 times). Shows every catalog exercise one at a time: demo, muscles, cues. Buttons: Approve · Wrong demo · Wrong muscles · Fix cues (with note). Progress "37 / 152 reviewed". Export review JSON via share sheet. A later build item applies the review file to the catalog.

## 10. Design direction

- Dark first, true black `#000` background, surfaces `#0E0E10` and `#17171A`, hairlines `#26262B`. Text `#F5F5F7` and secondary `#9A9AA2`.
- One accent: electric lime `#D4FF3A` for primary actions, progress and primary muscles. Success uses the accent; warnings amber `#FFB020`; destructive `#FF4D4D`.
- Typography: a confident grotesk for numbers and headings (e.g. "Space Grotesk" or "Inter Tight", self hosted, subset), tabular numerals for all weights and reps. Numbers are the hero: the total weight is the biggest thing on the set card.
- Motion: springy but quick (stiffness ~400, damping ~30), plates slide on, cards expand in place, no gratuitous animation. Respect reduced motion.
- iPhone details: safe areas, no rubber band scroll on fixed bars, bottom sheet pattern for details, inputs never trigger zoom (16px+), pull down to close sheets.
- Light mode not required in v1.

## 11. Explicitly out of v1
Accounts and sync (Supabase later), Apple Health and Apple Watch (Apple only allows these from native apps, so they come in the native phase in PLAN.md LATER), push notifications, social, AI coaching, camera or photo features, Spotify or Apple Music APIs (launch buttons only), native app, GPS tracking with the screen locked (needs the native wrapper later).

## 12. Run With Me (the Run tab)

A full screen run tracker in the spirit of Nike Run Club and Strava, with its own personality. Screen title "Run With Me", tab label "Run".

### 12.1 Start screen
Big map of where you are (dark style), one huge Start button, and a row of run types: **Free run · Distance · Time · Intervals**. Distance and Time open a clean picker (e.g. 3 mi, 5 km, 10 km, custom; 20 / 30 / 45 min). Music buttons (Spotify, Apple Music) sit right above Start so music is on before the run. A 3, 2, 1 countdown fills the screen.

### 12.2 Live run screen (full screen, two pages, swipe between)
- **Stats page:** pure black, OLED friendly. One giant number (distance by default; tap to cycle distance, time, pace) with two smaller numbers under it. Current pace uses a rolling 30 second window. Tabular numerals, readable at arm's length while running.
- **Map page:** the route drawing live in the accent color over the dark map, a pulsing dot for you, and the start marked. With Turnaround on, also the way back (12.5).
- Bottom controls: Pause (big), Lock (prevents accidental taps), and press and hold to End (1 second hold with a ring fill, no accidental ends).
- **Pocket mode:** Screen Wake Lock keeps the screen on, and the UI dims to near black after 10 seconds with no touch (tap to wake). Shown once before the first run: "Keep AnyGym open with the screen on. Your music keeps playing. Locking the phone pauses GPS."
- Gaps: if GPS stops (phone locked, app switched), the route shows a dashed gap and the time in the gap is not counted as moving time. Never draw a fake straight line through a gap.

### 12.3 GPS processing (pure functions in src/lib/gps.ts, fully unit tested with synthetic tracks)
- `navigator.geolocation.watchPosition` with enableHighAccuracy, maximumAge 0.
- Drop points with accuracy worse than 25 m, and points that imply more than 8 m/s from the previous good point.
- Light smoothing (moving average over 3 to 5 points) for drawing only; distance uses the filtered points with haversine.
- Auto pause (optional, on by default): speed under 0.5 m/s for 8 seconds pauses, moving again resumes. Toggle in run settings.
- Splits per mile or km (follows the profile unit, toggle on the start screen).
- Elevation is not shown in v1 (phone GPS altitude is too noisy to be honest).
- Tests: a recorded style synthetic loop with noise, a track with spikes, a track with a gap, auto pause, split boundaries, mile and km.

### 12.4 Voice coach
Web Speech API, short phrases spoken over the user's music at every split: "One mile. Nine minutes twelve seconds. Pace nine twelve." Plus interval and turnaround cues. Toggle and frequency in run settings. Respect the device silent state where possible.

### 12.5 Turnaround and way back
For Distance and Time runs, an optional "Out and back" switch. At the halfway point, a voice cue and a full screen flash say "Turn around". The map page always shows a thin line straight to the start, plus the straight line distance to the start ("1.4 mi to start"). Made for running in a city you don't know.

### 12.6 Ghost run
When you start near the start of a previous run (within 50 m) with a similar route, offer "Race your ghost?" During the run, a translucent ghost dot moves along the old route at the old pace, and the stats page shows "12 s ahead" or "8 s behind". Matching: same start within 50 m and at least 70% of the new route within 30 m of the old one; otherwise the ghost turns off quietly.

### 12.7 Intervals
Presets: Beginner (run 1 min, walk 2 min ×8), Builder (run 3 min, walk 1 min ×6), Speed (1 min hard, 1 min easy ×10), and custom. The stats page shows the current block with a big countdown ring and the block name (RUN / WALK). Voice cue and screen color change at each switch.

### 12.8 City passport
Each finished run gets a city from an offline city list (GeoNames cities15000, CC BY 4.0, credit on the About screen; nearest city within 30 km, otherwise "Somewhere new"). No network lookup. The Passport screen shows a grid of stamps, one per city: city name, country flag emoji, first run date, run count, total distance. New city = a stamp animation at the end of the run.

### 12.9 Finish and history
- Finish screen: the route on the map fit to bounds, distance, time, average pace, splits table, best split highlighted, PR badges (fastest mile, fastest 5 km, longest run), ghost result if raced, passport stamp if new.
- Share card (Web Share API image): the route drawn as a bold line on a dark poster with the city name and stats, AnyGym mark. **Privacy zone:** the first and last 200 m of the route are trimmed from the share card by default (toggle). The map itself is not on the share card, only the line.
- History: runs mixed into the History tab with a run icon. Run detail shows the full map and splits. A "Heatmap" view overlays all runs in the current city.
- Personal records list: fastest 1 mi, 5 km, 10 km, half marathon, longest run.

### 12.10 Map
MapLibre GL JS with OpenFreeMap tiles (free, no key, commercial use allowed, attribution added by MapLibre automatically). Dark style tuned to the app palette. Offline: GPS and stats keep working without signal; if tiles fail, the route still draws on a plain dark background with a "Map offline" chip, and the map fills in later on the finish screen.

### 12.11 Data
`runs`: id, startedAt, endedAt, type, goal, movingSec, elapsedSec, distanceM, points (lat, lng, t, accuracy; stored as a compact array), gaps, splits, city, country, ghostOfRunId, intervalPreset. Included in backup and restore. Same rule as everything else: never leaves the phone.

### 12.12 GPX export
Every run can be exported as a standard GPX file through the share sheet, so it can be uploaded to Strava, Garmin Connect, or anything else that takes GPX. This is the v1 bridge until the native phase adds Apple Health.

## 13. UX quality bar (applies to every screen)

### 13.1 Dumbed down, on purpose
- Every screen is understandable in 3 seconds by someone who has never lifted. One primary action per screen, at most 3 choices visible before "More".
- Plain words only. Never show jargon in the UI:
  | Don't say | Say |
  |---|---|
  | Progressive overload | Beat last time |
  | Superset | Pair: do these back to back |
  | RPE / RIR | "How hard was that?" Easy · Good · Tough (optional) |
  | Hypertrophy | Build muscle |
  | Volume | Total lifted |
  | Rep range 10 to 12 | 10 to 12 reps |
- Sensible defaults everywhere, so the user can tap Start and never configure anything.
- Undo instead of confirm dialogs ("Set deleted · Undo" toast for 5 s). The only confirmations: ending a run (hold to end) and deleting a whole session.
- No dead ends: every empty state has one clear next step ("No workouts yet · Start your first").
- First time hints: one short coach mark per feature, shown once, dismissable, never stacked.
- Error messages say what happened and what to do, in one sentence. Never show raw errors.

### 13.2 Swift, smooth transitions
- Every tap gets instant feedback within 1 frame: press state (scale 0.97, slight dim), then the action.
- Screen and sheet transitions 180 to 280 ms with springs (stiffness ~400, damping ~30). Nothing slower than 350 ms except celebrations.
- Shared element transitions: an exercise card expands into its sheet, a plan day card expands into the workout, the run start button morphs into the live run screen. Use the View Transitions API when supported, otherwise motion layout animations.
- 60 fps on iPhone during all animations. No layout shift. Skeletons instead of spinners for anything over 150 ms.
- Respect reduced motion: crossfades instead of movement.

### 13.3 Zero bug standard
- Any console error or unhandled promise rejection during any test = FAIL.
- Every Playwright UI test runs on the device matrix in 13.4 (WebKit for iPhones, Chromium for Android).
- Edge cases covered by tests: brand new user with no data, 2 years of history (generated), very long exercise names, 0 and huge weights, kg and lb, offline, app killed mid workout (state restores exactly where it was), app killed mid run (run restores, gap recorded), double taps on every primary button (no duplicate sets), fast back and forth navigation.
- Monkey test: 90 seconds of random taps and swipes on each main screen with no console errors and no stuck states.
- New user walkthrough test: fresh install → onboarding → start today's workout → log 3 sets → finish, measured in taps. Target: onboarding under 60 seconds and logging a set in 2 taps when the suggested weight is right.
- Accessibility: every control has an accessible label, text contrast at least WCAG AA, tap targets at least 48 pt, Dynamic Type friendly up to 130%.

### 13.4 Every phone, every aspect ratio
G uses an iPhone 17 Pro Max, but AnyGym must look and work right on most to all smartphones.
- Device matrix for every UI test: iPhone SE (375 x 667, home button), iPhone 15 (393 x 852), iPhone 17 Pro Max (440 x 956, Dynamic Island), Pixel 7 (412 x 915), Galaxy S-series compact (360 x 780), small Android (360 x 640), and a 320 wide floor (smallest supported width, e.g. foldable cover screens). WebKit for iPhones, Chromium for Android.
- Layout is fluid, never fixed to one phone: flexbox and grid, `clamp()` for type and spacing, `dvh`/`svh` instead of `vh` so browser bars never hide buttons, no element wider than the viewport, no horizontal scroll ever.
- Safe areas everywhere: `viewport-fit=cover` plus `env(safe-area-inset-*)` padding so nothing sits under the Dynamic Island, notches, punch hole cameras, the iPhone home indicator, or Android gesture bars.
- Tall and short screens: the primary action (Log set, Start, Hold to end) stays reachable in the thumb zone on 667 tall and 956 tall screens alike; long content scrolls inside the screen, fixed bars never cover it.
- Portrait only, by G's rule: every screen is designed and tested for portrait. Landscape is used only where absolutely necessary, and right now no screen needs it. The manifest locks portrait (Android honors it). iOS ignores the lock, so when an iPhone is turned sideways, show one clean full screen "Turn your phone upright" card on every screen (state is kept underneath, nothing resets). Any future landscape layout needs a written reason in this spec first.
- Android install: Chrome "Add to Home screen" / install prompt works, maskable icon fills the shape with no clipping, theme and splash colors match, Android back button closes sheets before leaving a screen.
- Text: respects the phone's font size setting up to 130% without overlapping or cutting off.
- Screenshot every main screen on every matrix device in each session report and look at them. Any overlap, clipping, cut off text, or button under a system bar is a FAIL.


### 13.5 Active workout = zero thinking (G's rule)
Setup screens (onboarding, plans, settings) may scroll. During an ACTIVE workout the lifter should barely have to think or scroll:
- The current set fits on ONE screen with no scrolling, even on iPhone SE (667 tall): exercise name, Last time, Next target, the load picker, reps, and a big Log set button in the thumb zone.
- Everything is prefilled with the Next target (weight and reps), so if they hit it, logging is ONE tap. Changing reps is a big plus/minus stepper, not typing.
- Compact plate diagram during workouts: the bar and a single row plate tray, no wrapping onto a second row.
- After Log set: the rest timer starts on its own, then the card moves to the next set; after the last set it moves to the next exercise. No hunting.
- First time hints, shown once each and dismissed with a tap: "Tap plates to load the bar. We add it up." on the plate diagram, "Spin to pick your dumbbells" on the wheel, "Tap the pin to pick the weight" on the stack, "Tap Log set when you finish the set" on the set card. Small, friendly, never stacked, never during a rest timer countdown.
- Exercise details (form demo, cues) are one tap away in a sheet, never pushing the set card off screen.

### 13.6 Plain labels for the weight pickers (G's feedback, Oct 23)
Every word and every inch on screen must have a purpose. Rename and clean up:
| Picker | Old | New label | Picture |
|---|---|---|---|
| Dumbbells | "each hand" with two stacked dumbbell icons | "Dumbbells · weight of one" with a small helper line "You hold one in each hand" | ONE clean dumbbell drawing, no stacked icons |
| Single weight | "held" | "One weight · both hands" with helper "Goblet squat, kettlebell swing" style examples for that exercise | one kettlebell or one dumbbell held vertically, matching the exercise |
| Stack | "stack" | "Machine · pick the pin" with helper "Use the number next to the pin on the weight stack" | a simple weight stack with the pin, the picked plate highlighted |
| Plate loaded machine | (unchanged idea) | "Machine · plates per side" | the machine horn with plates |
| Bodyweight | | "Your bodyweight" plus an "Add weight" toggle | none, or a tiny figure |
| Timed | | "Hold for" with the timer | only shown for timed exercises (planks, stretches, carries), never as a picker anywhere else |
- Show only the ONE picker that matches the current exercise. Never show a list of all pickers to users. The #/dev/loads page is a developer page only; no debug text (raw JSON) ever appears in user screens.
- Numbers stay huge and centered, units small, one helper line max.

### 13.7 Info buttons for anything unusual (G's rule)
Next to any equipment name or gym term a normal person might not know, show a small ⓘ button. Tapping it opens a short sheet with:
- A clear picture of the thing (a clean, accurate line illustration drawn in the app's style, so no photo licensing; each illustration goes through the Review screen before it counts as approved),
- One or two plain sentences: what it is and how to spot it in a gym,
- Its typical weight when that is standard (for example "Olympic bar: 45 lb / 20 kg"), or "Check the sticker or stamp, it varies" when it is not.
Glossary to cover at minimum: Olympic barbell, women's bar, EZ curl bar, trap (hex) bar, fixed weight barbell, Smith machine, cable station and attachments (rope, straight bar, V handle, D handle), plate loaded machine, weight stack machine, leg press, hack squat, pec deck, lat pulldown, seated row, preacher bench, adjustable bench, decline bench, hyperextension bench, dip station, landmine, kettlebell, resistance band, collars and clips, bumper vs iron plates, plus workout terms shown in the app (pair / back to back sets, warm up set, drop set, rest timer, reps, sets).
Places it appears: the first use weight prompts (Smith machine, EZ bar, plate loaded machines), the equipment picker in onboarding and gym settings, exercise sheets, and plan days. Keep the ⓘ subtle (secondary color, 24 pt tap target inside a 48 pt hit area).

## 14. Getting to know them: the intake funnel (G's rule: more options, all taps)
Replaces the short onboarding in 7.1. Every screen is big tappable prompt chips (with icons), multi select where it makes sense, a "Skip" on anything personal, progress bar, back always works, about 2 minutes total. More options are better, but every screen asks one clear thing.
1. Main goal (pick 1): Build muscle · Get stronger · Lose fat · Tone up · Stay healthy · Athletic performance · Train for a race · Get back into it
2. Focus areas (pick any): Chest · Back · Shoulders · Arms · Abs and core · Glutes · Legs · Whole body balance
3. What would make this a win? (pick any): Look better in clothes · Bigger arms · Stronger lifts · More energy · Better posture · Lose belly fat · Run farther · Feel less stiff
4. Experience: Brand new · A few months · 1 to 2 years · 3+ years · Coming back after a break
5. Days per week: 2 · 3 · 4 · 5 · 6, then "Which days work best?" weekday chips (used for reminders)
6. Time per session: 20 · 30 · 45 · 60 · 75+ min
7. Where do you usually train? Full gym · Hotel gyms (I travel a lot) · Home · Outdoors · Mix of everything. Then the equipment picker (section 3) with ⓘ buttons.
8. How do you like to train? Free weights · Machines · Mix · Bodyweight · Whatever works
9. Cardio: Love it · A little · Only if I have to · None. Plus favorites: Running · Treadmill · Bike · Stairs · Rower · Jump rope · Walking
10. Anything to go easy on? Lower back · Knees · Shoulders · Wrists · Neck · Hips · None. (Stored only on the phone; used to avoid or swap exercises; never shown as medical advice; plain note: "If something hurts, stop and check with a professional.")
11. Exercises you love / never want to see (searchable chips, optional)
12. When do you usually work out? Early morning · Lunch · After work · Night (used for reminder timing)
13. About you (optional, Skip button prominent): name for the passport, units, bodyweight, height, age range. Used only to suggest starting weights and calorie neutral targets.
14. Your plan reveal: animated build of their week ("Mon Push · Wed Pull · Fri Legs"), why it fits them in 2 lines ("4 days, 45 min, hotel friendly, extra arm and glute work, easy on knees"), and "Or pick a curated plan" with matching curated plans.
Everything is editable later in Settings → My profile, and "Rebuild my plan" reruns the generator.

## 15. The coach: recommendations everywhere (G's rule: the user should not have to think)
The app acts like a personal trainer. Recommendations are short, specific, one tap to accept, and always say why in plain words. Logic lives in src/lib/coach.ts as pure, fully tested functions.
- Plan curation from the intake (14): goal sets rep ranges and rest; focus areas add 2 to 4 extra weekly sets for those muscles; "go easy on" swaps out risky lifts (for example lower back: no barbell good mornings, prefer supported rows; knees: box squats or leg press over deep lunges); loved exercises included where they fit, never-want exercises excluded; session time and equipment respected.
- Starting weights for first timers: no fake numbers. Suggest a test set ("Start light: 10 easy reps, then we'll set your number") and set the first real target from that set.
- Warm up sets auto added to the first compound of the day for intermediate and up (empty bar or light × 10, about 50% × 5, about 75% × 3), marked as warm up and excluded from progress.
- Weekly Level up card (Today screen, after each training week): "You hit all your reps on 5 lifts this week. Add weight?" One tap applies to the lifts that earned it: lower body compounds +5% (min +10 lb / +5 kg), upper body compounds +2.5 to 5% (min +5 lb / +2.5 kg), isolation exercises add reps first, then weight. Every number rounded to something loadable at the active gym. Lifts that didn't earn it are listed as "holding steady" with why.
- Auto level up (G, Oct 25 3:47 PM, from a tester's idea): Settings → Coach → "Auto level up", OFF by default. The setting row explains it in plain words right under the switch: "When you hit all your reps on a lift for a week, AnyGym adds a little weight for next week on its own (about 5% on big leg lifts, 2.5 to 5% on upper body, more reps first on small exercises). You can always change any weight." The first time it turns on, a short sheet shows one real example from the user's own lifts ("Squat: 185 → 195 lb next week") with Turn on and Not now. When it applies, Today shows a quiet card once that week: "Leveled up 3 lifts for this week" with a See changes link listing each lift old → new and an Undo for each. It uses the same rules and rounding as the Level up card and never raises a lift that missed reps.
- PERSONAL PROGRESSION ENGINE (G, Oct 25 3:59 PM, a tester's idea: "adjusted per person"). Replaces the fixed percentages above as the source of every level up, plateau and deload decision; the fixed numbers become only the starting defaults for a lift with under 3 sessions of history. Pure, fully tested functions in src/lib/coach/, runs on the phone, offline, no paid AI:
  - Strength estimate: every working set gives an estimated 1 rep max (Epley for 1 to 10 reps, Brzycki above 10, capped at 15 reps; warm ups and failed sets excluded). Track a smoothed e1RM per lift per user (exponential moving average).
  - Personal rate: per lift, learn the user's weekly e1RM gain from their own last 4 to 8 weeks. The next increment scales with it (fast progressors get bigger jumps, slow ones smaller), bounded by sane limits (lower body up to +10%, upper up to +5%, isolation reps first) and always rounded to loadable plates at the active gym.
  - Learn from outcomes: if a level up is followed by missed reps, the next increment for that lift shrinks (about half); if it is hit with reps to spare (Easy), the next grows a little. Store this per lift.
  - Effort tap: one optional "Easy / Good / Hard" chip after the last set of each exercise (never per set, one tap, skippable, remembered as the default). Easy means about 3+ reps left, Good 1 to 2, Hard 0. It feeds the increment and the plateau check.
  - Plateau per lift: e1RM flat (under 1% change) for 3 sessions, or Hard twice in a row at the same weight → change only that lift: new rep range, a close variation from the swap ladder, or a small deload for it.
  - Recovery: reps dropping sharply across sets, most lifts Hard in a week, or missed sessions → hold steady or suggest a deload week instead of pushing.
  - Every change explains itself in one plain line, e.g. "Bench +5 lb: you hit 3 × 10 with reps to spare two weeks in a row." Shown on the Level up card, the Auto level up card and the exercise screen.
  - Tests: synthetic users (fast beginner, slow veteran, inconsistent, injured comeback) over 12 simulated weeks; assert sensible, never unsafe jumps, rounding to plates, and that it adapts after misses.
- Plateau: same weight and reps for 3 sessions → suggest one of: switch rep range, swap to a close variation, or a small deload. One tap.
- Deload: every 5th to 6th week, or after missed reps two sessions in a row on most lifts, suggest a lighter week (about 10% lighter, one fewer set). One tap.
- Missed days: after 7+ days off, "Welcome back" week at about 90% weight.
- Rest timer defaults by goal and exercise; recovery note if the same muscles are trained two days in a row.
- Cardio suggestions by goal (for example fat loss: 10 min finisher; race goal: runs in the Run tab with a weekly distance target).
- A small "Coach" line on Today with the single most useful recommendation right now. Never more than one card at a time.

## 16. The passport book (upgrade of 12.8)
A real feeling passport. Opening it is a moment:
- Cover: black leather texture, lime foil AnyGym A logo and "ANYGYM PASSPORT" embossed, subtle shine that moves with the phone tilt where supported.
- Opening animation: the cover swings open in 3D (CSS perspective, about 600 ms, springy), pages fan slightly. Swipe or tap to flip pages with a real page curl turn.
- ID page: their photo from the camera roll (stays on the phone) or an avatar they build (face shape, skin tone, hair, cap, colors), name, "Home gym", "Issued" date, member number, total cities, total workouts, total distance, and a fake machine readable strip at the bottom in the passport style (decorative, no real personal data beyond what they typed).
- Stamp pages: one stamp per city, earned by a run there or a workout at a gym tagged with that city. Each stamp looks like an ink stamp: round, rectangle, or hexagon, rotated a few degrees, slightly uneven ink, in a color from the palette, with city name, country flag, date, and "RUN 5.2 km" or "WORKOUT 48 min". New stamps land with a stamping animation and a soft thunk haptic sound.
- Visa pages for milestones (first run, 10 cities, first marathon distance).
- Works offline. Shareable as an image of the open spread.
- Gyms get an optional city field when created, so hotel gym workouts can earn stamps without location tracking.

## 17. Achievements and motivation
- Weekly goal ring on Today: "3 of 4 workouts this week", fills with a satisfying animation. Weekly streak (weeks in a row hitting the goal), never daily streaks that punish rest days.
- XP: points for each workout, sets completed, PRs, runs, new cities, Level ups accepted. Levels with names and a progress bar. XP pops up gently at the end of a workout, not during sets.
- Badges with great looking unlock animations (badge drops in, shines, confetti burst, "Badge unlocked"): First workout · First PR · 5, 25, 100 workouts · 3, 8, 26 week streaks · Hotel Hero (workout at a hotel gym) · Globetrotter (3, 10, 25 cities) · Early Bird · Night Owl · 5K, 10K, half marathon · Iron Week (all planned workouts done) · Comeback (back after 2+ weeks off) · Plate Master (first 2 plate lift, 225 lb or 100 kg) and more.
- Trophy case screen with locked badges showing how to earn them.
- Leaderboards come with accounts (section 18): friends and global weekly XP, opt in only.

## 18. Accounts and reminders (optional, after the first workout) — 100% free stack (G's choice)
- After the first finished workout: one friendly card "Save your progress and get reminders" with Continue with Google and Continue with email. "Not now" is always there and never nags more than once a week.
- Sign in: Firebase Authentication on the free Spark plan (Google sign in plus email link sign in; Firebase sends the sign in emails itself, so no domain is needed). Add rabahharchaoui-design.github.io as an authorized domain.
- Sync: Cloud Firestore on the free Spark plan. The phone stays the source of truth and works offline; Firestore holds a synced copy for backup and new phones. Security rules: each user can only read and write their own documents.
- Push reminders: standard Web Push (works on iPhone once the app is on the Home Screen, iOS 16.4+, and on Android) sent by a Cloudflare Worker on G's free Cloudflare account with a Cron Trigger every 15 minutes. VAPID keys generated once; the private key lives only as a Worker secret. On their workout days at their usual time from the intake: "Leg day today, 45 min. Tap to start." Skip if they already trained, nudge once if they missed, never more than one push a day. Settings to change days, time, or turn off.
- Weekly recap: a Sunday push "Your week: 3 of 4 workouts, 2 PRs. Tap to see it" that opens an in app recap screen (workouts vs goal, PRs, XP, next week's plan, one coach tip). No email needed for v1.
- Email recaps later (optional, still free): a Google Apps Script on G's Gmail with a weekly time trigger that reads opted in users from Firestore and sends the recap (consumer Gmail allows about 100 recipients a day, fine for friends and early users). Paid email (Resend with a domain) only if AnyGym outgrows that.
- Secrets never go in the repo: VAPID private key and any service credentials live only as Cloudflare Worker secrets or in ~/anygym-private/. The Firebase web config is public by design and may be committed.
- What G must set up first (the build waits for these and does everything else with mocks): a Firebase project with Google and Email link sign in enabled, the web app config saved to ~/anygym-private/accounts.env, and a one time `npx wrangler login` on gmini. Until then the sign up card stays hidden.

## 19. Gym switching everywhere
The gym pill is on Today, the workout screen header, and the Run tab. One tap opens a sheet with recent gyms, "+ New gym" (presets: Hotel gym, Full gym, Home, Outdoors, No equipment) with name and optional city, and edit. Switching mid workout re-checks the remaining exercises and offers swaps. People travel constantly, so switching must take two taps or less.

## 20. Workout flow: follow the plan, don't fill in a log (G's rule, Oct 23 11:56 PM, overrides 5.1 where they differ)
G tried logging a barbell squat and it took far too much clicking. The workout must feel like following a coach's list, not filling in a spreadsheet. Design reference (private, not in git): .design-ref/workout-list-inspiration.png (a white list from another app; take the layout idea, keep our dark style, copy nothing else).

### 20.1 The day list (the workout screen)
- Title is the day name ("Legs · hamstring focus"), with the gym pill and time estimate.
- One row per exercise, in order: small rounded thumbnail of the form demo on the left (about 64 pt), then the exercise name (big), then "3 sets × 15 to 20" (or "3 × 60 to 90 sec"), then a quiet line "60 s rest". Pairs (supersets) are grouped with a colored rail and the label "Pair: back to back".
- Each row shows progress: empty, then a ring filling per set done, then a check when done. Done rows dim slightly and the next row is highlighted.
- Tap a row to open that exercise (20.2). That is the only navigation needed.
- No "add exercise" or "pick a load type" steps when following a plan. Every exercise already knows its equipment and load type from the catalog.

### 20.2 The exercise view (one tap from the list)
- Top: the form demo (tap for the full form sheet), name, one line cue.
- "Last time 12 × 185 · 12 × 185 · 10 × 185" in small text.
- The sets as rows, ALREADY FILLED with the target weight and reps (from the coach/progression engine; for first timers, the test set flow from SPEC 15). Each row: set number, weight, reps, and a big round check button.
- Logging a set = tap its check. That's it. The rest timer starts on its own as a slim bar at the bottom (with +15 and Skip), and the next set row is highlighted.
- Different weight? Tap the weight on that row: the right picker slides up as a sheet (plate diagram for barbells, dumbbell wheel, machine pin), already set to the target, change it, Done. That row and the rows below update to match.
- Different reps? Tap the reps: a plus/minus stepper right there.
- After the last set: a quick "Nice. Next: Romanian deadlift" and it returns to the list with the next row highlighted (or swipe to go straight to the next exercise).
- Target for a barbell squat with the weights right: open list, tap Barbell back squat, tap check 4 times. Nothing else.

### 20.3 Quick workout (no plan)
- Starts with a fast exercise picker: search box on top, then "Recent", "For your gym", and body part chips. Tapping an exercise adds it to the list with sensible default sets and reps for the user's goal. No load type question ever: the catalog knows it.
- Then it behaves exactly like 20.1 and 20.2.

### 20.4 Test it the way G uses it
Playwright tap count tests that fail if exceeded:
- From Today: start today's plan day and log all 4 sets of a barbell squat at target: at most 6 taps (Start, row, 4 checks).
- Change the weight of one set on a barbell lift: at most 3 extra taps.
- Quick workout with one exercise and 3 sets logged: at most 7 taps including search.

## 21. Learn from the best: Hevy and Bevel (G's request, Oct 24)
Hevy is the most loved lifting tracker; Bevel is praised for turning complex health data into beautiful, readable summaries. Borrow the PATTERNS that make them great, never their visuals, names, icons, copy, or assets. AnyGym keeps its own black and lime identity.

### 21.1 From Hevy (logging that lifters love)
- The set table on the exercise view: columns SET · LAST TIME · WEIGHT · REPS · ✓. "Last time" shows exactly what they did in that set last session; tapping it copies those numbers into the row. Combined with our prefilled Next targets (SPEC 20), most sets are just the ✓.
- Checking a set: the row turns a satisfying lime tint with a smooth check animation and a light haptic style bounce; the rest timer starts for that exercise.
- Rest timer is per exercise (editable on the exercise), shown as a slim bar at the bottom of the screen with time left, +15 / -15, and Skip. It keeps counting if the user leaves the screen.
- Set types as a tiny tap target on the set number: normal, W (warm up), D (drop set), F (to failure). Warm ups never count toward progress or PRs.
- Live workout header: elapsed time, total sets done, total lifted, always visible but compact.
- Exercise menu (⋯ on each exercise): Replace (our swap engine), Reorder, Make a pair (superset), Add note, Rest time, Remove. Pairs get a colored rail.
- Finish screen celebrates: PRs called out with a trophy style badge per lift (heaviest weight, best set volume, most reps at a weight), duration, sets, total lifted, a muscles worked body map, and a share card.
- Exercise detail page has tabs: How to (demo, cues), History (every past session for that lift), Charts (best weight, estimated strength trend, total lifted), Records.
- A contextual one time tip explains dumbbell weight entry ("Enter the weight of one dumbbell").
- Profile shows a weekly workout calendar with streak dots and a muscles trained this week heat map.

### 21.2 From Bevel (beautiful, calm, smart)
- Home is a small set of cards the user can reorder or hide (edit mode with drag handles). Default cards: Today's workout, Weekly goal ring, Coach, Recent PR, Passport teaser.
- Big, calm rings and scores with one number and one word ("3 of 4 · On track"). Every score has a "Learn more" sheet in plain words instead of cluttering the card.
- The coach speaks like a person: short, specific, kind, actionable ("Legs recovered. Good day to push squats."), and explains why in one tap.
- Muscle load visual after a workout: a front and back body map heating up by muscles worked this week, so users see balance at a glance.
- Never a blank, demotivating home: a brand new user sees a friendly, filled first day (today's plan, a goal ring at 0 of N with "Let's start", and one coach tip).
- Playful micro interactions in moderation (a morphing slider for "How did that feel?", smooth number count ups on the finish screen).
- Fix what reviewers dislike in Bevel: adding exercises one by one takes too many taps, so our exercise picker supports multi select (tap several, then Add 4).

### 21.3 Avoid
- Paywalls, upsell screens, or ads (none in AnyGym v1).
- Long onboarding without visible progress (our intake shows progress and stays near 2 minutes).
- Dense tables with tiny text; everything respects SPEC 13 sizes.

## 22. Smart exercise order and "Up next" (G's rule, Oct 24 1:20 AM: train like a top evidence based coach)
The app orders and suggests exercises the way a great personal trainer would, using mainstream evidence based hypertrophy and strength principles (the kind taught by science based coaches). Never name or quote any real coach or influencer in the app. Logic lives in src/lib/order.ts as pure, fully tested functions, used by the generator (7.3), the coach (15) and Quick workout (20.3).
Source of truth (G, Oct 24 1:22 AM): exercise science and the consensus of reputable evidence based coaches decide every rule here. G's split (data/plans/five-day-split.json (shown as "Classic 5 Day Split"; never show G's name or brand in the app)) is a reference for what real workouts look like (exercise choices, notes, the feel of a day), not the rulebook. When the split and the science disagree, the science wins for everything the app generates or suggests. G's own plan stays exactly as he wrote it unless he taps Apply.
Ordering rules for a day, in priority order:
1. Big compound lifts first while fresh (squat, hinge, bench, overhead press, rows, pull ups), then secondary compounds, then isolation, then calves and abs, then stretches.
2. Priority muscle first: a focus area from the intake (14) or the plan's stated priority goes earlier in the day.
3. Never pre-tire a helper muscle before the lift that needs it: no triceps before bench or overhead press, no biceps before rows or pull ups, no lower back work before squats or deadlifts, no grip burning before heavy pulls.
4. After a compound, finish the same area with isolation that builds on it: bench → chest fly or triceps; rows or pull ups → rear delts or biceps; squat or leg press → leg extension or leg curl; overhead press → lateral raises.
5. Pairs (supersets) only when they save time without hurting performance: opposing or non-competing muscles (chest + back, biceps + triceps, quads isolation + calves, leg curl + abs, lateral raise + calves). Never pair two exercises that work the same muscle, and never pair anything with the heaviest compound of the day (heavy squats, deadlifts and bench get full rest).
6. Rest: heavy compounds 2 to 3 min (3+ for strength goal), other compounds about 2 min, isolation 60 to 90 s. Time budget (7.4) may shorten isolation rest first, never the heavy compound rest.
7. Weekly balance for generated plans: each major muscle trained about twice a week, roughly 10 to 20 hard sets per muscle per week for muscle goals (fewer for new lifters, per 7.3), push and pull volume roughly equal, and legs never skipped.
8. Effort targets shown in plain words: compounds "stop with 1 to 2 reps left", isolation "go close to failure, 0 to 1 reps left". New lifters get 2 to 3 reps left on everything.
"Up next" (Quick workout and any free choice moment):
- After the last set of an exercise, the card offers the single best next exercise for the gym the user is in, with a one line why: "Next: Cable triceps pushdown. Finishes the triceps your bench just warmed up." One tap adds it with sets, reps and rest filled in; a small "Other ideas" shows 2 alternatives. Never more than one big suggestion.
- The suggestion follows rules 1 to 5, the user's goal and focus areas, what they already did today, what they trained in the last 48 hours (avoid hammering the same muscles two days in a row), and their "go easy on" list.
- Rest time pairing tip, only when it is truly safe (rule 5): during long rests after a non-heaviest compound, the coach may offer "Use this rest for calves?" as an optional pair. Off for strength goal.
- Curated plans, including G's own (7.5), are examples, not perfect (G, Oct 24 1:21 AM). Show the plan as written, then a small quiet "Coach tips (N)" row on the plan screen (collapsed by default, never inside the active workout, with a "Hide tips for this plan" option) that opens to list each suggested improvement with a one line why and an Apply button per tip, plus Apply all. Applying creates a tuned copy named "<plan> (coach tuned)" and keeps the original one tap away, so nothing is lost. Never change a plan silently.
- Use G's split (data/plans/five-day-split.json (shown as "Classic 5 Day Split"; never show G's name or brand in the app)) as the worked example and test fixture. The engine must flag at least these on it: (1) Legs (hamstring focus): the Romanian deadlift is 6th, after lunges and leg extensions; a hamstring focus day should hinge early (squat → RDL → leg curl → rest). (2) Both leg days: long static stretches before heavy lifting; move static holds to the end and keep a short dynamic warm up first. (3) Heavy compounds (back squat, leg press, Arnold press, barbell incline) rest 90 s or less; suggest 2 to 3 min. (4) Chest and triceps: the barbell incline + incline plate press pair works the same muscle back to back (rule 5); suggest straight sets, or keep it labeled as an intentional intensity pair if the user says so. (5) Weekly balance: chest, back, hamstrings and shoulders get one session a week; offer an optional frequency tip (for example add 3 to 4 chest and back sets on the other days) without forcing a new split. (6) Abs: 6 exercises × 3 sets twice a week is a lot of time; offer a shorter 2 to 3 exercise core block. Things the split already does right must not be flagged (pull ups and rows before biceps, bench before triceps, calves and forearms last, Arnold press first on shoulder day).
Tests: every flag above on G's split, plus a table of at least 30 day scenarios (push day, pull day, legs, full body, hotel gym dumbbells only, bodyweight only, strength goal, fat loss, lower back go easy) with the expected order and Up next pick, plus property tests: no helper muscle before its compound, no same muscle pairs, every suggestion exists in the active gym.

## 23. Make it feel premium: navigation, buttons, motion (G's rule, Oct 24 1:24 AM: "it needs to look sexy")
Read first for every UI item (builder and ux-critic): .design-ref/skills/emil-design-eng/SKILL.md, .design-ref/skills/mobile-native/SKILL.md, .design-ref/skills/frontend-design/SKILL.md; the ux-critic also uses .design-ref/skills/break-ui/SKILL.md. These are local, never commit them. The bar: it should feel like a top App Store app, not a website. Everything lives in one design system: src/ui/motion.ts (springs, durations, easings as tokens) and src/ui/ components. No one off styles.
### 23.1 Navigation that feels native
- Stack screens push in from the right with the previous screen sliding about 30% left and dimming, exactly like iOS. Back reverses it.
- Back: a round 44 pt glass button top left (blurred translucent surface, thin hairline, chevron icon), plus an interactive edge swipe from the left edge that follows the finger and finishes or cancels by velocity. Both on every pushed screen.
- Large titles that shrink into a compact centered title in a blurred top bar as you scroll (iOS large title behavior).
- Tab bar: floating, blurred, with a lime pill that slides between tabs (shared layout animation), icon does a small spring bounce on select. Tab switches crossfade with a 6 to 8 px rise, never a slide.
- Sheets: spring up from the bottom, drag down to dismiss with velocity, the screen behind scales to about 0.94 with rounded corners and dims (iOS card stack). Nested sheets stack.
- Shared elements: exercise thumbnail grows into the exercise view hero, a plan day card expands into the workout, the Start button morphs into the workout header. View Transitions API where Safari supports it, otherwise motion layout animations.
### 23.2 Buttons and controls
- Primary: lime pill, 52 to 56 pt tall, bold label, subtle top highlight and soft lime glow, press scales to 0.97 instantly. Secondary: glass. Tertiary: text only. Destructive: red text, confirm with undo instead of dialogs where possible.
- Every control: 44 pt minimum hit area, pressed state within one frame, disabled state that still explains why ("Set the starting weight first").
- One icon family everywhere (Lucide or Phosphor, MIT licensed, one stroke weight), never emoji as icons.
- Haptics: a tiny tick on set check, plate add, wheel detents and tab switch. iPhone Safari 18+ via the native switch input haptic technique, Android via navigator.vibrate(8). Setting to turn off.
### 23.3 Motion that rewards
- Numbers roll like an odometer when weight or reps change. Rest timer is a smooth ring that counts down.
- Set check: the check draws in, the row fills lime from left to right, haptic tick. A PR gets a short lime burst and "New best" chip. Finishing a workout: summary cards cascade in with count up stats.
- Skeletons, never spinners. Empty states get a simple original illustration and one clear action.
- Durations 150 to 300 ms with springs; celebrations up to 900 ms. 60 fps on iPhone. prefers-reduced-motion swaps movement for crossfades.
### 23.4 Proof
- Each UI item's report includes Playwright screen recordings (video) of its main flow on iPhone SE and iPhone 17 Pro Max in reports/videos/, plus before and after screenshots. The ux-critic watches them and scores feel 1 to 10; anything under 8 goes back to the builder.

## 24. Report a problem and crash reports (G's rule, Oct 25 4:02 AM: keep it deep in Settings, the main screens stay clean)
Goal: bugs G or testers hit at the gym reach the builder automatically, even while G travels.
- Where: Settings → Help → Report a problem. Nowhere else: no floating button, no shake gesture, nothing on Today or in the workout.
- The sheet: one text box ("What went wrong?"), an optional "Add a screenshot" photo picker (the user's own iPhone screenshot from Photos), and Send. It automatically attaches: app version (git short sha baked in at build), screen/route, device and viewport, iOS version from the user agent, units and gym type, and the last 20 console errors. Never workout history, names, emails, or anything personal. A line under Send says exactly what is included.
- Offline: queue the report in IndexedDB and send it when back online. Success state: "Sent. Thanks, this goes straight to the builder."
- Crash reports: window.onerror and unhandledrejection, plus React error boundaries, send a tiny report (message, stack, route, version, device). De duplicate by a signature (message plus first stack frame) and send each signature at most once per day per device. Settings → Privacy → "Send crash reports" toggle, on by default. Never send personal data.
- Backend (free, no tokens to manage): one Cloudflare Worker "anygym-api" with POST /feedback and POST /crash, bound to the existing D1 database "anygym-feedback" (id 745c94d5-efb9-41bf-a4f4-f2e0b84d145f, already created with its tables by Claude on Oct 25). Table reports: id, kind ('feedback' or 'crash'), created_at, last_seen_at, seen_count, signature, message, stack, route, app_version, device, context_json, screenshot_b64, status ('open','queued','fixed','ignored'), plan_item, fix_commit, note. Table rate (ip_hash, hour, n) for limits. A crash with the same signature as an open crash increments seen_count and last_seen_at instead of adding a row. Screenshots: resize on the phone to max 900 px wide JPEG around 70% so screenshot_b64 stays under about 300 KB. Abuse limits: max 20 requests per hashed IP per hour, body under 1 MB, Origin must be https://rabahharchaoui-design.github.io. The database is private; nothing is ever written to the public repo.
- Phone alerts to G (works even while gmini is offline, because the Worker sends them): the Worker reads G's ntfy topic from a Worker secret NTFY_TOPIC (set with wrangler secret put from ~/.config/anygym/ntfy-topic on gmini; never in the repo or the app). New feedback: push "AnyGym: new bug report" with the first line of the message and the screen. New crash signature: push "AnyGym: new crash" with the message (repeats of a known crash do not push). A Worker cron every 15 minutes finds rows that changed to status 'fixed' since the last check and pushes "AnyGym: bug fixed" with the report and "Close and reopen the app to get it." Max 10 pushes per hour total, plain words, no personal data.
- The builder reads open rows at the start of every run and after every item (gmini: npx wrangler d1 execute anygym-feedback --remote --command "SELECT ..."; the cloud builder: the Cloudflare connector's d1_database_query with the id above), turns real problems into short fix items at the top of the queue (grouping duplicates), sets status='queued' and plan_item, and once the fix is live sets status='fixed' and fix_commit. Spam gets status='ignored'.
