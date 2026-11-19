Codex brief for PLAN item 4.6a, written Nov 19 14:45 at commit c1e0e596. SPEC.md wins if they disagree; code may have moved since.

## Implementation brief: PLAN 4.6a

**Scope:** nine review fixes in [PLAN.md](/Users/rabah/projects/anygym/PLAN.md:52). Write a failing test for each before its fix. Keep the work in this item; do not take on the separate History performance finding or 4.5.

### SPEC and acceptance checks

- **§0, §4.5 — no bad data and exercise-specific shoulder labels:** a bench press must not claim side delts; lateral raises must not claim front delts solely because both share a drawing region. Unknown mappings stay unknown.
- **§12.3 — GPS:** auto-pause uses the 0.5 m/s, eight-second rule; an uncertainty-based distance filter must not silently freeze a walking clock.
- **§12.9 — finish and History:** retained short runs explain that they are too short to measure; no-position runs explain the GPS failure. Proven records and ghost results remain available after a successful read.
- **§12.12 — GPX:** each run exports a valid GPX, including two runs started on the same day; filenames must distinguish them.
- **§13.1, §13.3 — errors and accessibility:** failed reads say what failed and offer a working retry; the share preview has a useful accessible description.
- **§13.3 — restore:** a killed run restores paused; a corrupt future snapshot timestamp cannot invent moving time.
- **§13.4 — phones:** verify the changed UI in WebKit on iPhone SE and iPhone 17 Pro Max; the full UI matrix remains the project standard.

### Files and implementation

- [RunDetail.tsx](/Users/rabah/projects/anygym/src/screens/history/RunDetail.tsx): retain the result of `runVerdict(row)` and render `VERDICT_WORDS[verdict]` for each non-`ok` case, as `RunSummary` already does.
- Preserve the `run-detail-plain` test seam and the existing redirect only for a successfully loaded, missing run.
- [HistoryScreen.tsx](/Users/rabah/projects/anygym/src/screens/HistoryScreen.tsx): render `LoadError` for `runsRead.error` with `runsRead.retry`.
- Suppress the “No workouts yet” empty state when either required read failed and no last-good feed exists.
- Keep any last-good workouts and runs visible with the relevant error; `useLive` deliberately retains data on failure.
- [RunFacts.tsx](/Users/rabah/projects/anygym/src/screens/run/RunFacts.tsx): show `LoadError` with `all.retry` even when `!cele.settled && !ghost` would currently return `null`.
- Keep hook calls unconditional; do not calculate or announce records from an invented empty run list.
- [stillness.ts](/Users/rabah/projects/anygym/src/lib/gps/stillness.ts): make `isStill()` use the fixed `STILL_RADIUS_M` of 4 m for the eight-second clock decision.
- Keep `stillRadiusM()` as the uncertainty-based distance threshold; give clock and distance decisions distinct names and comments.
- [tracker.ts](/Users/rabah/projects/anygym/src/lib/gps/tracker.ts): separate movement-clock state from suppression of uncertain distance.
- When a walker leaves the fixed clock circle, resume time without waiting for the accuracy-sum `resumeRadiusM()`; use an accumulated anchor for distance so small steps are not lost forever.
- Preserve manual pause, auto-pause-off, split/pace accounting, filtering, and 4.4c gap handling.
- [runEngine.ts](/Users/rabah/projects/anygym/src/hooks/runEngine.ts): in `startWatch()`, clear `replayOf` before returning for the first matching callback.
- Subsequent callbacks at the same coordinates must reach `dispatch({ type: 'fix', ... })`; a different first callback must still clear the guard and be processed.
- [fresh.ts](/Users/rabah/projects/anygym/src/lib/coach/fresh.ts): carry confirmed primary muscle labels alongside region bands, preserving the latest applicable band per label.
- Trace the input through [coachData.ts](/Users/rabah/projects/anygym/src/db/coachData.ts), [useCoach.ts](/Users/rabah/projects/anygym/src/screens/today/useCoach.ts), [TodayScreen.tsx](/Users/rabah/projects/anygym/src/screens/TodayScreen.tsx), and [FreshMuscles.tsx](/Users/rabah/projects/anygym/src/screens/today/FreshMuscles.tsx).
- Use `resolveMuscles()` and its `SHOULDER_PARTS` labels from [muscles.ts](/Users/rabah/projects/anygym/src/lib/muscles.ts); regions alone cannot distinguish front from side.
- Change `freshWords()` to describe the confirmed labels for each band; retain region bands for drawing and preserve the unmapped-exercise message.
- [MuscleMap.tsx](/Users/rabah/projects/anygym/src/components/muscles/MuscleMap.tsx): pass relevant resolved exercise labels to the exercise-list sheet when there is exercise context.
- [MuscleExercises.tsx](/Users/rabah/projects/anygym/src/components/muscles/MuscleExercises.tsx): use that confirmed label for the sheet title, accessible sheet label, list label and back text.
- For a generic map without exercise context, use a neutral region title; do not pretend the region identifies a particular delt. Preserve the shared anatomical tap line.
- [records.ts](/Users/rabah/projects/anygym/src/lib/run/records.ts): derive the displayed “faster” amount from `Math.floor(previous) - Math.floor(mine)`, matching `formatElapsed()`.
- Preserve raw-value record ordering and the existing one-second minimum improvement for celebrations; update only the displayed delta.
- [gpx.ts](/Users/rabah/projects/anygym/src/lib/run/gpx.ts): include local start time and a filename-safe run ID in `gpxFileName()`.
- An `HHmm` suffix alone does not distinguish runs in the same minute or a repeated local time during a DST change.
- [RunShare.tsx](/Users/rabah/projects/anygym/src/screens/run/RunShare.tsx): construct the canvas accessible name from `posterOf()`’s city when present, distance, time, pace and privacy note.
- Describe a fully hidden route and a trimmed route accurately; expose no coordinates.
- [snapshot.ts](/Users/rabah/projects/anygym/src/lib/run/snapshot.ts): give `restoreLive()` an explicit current-time argument and accept `savedAt` for `pauseRun()` only when finite and within `[row.startedAt, now]`, and not before the last good fix.
- [runEngine.ts](/Users/rabah/projects/anygym/src/hooks/runEngine.ts): pass `Date.now()` at the restore call; update other callers and tests.
- Invalid or absent `savedAt` restores paused without adding pending time; retain the existing snapshot-fit and track-replay fallback.

### Data model and migration

- **No Dexie migration or persisted schema change is needed.** Labels and bands can be derived from existing catalog overrides and workout data.
- Extending the in-memory `TrainedSet`/coach view is needed because its current `regions` field has already lost shoulder-part identity.
- Keep old snapshots readable: `savedAt` remains optional, and an invalid value is ignored for pending-time credit.
- GPX naming changes only exported filenames; existing run IDs and stored records remain intact.

### Edge cases and conflicts

- The shared front-deltoid drawing region represents both front and side delts. Multiple recent exercises can supply both labels, potentially in different freshness bands; deduplicate by **label and band**, not region.
- A muscle exercise list contains all exercises for a region, including front and side variants. An exercise-specific heading must not imply that every listed row targets only that part; use neutral wording or narrow the list consistently.
- `isStill()` currently uses the wider accuracy circle, and `leftStill()` uses the sum of accuracy radii. Changing only `isStill()` leaves the walking clock stuck after auto-pause.
- Noisy stationary GPS and slow walking overlap at 20 m accuracy. Test the tradeoff using the existing seeded fixtures; do not claim perfect identification from uncertain fixes.
- `useFinishedRuns()` reads both runs and unit; either failure is a failed runs read. Retry must not erase a prior successful feed or cause a false empty state.
- A read failure after `RunFacts` has already shown a celebration must not retrigger or duplicate it after retry.
- Repeated same-position fixes must clear GPS-lost status without adding invented distance or bypassing timestamp and accuracy filters.
- A future `savedAt` can currently add up to 15 seconds through `pendingMs()`; do not clamp it to now, which could still invent time.
- Existing 4.4b tests explicitly expect the wide circle in `isStill()`; revise that expectation and retain their meaningful stationary-distance coverage.
- Q1 also changes recovery logic, but its planned three-set rules are separate from Today’s existing one-working-set freshness display. Avoid conflating them.

### Tests and verification

- Vitest: extend [stillness-4.4b.test.ts](/Users/rabah/projects/anygym/src/lib/gps/__tests__/stillness-4.4b.test.ts) with the fixed 4 m boundary, eight-second threshold, and a 1 m/s walk at 20 m accuracy whose clock advances.
- Vitest: retain seeded stationary-noise checks with auto-pause on and off; assert bounded drift, accumulated walking distance, pause/resume and split consistency.
- Vitest: extend [runEngine-4.4b.test.ts](/Users/rabah/projects/anygym/src/hooks/__tests__/runEngine-4.4b.test.ts): restart watch, drop one replay, accept the next identical fix, and clear GPS-lost status.
- Vitest: exercise fixed-circle movement after auto-pause, manual pause, a gap over 15 seconds and the existing 4.4c clock rules.
- Vitest: test freshness labels for bench, lateral raise, both together, separate bands, missing override and warmup-only data; confirm the SVG region bands remain unchanged.
- Vitest: test exercise-sheet label selection with exercise context and the neutral fallback without it.
- Vitest: extend [finish-4.6.test.ts](/Users/rabah/projects/anygym/src/lib/run/__tests__/finish-4.6.test.ts) with fractional record times crossing displayed second boundaries and the one-second celebration threshold.
- Vitest: test GPX names for same day, same minute and repeated local time; retain [gpxParse-4.6.test.ts](/Users/rabah/projects/anygym/src/lib/run/__tests__/gpxParse-4.6.test.ts) to prove valid segments and timestamps.
- Vitest: extend [fixes-4.4c.test.ts](/Users/rabah/projects/anygym/src/lib/run/__tests__/fixes-4.4c.test.ts) for future, pre-start, pre-fix, valid and absent `savedAt`, including a mismatched snapshot.
- Playwright: add `tests/verify-4.6a.spec.ts`; seed retained no-GPS and sub-50 m runs and assert distinct detail wording, with no fabricated stats.
- Playwright: inject a runs-read failure on History and finish summary; assert the error and retry, no false empty state, retained last-good data where applicable, and successful recovery.
- Playwright: inspect the share canvas accessible name with privacy on, off and a fully hidden route; assert its values match the poster.
- Playwright: exercise bench and lateral-raise muscle contexts, including the sheet’s accessible title and generic-map fallback.
- Run the new UI spec on `--project="iPhone SE"` and `--project="iPhone 17 Pro Max"`; check no horizontal overflow or clipped controls.
- Run `npm run test`, `npm run build`, and the relevant existing 4.3, 4.4b, 4.4c and 4.6 Playwright regressions; run the wider device matrix required by §13.3–13.4.