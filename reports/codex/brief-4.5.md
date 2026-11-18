Codex brief for PLAN item 4.5, written Nov 19 00:08 at commit 6fadad60. SPEC.md wins if they disagree; code may have moved since.

## Scope and acceptance

- PLAN 4.5 is **“Turnaround and way back, ghost run with matching rules”** ([PLAN.md](/Users/rabah/projects/anygym/PLAN.md:42)).
- Do the preceding unchecked 4.4a work first; it changes the countdown and moving-time behavior that 4.5 depends on.
- SPEC §12.5: Distance and Time runs offer an optional **Out and back** switch.
- At half the chosen distance or moving time, show a full-screen **“Turn around”** flash and speak the cue once.
- With Out and back enabled, the map shows a thin straight line to the recorded start and its straight-line distance in the run’s unit.
- SPEC §12.6: offer **“Race your ghost?”** when a usable prior run starts within 50 m.
- If accepted, show a translucent dot progressing along the old route at its recorded pace and an ahead/behind time on the stats page.
- Keep the ghost only while at least 70% of the new route is within 30 m of the old route; turn it off quietly otherwise.
- SPEC §§0, 12.2–12.4, 13.3–13.4 also apply: honest unknowns, local/offline data, truthful GPS gaps, voice settings, accessible portrait layouts, and the device matrix.
- “Similar route” cannot be known at the start. Treat start proximity as a **candidate offer**, then validate the traveled route as evidence arrives.
- Do not implement the finish screen, GPX, History, or full backup integration here; those are PLAN 4.6.

## Implementation map

- [src/lib/run/goal.ts](/Users/rabah/projects/anygym/src/lib/run/goal.ts): add `outAndBack` to `RunSetup`, default `false`, and validate it in `sanitizeRunSetup`.
- Retain the preference across run types, but activate it only for `distance` and `time`; switching to Free or Intervals must not trigger turnaround.
- [src/screens/run/RunStart.tsx](/Users/rabah/projects/anygym/src/screens/run/RunStart.tsx): render the existing shared `Switch` for eligible types and wire it through `useRunSetup().change`.
- Add a small ghost offer component under `src/screens/run/`; use existing sheet/button primitives and a clear decline action.
- Use the trusted current fix from `useGeo`, but recheck proximity against the first accepted live fix before activating the chosen ghost.
- [src/db/runs.ts](/Users/rabah/projects/anygym/src/db/runs.ts): add a read helper for completed candidate runs; exclude the active run, unfinished rows, invalid tracks, and rows without usable timing.
- [src/hooks/useRunSetup.ts](/Users/rabah/projects/anygym/src/hooks/useRunSetup.ts) or a separate hook: load candidates asynchronously, discard stale requests when the fix changes, and keep database access out of screens.
- Add `src/lib/run/turnaround.ts`: pure halfway-crossing and start-distance calculations, using `haversineM` and existing unit formatters.
- Add `src/lib/run/ghostMatch.ts`: pure start eligibility and route-overlap matching, measured by traveled distance, not point count.
- Add `src/lib/run/ghostPlayback.ts`: build a timed route, interpolate the ghost position, and compare elapsed moving times at a matched route position.
- Export the new public helpers through [src/lib/run/index.ts](/Users/rabah/projects/anygym/src/lib/run/index.ts).
- [src/lib/run/live.ts](/Users/rabah/projects/anygym/src/lib/run/live.ts): carry the activated turnaround and ghost state through `startLive` and `liveStep`.
- [src/hooks/runEngine.ts](/Users/rabah/projects/anygym/src/hooks/runEngine.ts): own crossing detection, ghost advancement, and persistence even while the live screen is hidden.
- Reuse the clock established by 4.4a for time-goal crossing and playback; do not create another unrelated screen timer.
- [src/lib/run/voice/events.ts](/Users/rabah/projects/anygym/src/lib/run/voice/events.ts) and `voice/compose.ts`: emit and compose a turnaround event using the existing `turn_around` clip.
- Replace or coordinate the existing generic halfway cue for an enabled Out and back run so the user does not hear duplicate halfway announcements.
- [src/screens/run/LiveRun.tsx](/Users/rabah/projects/anygym/src/screens/run/LiveRun.tsx): display the full-screen cue, including when the map page is selected.
- Use a visible static treatment under reduced motion; do not reuse the current interval flash behavior that suppresses the element entirely.
- [src/screens/run/LiveStats.tsx](/Users/rabah/projects/anygym/src/screens/run/LiveStats.tsx): show a compact, accessible ghost comparison only when a trustworthy comparison exists.
- [src/screens/run/LiveMap.tsx](/Users/rabah/projects/anygym/src/screens/run/LiveMap.tsx): calculate and pass the start line, distance label, and ghost position.
- [src/screens/run/RunMapGl.tsx](/Users/rabah/projects/anygym/src/screens/run/RunMapGl.tsx) and [src/screens/run/mapRoute.ts](/Users/rabah/projects/anygym/src/screens/run/mapRoute.ts): add a separate line source/layer and ghost marker; restore them on `style.load` and remove stale geometry.
- Keep map colors in existing design tokens; use the existing CSS modules and reduced-motion conventions.
- Update [src/MAP.md](/Users/rabah/projects/anygym/src/MAP.md) to describe the new run helpers.
- Keep files near 300 lines and split responsibilities if touched files grow; `LiveRun.tsx` is already 257 lines.

## Data and persistence

- `runs` is already indexed by `id, startedAt`; `Run.ghostOfRunId` already exists in [src/db/types.ts](/Users/rabah/projects/anygym/src/db/types.ts:368).
- Add optional `outAndBack` and, if needed, explicit ghost timing metadata to `Run`; missing fields mean off or unavailable.
- Persist the accepted ghost ID, turnaround-fired state, matching progress, and playback clock in `RunSnapshot`.
- Extend `liveRow`, `toSnapshot`, `parseSnapshot`, and `restoreLive` in [src/lib/run/snapshot.ts](/Users/rabah/projects/anygym/src/lib/run/snapshot.ts).
- Preserve reading version-1 snapshots: validate new optional fields and default safely; do not discard a recoverable active run for absent 4.5 fields.
- Store setup in the existing `RUN_SETUP_KEY`; `saveLiveRun` already commits the row and snapshot in one transaction.
- No Dexie version change is needed for optional non-indexed properties or the existing `kv` store.
- On restore, remain manually paused as today; preserve whether turnaround fired and never replay it solely because the app reopened.
- Historical `RunPoint` timestamps and `gaps` do **not** fully encode auto-pause moving time. Do not invent precise ghost timing from them.
- Record per-point moving-time anchors for new runs; offer older runs only where timing can be reconstructed without ambiguity, otherwise omit them.

## Decisions and edge cases

- Define the start as the first accepted recorded point, never a denied, rejected, stale, or merely displayed fix.
- No valid start or current fix: omit the line and distance; Start remains available.
- Distance midpoint uses trusted tracker distance; Time midpoint uses the same moving-time semantics as the displayed clock.
- A large fix or tick may cross both halfway and goal: fire turnaround once, even if the generic goal cue also occurs.
- Pause, auto-pause, reload, GPS gaps, and hidden screens must not advance a moving-time ghost or retrigger the cue.
- For overlap, compare continuous trusted route segments to old segments within 30 m; do not count dashed gaps as known traveled geometry.
- Use a documented minimum evidence distance before applying 70%, so the first noisy fix cannot immediately disable the ghost.
- If insufficient evidence remains, hide an uncertain comparison; once a sufficiently evidenced route fails the threshold, disable quietly for that run.
- At crossings, loops, and out-and-back overlaps, constrain matching to forward progress along the old route; nearest point alone can jump between legs.
- Interpolate only within continuous, timed segments; never interpolate through a gap or beyond the old route’s end.
- If no reliable corresponding point or time exists, omit the ahead/behind number rather than showing zero or extrapolating.
- Define tie-breaking for multiple eligible prior runs deterministically, for example nearest start then most recent; allow decline without blocking Start.
- A selected run deleted or unavailable on restore disables the ghost quietly; neither the live run nor its saved route should fail.
- The straight line to start is navigation context, not a claimed route or tracked distance; keep it visually distinct from the recorded route.

## Tests

- Vitest `src/lib/run/__tests__/turnaround-4.5.test.ts`: both goal types, exact boundary and overshoot, disabled types, pause, unknown GPS, and one-shot restore.
- Vitest `ghost-match-4.5.test.ts`: 50 m and 30 m boundaries, exactly 70%, below threshold, uneven point spacing, sparse segments, gaps, and insufficient evidence.
- Vitest `ghost-playback-4.5.test.ts`: interpolation, faster/slower/equal comparisons, loop crossings, pauses, gaps, end of route, and missing timing.
- Vitest `src/db/__tests__/runs-4.5.test.ts`: completed candidate filtering, deterministic selection inputs, persistence, and missing or deleted ghost.
- Extend `live-4.3.test.ts` and `runEngine-4.4.test.ts`: hidden-screen crossing, voice event once, pause/resume, reload, and concurrent save ordering.
- Extend voice composition tests: `turn_around` exists in the shipped manifest, is selected once, and honors voice-off settings.
- Extend setup/snapshot tests: old setup and snapshot defaults, malformed optional data, live and finished round trips.
- Playwright `tests/verify-4.5.spec.ts`: use [tests/helpers/run.ts](/Users/rabah/projects/anygym/tests/helpers/run.ts) with synthetic GPS and clock.
- Test Out and back on Distance and Time: midpoint flash and voice event, map line and unit label, no second cue after pause or reload.
- Seed a valid completed route: accept and decline the offer, verify dot and ahead/behind, then diverge below 70% and verify quiet removal.
- Test denied GPS, no prior run, reduced motion, offline map, and screen-reader labels without blocking Start.
- Run WebKit projects **iPhone SE** and **iPhone 17 Pro Max** explicitly; check controls, cue, labels, safe areas, and no clipping on both.
- Run the normal matrix subset as required by SPEC §13.3, plus `npm run test`, `npm run build`, and the targeted Playwright spec.

## Risks and existing conflicts

- The 4.4a moving-clock fix is unchecked; basing time turnaround on today’s fix-driven `readLive` would reproduce the six-second jumps.
- The existing interval flash disappears under reduced motion; turnaround needs its own accessible visible state.
- Existing halfway voice logic fires for every goal, including Out and back; coordinate it with the new cue.
- `RunPoint` and `gaps` lack enough information to reconstruct every old run’s moving-time playback accurately; legacy ghost availability will be limited.
- Current `RunMapGl` lazily loads and recreates style layers after connectivity returns; both new overlays must survive that lifecycle.
- Full run backup/restore is scheduled for 4.6, and PLAN already notes that a mid-run backup can restore an active run; do not claim that issue is resolved by snapshot changes.