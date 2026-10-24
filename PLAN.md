# PLAN.md: AnyGym work queue

Worked top to bottom by the orchestrator (see PROMPT.md). One item at a time. Mark an item [x] with a one line note when done. Each session has its own tag, branch, report and merge gate. SPEC.md is the source of truth; if this file and SPEC.md disagree, SPEC.md wins.

Rules for every item: iPhone portrait first (Playwright WebKit on iPhone SE, 15 Pro and 15 Pro Max), offline first, no clutter, plain words, swift transitions, zero console errors (SPEC 13), exact weight math, never commit anything from ~/anygym-private/. Every merge gate includes the ux-critic pass (PROMPT.md).

CHECKPOINT RULE (added by G, Oct 23 9 PM, applies from the next item on): G uses the live app at the gym every day while this builds.
- After every item that passes the tester, ship it: merge the session branch into master (no fast forward), run the Playwright smoke tests on master, push, wait for the Pages deploy to go green, run the live check, then switch back to the session branch. Items before 1.2 is done skip this.
- Master must always be usable. Never ship a half feature that breaks logging, history or saved data. Hide unfinished screens behind a simple flag instead.
- Saved data is sacred: every Dexie schema change is an additive migration with a test that opens data from the previous version and finds every set still there.
- Updates must never interrupt a workout or a run: with the PWA auto update, only reload when no workout or run is active; otherwise wait and show a small "Update ready" chip.
- The session merge gate (ux-critic, full test suite, report) still happens at the end of each session.

## SESSION 1: FOUNDATION AND THE LOGGER
Tag: pre-s1 · Branch: s1-foundation · Report: reports/session-1.md

- [x] 1.1 Scaffold: Vite + React + TS, HashRouter, `base: '/anygym/'`, vite-plugin-pwa (manifest per SPEC 1, offline precache of app shell), design tokens and fonts (SPEC 10), app shell with bottom tabs Today · Run · History · Plans and a Settings icon on Today (SPEC 8). Vitest and Playwright (WebKit, iPhone 15 Pro) configured with one smoke test each. GitHub Actions workflow that builds and deploys to Pages. (done: Vite 8, React 18, Space Grotesk self hosted, 1 Vitest + 2 Playwright specs green, tester PASS)
- [x] 1.2 Go live: `gh repo create rabahharchaoui-design/anygym --public --source=. --remote=origin`, push master, enable Pages with build type "workflow" (`gh api -X POST repos/rabahharchaoui-design/anygym/pages -f build_type=workflow`, or PUT if it exists), confirm the Actions run succeeds and https://rabahharchaoui-design.github.io/anygym/ loads. Add `tests/live_check.spec.ts` that loads the live URL and checks the shell renders. README with "Add to Home Screen" steps. (done: repo public, Pages build_type workflow, first deploy dispatched from s1-foundation after adding it to the github-pages environment branch policy; live 200; test:live green)
- [x] 1.3 Dexie schema v1 (SPEC 2) and gym profiles with defaults (SPEC 3, bars and plate inventory from SPEC 5.3). First launch creates one gym "My Gym" (full, lb) until onboarding exists. (done: 7 tables, 27 equipment ids, presets, bars null unless standard, stack step 5/2.5 default; 21 Vitest, Playwright green on SE/15 Pro/Pro Max; full gym dumbbells default 5 to 100 lb step 5 as an editable preset)
- [ ] 1.4 `src/lib/load.ts` weight math (SPEC 5.4) with exhaustive Vitest tests: sums, solver exact and nearest, round trips, overflow, lb and kg, Smith plates only, plate loaded machines, display rounding, exact 0.45359237 conversion. 100% line coverage on this file.
- [ ] 1.5 Plate diagram (SPEC 5.3): SVG plates to real proportions from the tables, black iron and color coded modes, symmetric slide on animation, tap to remove outermost, long press adds a pair, sleeve overflow block, live total plus math line. "Type it" number pad that uses the solver. Report must include screenshots of 135 lb, 185 lb, 315 lb, 60 kg and 102.5 kg loaded bars, each with the math line visible, and the tester confirms drawn plates equal the math.
- [ ] 1.6 Other load inputs (SPEC 5.2): dumbbell wheel (each hand), single weight, stack selector, plate loaded machine (diagram on a horn, starting resistance), bodyweight with optional added load, timed.
- [ ] 1.7 Set card and rest timer (SPEC 5.1) plus a "Quick workout" flow: start an empty workout, add exercises from a temporary list of the plan exercises, log sets. Edit and delete sets. Wake lock during workouts.
- [ ] 1.8 Backup and restore (SPEC 9.1, 9.2) via share sheet with download fallback. Round trip test.
- [ ] 1.9 Progression engine (SPEC 6) as pure functions with tests for every rule, then "Last time" and "Next" lines on the set card.
- [ ] 1.10 G's programs, early: load data/plans/ohrabah-split.json and six-week-volume.json as startable plans. Today shows "Pick a plan", then the day list; starting a day opens the workout with that day's exercises, sets, rep ranges, rest times, pairs (supersets) and notes, using the load inputs from 1.6. Exercises without a catalog match yet show the name and plan notes with no demo (never a wrong demo).
- [ ] 1.11 Import history, early (SPEC 9.3): Settings → Import history with the review screen, uncertain sets highlighted, unknown load types asked. Map by planExercise name to the plan exercises from 1.10 so "Last time" and "Next" work on G's own workouts. Test with a synthetic fixture in the repo and with ~/anygym-private/g-history.json copied to a temp dir at test time only (never committed).
- [ ] 1.12 Test harness for SPEC 13.3: three device profiles, console error trap that fails any test, monkey test helper, generated 2 year history fixture, kill and restore helpers. Then the Session 1 merge gate: ux-critic pass, full Vitest and Playwright pass, merge to master, push, confirm deploy, run live check, write report with an iPhone hand test list.

## SESSION 2: CATALOG, FORM DEMOS, MUSCLES
Tag: pre-s2 · Branch: s2-catalog · Report: reports/session-2.md

- [ ] 2.1 `scripts/build-catalog.ts`: fetch yuhonas/free-exercise-db pinned to a commit SHA (record it), build the curated subset (SPEC 4.1, 4.2), optimize images into public/ex/, write `data/exercise-map.json` for every exercise in data/plans/*.json with match exact, variant or none (SPEC 4.3), write CATALOG_REPORT.md. When unsure, use none.
- [ ] 2.2 Muscle map component ported from react-body-highlighter (MIT, license in third_party/), muscle mapping and data/muscle-overrides.json (SPEC 4.5), text labels under the map.
- [ ] 2.3 Exercise sheet (SPEC 4.4): crossfading two photo demo, muscle map, up to 3 cues condensed from the source instructions (store which source lines each cue came from), optional watch out line, good for line, "Demo coming soon" state for match none. Collapsed version inside the workout.
- [ ] 2.4 Review screen (SPEC 9.4) with export.
- [ ] 2.5 Tester audit: open both images for every exact and variant match and confirm they show the named movement and implement. Anything doubtful gets downgraded to none. Audit table in the report. Spot check 20 cues against source instructions.
- [ ] 2.6 Session 2 merge gate (same as 1.10).

## SESSION 3: PLANS, IMPORT, ONBOARDING, SWAPS
Tag: pre-s3 · Branch: s3-plans · Report: reports/session-3.md

- [ ] 3.1 Finish curated plans (started in 1.10): catalog mapping and demos inside plan workouts. Load curated plans from data/plans/ (The OhRabah Split, Six Week Volume Builder), plan viewer, start a plan day into a workout, supersets grouped, weekly table progression for the six week plan.
- [ ] 3.2 Finish import (started in 1.11): remap imported exercises to catalog ids. Import history (SPEC 9.3) with the review screen. Test with ~/anygym-private/g-history.json copied into a temp dir at test time only (never commit it or any fixture made from it; write a small synthetic fixture for the repo tests instead).
- [ ] 3.3 Onboarding questionnaire (SPEC 7.1). This is the first impression: make it beautiful, fast and obvious. Use the frontend-design skill.
- [ ] 3.4 Movement pattern ladders and swap engine (SPEC 7.2), Swap button in the workout, auto swap when a plan meets missing equipment.
- [ ] 3.5 Plan generator (SPEC 7.3) and the three generated curated plans frozen to JSON (SPEC 7.5 items 3 to 5).
- [ ] 3.6 Time budget sheet and trimming (SPEC 7.4) with tests.
- [ ] 3.7 Session 3 merge gate.

## SESSION 4: RUN WITH ME
Tag: pre-s4 · Branch: s4-run · Report: reports/session-4.md

- [ ] 4.1 `src/lib/gps.ts` (SPEC 12.3): filtering, smoothing for drawing, haversine distance, rolling pace, auto pause, splits, gaps. Synthetic track fixtures and full Vitest coverage.
- [ ] 4.2 Map (SPEC 12.10): MapLibre GL + OpenFreeMap dark style tuned to the palette, offline fallback. Run start screen with run types, distance and time pickers, music buttons, 3 2 1 countdown (SPEC 12.1).
- [ ] 4.3 Live run screen (SPEC 12.2): stats page and map page, pause, lock, hold to end, pocket mode with wake lock and dimming, honest dashed gaps, one time pocket mode explainer.
- [ ] 4.4 Voice coach and intervals (SPEC 12.4, 12.7).
- [ ] 4.5 Turnaround and way back, ghost run with matching rules (SPEC 12.5, 12.6).
- [ ] 4.6 Finish screen, PRs, share card with privacy zone, runs in History with run detail and city heatmap, GPX export per run (SPEC 12.9, 12.12). Runs included in backup and restore.
- [ ] 4.7 City passport with the offline GeoNames list, lazy loaded only in the Run tab (SPEC 12.8). Credit on About.
- [ ] 4.8 Playwright run simulation: grant geolocation, feed a synthetic 5 km loop through setGeolocation, check distance within 1%, splits, pause, gap, ghost and turnaround cues. Then the session merge gate.

## SESSION 5: POLISH AND SHIP
Tag: pre-s5 · Branch: s5-polish · Report: reports/session-5.md

- [ ] 5.1 Today screen, History (calendar, session detail, per exercise chart), workout finish summary with share card (SPEC 8).
- [ ] 5.2 Settings complete (SPEC 8.7) including Gyms → Equipment weights, gym switcher pill, music buttons, plate color toggle, run settings.
- [ ] 5.3 Offline test (Playwright setOffline after first load), install checks, performance budget (initial JS under 400 KB gzip excluding images, map and city list lazy loaded).
- [ ] 5.4 Design polish pass across every screen with the frontend-design skill: spacing, type scale, motion, empty states, reduced motion. Before and after screenshots in the report.
- [ ] 5.5 Final merge gate and a full iPhone hand test list covering onboarding, a full logged workout, plate diagram, import, swap, time budget, a real outdoor test run, backup.

=== STOP HERE UNLESS TOLD OTHERWISE ===

## LATER (do not start)
- Supabase login (Google and email) and sync, once G creates the project and sends the keys.
- Apply G's review export to the catalog.
- Swap free photo demos for licensed animations if G buys a pack.
- NATIVE PHASE (needs G's Apple Developer account, $99/yr): wrap the app with Capacitor for TestFlight and the App Store. Unlocks GPS with the screen locked, Apple Health (save lifting workouts and runs with routes, read heart rate and resting heart rate), and Live Activities on the lock screen during runs.
- Apple Watch companion app (SwiftUI, after the native phase): start and end runs and workouts from the wrist, live heart rate, haptic split and interval cues, and log sets with the Digital Crown.
- Strava upload (OAuth through a small Cloudflare Worker that holds the client secret), so runs post to Strava automatically.
- In app bug report button like Pocket Sim.
- Spotify mini player in the workout bar (now playing, play/pause, skip, workout playlists) via the Spotify Web API with PKCE. Spotify Development Mode caps an app at 5 users with Premium, so this is for G and testers only until Spotify grants extended quota.
- Apple Music mini player via MusicKit JS (needs G's Apple Developer account and a MusicKit key). Works for any Apple Music subscriber.
