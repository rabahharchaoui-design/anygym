# Map of src/

This file explains every folder under `src/` in plain words. If you are about to write something new, look here first, then search the folder for something that already does the job. Never write a second copy of a button, card, sheet or helper.

## The rules (from CLAUDE.md)

- Screens live in `src/screens/<area>/`. One folder per area of the app.
- Pieces shared by several screens live in `src/components/` (bigger pieces that know about AnyGym) and `src/ui/` (small, generic building blocks like buttons and sheets).
- Saving and loading data lives in `src/db/`. It is the only code that talks to the phone's database directly.
- Pure logic lives in `src/lib/`. "Pure" means it takes numbers and words in and gives numbers and words out. It never touches the screen or the database.
- Weight math lives only in `src/lib/load/`. No other file adds, converts or rounds weights. Screens never do their own arithmetic.
- One job per file. New files stay under about 300 lines. A file over 400 lines gets split the next time someone touches it, without changing what it does. A script (`npm run size`) fails the build if a file grows past its limit.
- Some folders (`src/lib/load/`, `src/lib/generator/`, `src/lib/quickStyles/`, `src/lib/coach/`, and a few more) are folders with an `index.ts` file. Importing the folder (for example `from '../lib/load'`) gives you everything that folder offers. The index file is the front door; the other files inside are the rooms.
- Test files live in `__tests__` folders next to the code they check. They are left out of this map.

## Files directly in src/

- `main.tsx`: the very first code that runs. It opens the database, restores saved drafts, then draws the app.
- `App.tsx`: the list of screens and which address (route) shows which one.
- `pwa.ts`: lets the app update itself in the background, but only when no workout is running.
- `vite-env.d.ts`: a small note for the build tool. You will almost never open it.

## Folders

### src/screens/
One folder per area of the app. The three files at the top (`TodayScreen`, `HistoryScreen`, `SettingsScreen`) are main tabs (`SettingsScreen` is the You tab, PLAN M14); the Run tab lives in `screens/run/` and the Plan tab in `screens/plans/`. The `Today` and `Settings` styles sit beside them.
- `screens/today/`: the home screen. The coach card, the next workout, resume a workout, the welcome tour, the backup reminder.
- `screens/workout/`: the live workout. The list of exercises, the set table where you log weight and reps, the rest timer, the finish screen.
- `screens/run/`: Run With Me (PLAN 4.2 and 4.3, SPEC 12.1, 12.2). `RunScreen` picks what shows: the start screen (`RunStart`: the map behind, the GPS chip, the run types, the music buttons and Start, or "Run in progress" while a run goes on hidden), the live run (`LiveRun`) or the summary of the run that just ended (`RunSummary`: PLAN M3, the route as the hero of the top half, the stat row `RunStats` (shared with a saved run's detail), what it earned `RunFacts`, the splits `RunSplits`, Export GPX, and Share card beside Done at the foot; `RunShare` holds the share card sheet and the GPX export). The live run is two pages: `LiveStats` (Monolith, PLAN M2: stacked data fields, distance on top at hero size, a tap makes the next one big) and `LiveMap` (the route, dashed across gaps, one stat row under it); `LiveControls` holds Pause, hold to End and Lock, `HoldButton` is the one second hold with its filling track, `liveSwipe.ts` decides which page a swipe lands on. `RunSheets` holds the one time pocket mode explainer and the run settings (auto pause). `RunMap` shows a dark placeholder and loads `RunMapGl` (MapLibre, a big file) only when a map is needed; `mapRoute.ts` draws a run's line on it. `GpsChip` is the chip and its help sheet, `GoalSheet` the distance, time and interval pickers, `Countdown` the 3 2 1. The Run tab itself is a separate download, fetched just after the app starts. PLAN 4.4 (SPEC 12.4, 12.7): `IntervalFace` is the countdown ring with the block's name on the numbers page, `IntervalEditor` builds a custom set of blocks in the interval picker, `Intervals.module.css` holds their styles, the colour flash at a switch and the voice settings of the run settings sheet (`RunSheets`).
- `screens/history/`: looking back at finished workouts and runs: the list (runs mixed in with a run icon, `historyFeed.ts`), one workout, one run (`RunDetail.tsx`: route, splits, records, share card, GPX) and the run records with the city heatmap (`RunRecords.tsx`).
- `screens/plans/`: the list of workout plans, a plan's days, and plans by place (gym, hotel, home).
- `screens/quick/`: "quick workout" ideas. A deck of cards you swipe through and keep.
- `screens/intake/`: the first run questions (goals, level, equipment) that lead to a first plan.
- `screens/settings/`: the You tab's pieces and sub screens: gyms, the equipment of each gym, backup and restore (`BackupRows`), importing a workout history, problem reports.
- `screens/review/`: the private screens used to check exercises and muscles before they ship to people.
- `screens/dev/`: developer pages that show parts of the app on their own (plates, muscles, loads). Hidden unless a developer switch is on. `RunSummaryDevScreen` opens the finish screen of a saved run by its id (`#/dev/run-summary/<id>?dev`, only in dev and preview builds) so tests can show worst case runs.

### src/components/
Bigger shared pieces that know about AnyGym. Loose files here are app wide: the shell with the tab bar, error screens, the gate that sends new people to the intake, the "rotate your phone" guard, the gym pill, the music buttons (`MusicLinks`, on a workout's day list and above Start on the Run tab).
- `components/load/`: everything for entering a weight (number pad, plate picture, bar picker, dumbbell wheel, stack selector). These show weights but never do the math; they ask `lib/load/`.
- `components/exercise/`: the exercise sheet with demo, form tips and the video or photo viewer. A demo has 2 frames (the catalog pair, a CSS loop in `FormDemo`) or a 3 or 4 frame sequence (PLAN D1: declared in `data/demo-sequences.json` with one source record, checked by `lib/demoSequence.ts`); `DemoSteps` steps a sequence with a "2 of 4" position, Previous and Next in the sheet and the full screen viewer, `DemoPicture` is the one picture (WebP, JPG, or the offline cached copy). `#/dev/demo-steps?dev` (preview builds only) shows test frames for the spec.
- `components/muscles/`: the body drawing, the muscle picker and the list of exercises for a muscle.
- `components/gym/`: the gym switcher sheet, new gym form and the preview of a switch.
- `components/deck/`: the swipeable card deck used by quick workouts and intake.
- `components/info/`: the small "i" buttons and sheets that explain a word.
- `components/hint/`: the one time hints that point at something.

### src/ui/
Small generic building blocks with no AnyGym knowledge: `Button` (Monolith: heavy text over a line; primary, secondary, quiet, destructive), `Divider` (the 1 px hairline between rows), `WordToggle` (a choice written as a word, the picked one white over an ice line; PLAN M12), `DataField` (a small capital label, a giant tabular number that fits its width, the unit, or an honest `--` blank; `dataFieldFit.ts` measures the number), `Sheet` (the slide up panel), `TopBar`, `TabBar`, `Toast`, `Chip`, `Switch`, `Skeleton` and so on. `#/dev/monolith?dev` shows the Monolith pieces in every state (PLAN M1). Also the motion rules (`motion.ts`: every spring and duration), screen navigation (`nav.ts`), haptics and safe area helpers.
- `ui/art/`: the drawn scenes and pictures for empty states and celebrations. Loaded on demand.
- `ui/art/passport/`: the passport style artwork (leather, paper, ink) used for milestones.
- `ui/icon3d/`: the 3D icon set (PLAN 3.6i). `Icon3D` draws one icon in a fixed slot, with the line icon while it loads, when it cannot load and when the phone saves data; `manifest.json` (written by `scripts/make-icons-3d.mjs`) lists every exported file in `public/icons3d/`.
- `ui/celebrate/`: the big moments (new record, level up). `ui/celebrate/fx/` holds the particle and glow effects.
- `ui/badges/`: the badge shapes and glyphs.

### src/db/
Saving and loading. Everything here talks to the phone's database (Dexie on top of IndexedDB). `schema.ts` lists the tables, `types.ts` describes every saved record, and the rest is one file per job (workouts, gyms, plans, backup, coach data, undo, and so on). `workouts.ts` is just a front door for the `workout*.ts` files next to it. Screens should reach this folder through the helpers in `src/hooks/`.

### src/hooks/
Small React helpers: `useLive` (watch the database and re-draw when it changes), `useNow` (a ticking clock), `useWakeLock` (keep the screen on during a workout), `useWarmPlanPhotos` (saves the current plan's exercise photos for offline in the background, with `lib/planPhotos.ts` and `lib/photoWarm.ts`), `useMedia`, `useInView`, `useQuickTargets` (PLAN Q3a0: Quick's eight targets read from the log once, with Recommended, "Trained yesterday" and the workout each starts; not on screen yet) and a few more. The run engine lives here too (PLAN 4.3): `runEngine.ts` is the one live run of the app, outside any screen so it goes on whatever tab shows (it listens to the phone's positions, saves every few seconds and keeps the screen on with `runWake.ts`); `useRunEngine` hands it to screens, `useHold` and `usePocketDim` follow the finger and the clock for hold to End and dimming, `runFlags.ts` remembers what was said once. This is the bridge between screens and the database. The voice coach's mouth is here too (PLAN 4.4): `voicePlayer.ts` says cues one after the other, `voiceAudio.ts` plays the recorded clips through Web Audio, `voiceSpeech.ts` is the phone's own voice as a stand-in, `voiceWarm.ts` saves the clips for offline in the background.

### src/lib/
Pure logic, the brain of the app. About 70 loose files, one job each, plus folders:
- `lib/load/`: the only place that does weight math (plates, bars, dumbbells, kg and lb, exact adding without rounding errors). A folder with an `index.ts` front door.
- `lib/coach/`: the progression coach. Decides the next weight, when to level up, rest times. A folder with an `index.ts`.
- `lib/generator/`: writes a plan from the intake answers and the gym's equipment. A folder with an `index.ts`.
- `lib/quickStyles/`: builds the quick workout ideas (circuit, superset, strength and others). A folder with an `index.ts`.
- `lib/plan/`: the shared focus budget (`focus.ts`), who gets the extra sets in rank order (`focusCurate.ts`), how picks that overlap share sets (`focusShare.ts`), the words for them (`focusWords.ts`), who the plan put first and why, read from the final numbers (`focusPriority.ts`), one weekday for each plan day on a fixed schedule (`weekdays.ts`), the one next day rule with rest days and the weekly question (`schedule.ts`), which workouts count for the 48 hour rule (`recovery.ts`), keeping the place when the plan is rebuilt and the order its days then come in (`carry.ts`), what the week strip marks as done this week (`weekStrip.ts`), the words Today and the finish screen say about the schedule (`scheduleWords.ts`), and validation of saved focus explanations. Pure functions; data bindings live in `data/focus.ts`, phone reads and weekly writes in `db/schedule.ts` and `db/training.ts`, screens use `hooks/useSchedule.ts`.
- `lib/recovery/`: Quick workout's recovery (PLAN Q1, SPEC 20.3). The six groups (legs, back, chest, shoulders, arms, abs) and their windows, 48 h or 24 h (`groups.ts`); when each group was last trained, counting only workouts with at least 3 logged working sets on it as a primary muscle (`trained.ts`); which targets are fresh, which are recent with the real fact ("Trained today", "Trained yesterday") and which get one of at most 2 Recommended tags (`status.ts`). No history: no claim at all. Pure; the screen only reads it. A folder with an `index.ts`. The log it reads comes from `readRecoveryLog` in `db/training.ts`; `lib/quickTargets.ts` (PLAN Q3a0) turns each of the eight targets into a workout from the existing builders, or says why it is not available here.
- `lib/intake/`: the logic behind the intake questions (options, which plan fits, equipment groups).
- `lib/candidates/`: the checks used to decide whether a new exercise or demo is good enough to ship.
- `lib/reporting/`: problem reports and crash notes, with private details masked before sending.
- `lib/import/`: reading a workout history from another app.
- `lib/gps/`: everything the run tracker works out from the phone's positions (PLAN 4.1, SPEC 12.3): which positions to trust (`filter.ts`), distance (`geo.ts`), standing still and auto pause (`stillness.ts`), pace (`pace.ts`), splits per mile or km (`splits.ts`), the run state fed one position at a time (`tracker.ts`) or a whole run at once (`batch.ts`), and the line to draw with its dashed breaks and smoothing (`draw.ts`). Every threshold and its reason is in `types.ts`. Pure: no screen, no database, no clock. A folder with an `index.ts`.
- `lib/run/`: the Run tab's logic (PLAN 4.2, 4.3). Start screen: run types, goals and picker values, and what is remembered (`goal.ts`); the GPS chip's status and plain words (`gpsStatus.ts`); where map tiles come from and the map credit (`mapSource.ts`); the dark map style built from the app's colors (`mapStyle.ts`, used only by the map file). Live run: the run as one state moved one step at a time (`live.ts`), written down and read back after the app closed (`snapshot.ts`), progress toward a goal (`progress.ts`), the finished run and its summary (`summary.ts`), the route as map coordinates (`routeGeo.ts`), distance and pace as printed (`format.ts`, the one place), press and hold and the lock (`hold.ts`), pocket mode dimming (`dim.ts`). Pure. A folder with an `index.ts`. Saving is in `db/runSetup.ts` and `db/runs.ts`; screens use `hooks/useRunSetup.ts`, `hooks/useGeo.ts` for the phone's position on the start screen, and `hooks/useRunEngine.ts` for the run itself. PLAN 4.4: `intervals.ts` (the interval presets, a custom set, the interval clock) and the folder `lib/run/voice/`, the voice coach's brain: `clips.ts` (the list of every recorded clip, the one source), `manifest.json` (written by `scripts/make-voice-pack.mjs`: each clip's file and length), `compose.ts` (what happened in the run to the clips that say it), `events.ts` (what to say after one step of the run), `settings.ts` (on or off, how often), `schedule.ts` (when each clip plays so they sound like one sentence), `speech.ts` (which of the phone's own voices stands in when a clip cannot be played). The recordings themselves are in `public/voice/`. PLAN 4.6: `efforts.ts` (best efforts along a stored run), `records.ts` (personal records and the records a run newly set), `city.ts`, `ghost.ts`, `privacy.ts` (the share card's 200 m trim), `poster.ts` (the share card as data), `gpx.ts` (a run as a GPX file), `heatmap.ts` (every run in one city). Screens read runs through `hooks/useRuns.ts`; the share card is painted by `screens/run/posterCanvas.ts`.
- `lib/bodyArt/`: the body outline drawings (front and back, male and female) used by the muscle map.
- Loose files worth knowing: `demoSequence.ts` (PLAN D1: which exercises show a 3 or 4 frame sequence; refuses one without a single licensed source record or with a frame file missing), `demoReview.ts` (PLAN D0: reads G's demo review file from `data/reviews/`, refuses one made for another catalog, and applies his verdicts to the one photo gate in `data/exerciseInfo.ts`), `music.ts` (the Spotify and Apple Music links and what they can and cannot do), `progression.ts` (last time and next target), `plans.ts` (plan shapes and timing), `planWorkout.ts` (a plan day as a workout), `setTable.ts` (rows of the set table), `backup.ts` (backup file format), `durable.ts` (keeps live workout state alive if the app is killed).

### src/data/
Small TypeScript files that load the JSON data at the top of the repo (`data/` next to `src/`: exercise catalog, plans, muscle map) and hand it to the app in a safe, checked form. This is where shipped content is bound to code. Data files are exempt from the size limit.

### src/styles/
The look. `tokens.css` is the only place colors, fonts and motion values are defined. `base.css` is the page reset, `transitions.css` holds the screen change animations. Everything else uses these tokens. A test fails if a raw color appears anywhere else.

### src/assets/
Static files shipped with the app. `assets/fonts/` holds the Inter font (with its license).

## The 15 most important files

1. `src/main.tsx`: the app's start. Open it to see what happens at launch and in which order.
2. `src/App.tsx`: every route in one place. Open it to find which screen shows at an address.
3. `src/components/AppShell.tsx`: the frame around the tab screens (tab bar, resume bar, tab arrival animation). Open it when something about the tabs or the bar looks wrong.
4. `src/db/schema.ts`: the list of database tables and every version upgrade. Open it before adding or changing saved data.
5. `src/db/types.ts`: the shape of every saved record (gym, session, set, load, plan). Open it to learn what a "Load" or a "WorkoutSet" is.
6. `src/db/workouts.ts`: the front door to starting, logging, finishing and deleting workouts. Open it to find which `workout*.ts` file holds a given action.
7. `src/lib/load/index.ts`: the front door of the weight math. Open it for any question about plates, bars, dumbbells or kg and lb.
8. `src/lib/progression.ts`: works out "last time" and "next" for one exercise. Open it when a suggested weight or rep count looks off.
9. `src/lib/coach/index.ts`: the coach's front door (levelling up, missed sessions, rest, recovery). Open it to change how the app advises.
10. `src/lib/generator/index.ts`: builds a plan from the intake answers. Open it when a generated plan is wrong or empty.
11. `src/lib/plans.ts`: the plan format, day timing estimates and the "where is the plan now" logic. Open it for anything about plan days or length.
12. `src/screens/workout/WorkoutScreen.tsx`: the live workout. Open it to follow what happens from the first set to finish.
13. `src/screens/workout/SetTable.tsx`: the table where each set is logged. Open it when the weight or reps entry misbehaves.
14. `src/ui/Sheet.tsx`: the slide up panel almost every picker uses. Open it for any sheet drag, close or focus issue.
15. `src/styles/tokens.css`: every color, font and motion value. Open it to change the look; never write a raw color elsewhere.

Honorable mentions: `src/ui/motion.ts` (all springs and durations), `src/ui/nav.ts` (screen transitions), `src/hooks/useLive.ts` (how screens read the database) and `src/lib/backup.ts` (the backup file).
