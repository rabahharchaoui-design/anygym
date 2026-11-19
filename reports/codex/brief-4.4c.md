Codex brief for PLAN item 4.4c, written Nov 19 10:23 at commit 4ce564c7. SPEC.md wins if they disagree; code may have moved since.

## 4.4c implementation brief

**Scope:** Fix the five findings in [PLAN.md](/Users/rabah/projects/anygym/PLAN.md:44). Write a failing test for each before changing production code. Do not fold the separate 4.4b or 4.4a journey work into this item.

### Applicable spec and acceptance checks

1. **SPEC 12.1:** Start leads to a full-screen 3, 2, 1 countdown.
   - The first countdown haptic is initiated synchronously by the gesture that opens it.
   - Subsequent beats remain best effort; actual iPhone haptics require a device check.
2. **SPEC 12.2:** The live run supports Pause and hold to End; a GPS gap breaks the route.
   - An auto-paused runner who is still stationary after a >15-second GPS hole stays auto-paused.
   - That hole adds no distance, moving time, or gap flag to the open split.
   - Pausing or ending does not make the displayed moving time step backward.
3. **SPEC 12.3:** Auto-pause is optional and defaults on; GPS calculations are pure and tested.
   - Moving again resumes using the existing stillness rules.
   - Ordinary moving gaps, manual pauses, GPS filtering, and split/pace behavior retain their rules.
4. **SPEC 12.9:** Finish and History detail show the run’s route, time, pace, and splits.
   - Both dashed-route captions describe manual pauses and the first 15 seconds of a moving GPS gap accurately.
5. **SPEC 12.11 and 13.3:** Persist run data; an interrupted run restores with a route break.
   - Restore paused at the last *durably saved* clock reading; time away is never added.
   - Resume starts a new line segment; no distance or time is invented across the interruption.
6. **SPEC 13.4 and 23.2:** Verify phone layouts and haptic behavior.
   - On iPhone SE and 17 Pro Max, copy is readable and controls remain usable.
   - Automated tests establish that haptic APIs are invoked, not that a physical iPhone vibrates.

**Specification conflict:** SPEC 12.2 says gap time is excluded. PLAN 4.4a/4.4c explicitly retain the first 15 seconds of a *moving* gap to prevent the clock going backward. Implement the planned existing behavior and flag this discrepancy for the spec owner; do not silently claim strict SPEC compliance.

### Production files and design

1. [src/lib/gps/tracker.ts](/Users/rabah/projects/anygym/src/lib/gps/tracker.ts:112) — change `addPoint`’s `v.link === 'gap'` branch.
   - Before `advance`, `holdGap`, and `restart`, handle `state.still && state.autoPause && !leftStill(from, p)`.
   - Update `lastGood` to the accepted point and return a held/still event; keep the standing anchor and still state.
   - Do not add a break, split step, time, distance, held time, or pace sample for this stationary hole.
   - For a point that **has** left the stillness area, preserve an explicit route discontinuity and resume without inventing timed distance across the hole; test the chosen handling against existing gap and resume rules.
2. [src/screens/run/RunSummary.tsx](/Users/rabah/projects/anygym/src/screens/run/RunSummary.tsx:66) and [src/screens/history/RunDetail.tsx](/Users/rabah/projects/anygym/src/screens/history/RunDetail.tsx:67).
   - Replace the identical inaccurate captions. Suggested copy: “A pause is left out. A GPS gap keeps only its first 15 seconds of moving time.”
   - Make clear that dashed lines mark either a pause or GPS loss; keep copy consistent on both screens.
3. [src/lib/run/snapshot.ts](/Users/rabah/projects/anygym/src/lib/run/snapshot.ts:14).
   - Add an optional, validated finite `savedAt` timestamp to `RunSnapshot`; pass it explicitly to `toSnapshot` to keep the logic deterministic.
   - Preserve it through `parseSnapshot`; in `restoreLive`, call `pauseRun(tracker, savedAt)` only for a fitting snapshot with a valid timestamp.
   - Existing snapshots without the field and track-replay fallback retain the current conservative `pauseRun(tracker)` behavior.
4. [src/hooks/runEngine.ts](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:87).
   - Capture `Date.now()` together with the immutable `live` state when preparing each snapshot, **before** the asynchronous queued write.
   - Address the `dirty` guard: elapsed face time alone currently does not make a run dirty, so periodic and hide/pagehide saves can otherwise retain an old timestamp.
   - Keep row and snapshot in the existing atomic `saveLiveRun` transaction; preserve ordered writes, failed-save retries, and finish behavior.
   - Update the initial `startRunRow` snapshot call as well.
5. [src/screens/run/RunStart.tsx](/Users/rabah/projects/anygym/src/screens/run/RunStart.tsx:87) and [src/screens/run/Countdown.tsx](/Users/rabah/projects/anygym/src/screens/run/Countdown.tsx:38).
   - `start` already calls `tick()` inside the Start gesture. Reuse that as beat 3 when countdown opens directly; remove the duplicate mount-effect tick.
   - The first-run pocket sheet delays countdown: initiate the beat-3 tick synchronously from its “Got it” handler too, with no extra effect tick.
   - Use existing `buzz()` for timed 2, 1, GO as best effort; preserve cancel, visibility cleanup, reduced motion, and GPS warmup.
6. [src/lib/run/liveClock.ts](/Users/rabah/projects/anygym/src/lib/run/liveClock.ts:79), [src/hooks/useLiveReading.ts](/Users/rabah/projects/anygym/src/hooks/useLiveReading.ts:13), and pause/end paths in `runEngine.ts`.
   - Reproduce a fix arriving up to `FIX_LAG_MS = 2000` late at auto-pause.
   - Resolve the mismatch between the last displayed whole second and the tracker’s paused/saved time.
   - Merely increasing `FACE_HOLD_SEC` hides a live rollback but can leave summary and restored values behind; test the full Pause **and** End paths before choosing the fix.
   - Keep any credited time out of pace where distance/time is unknown; do not count paused or background time.
7. [reports/test-now.md](/Users/rabah/projects/anygym/reports/test-now.md) — builder adds the required one-line phone test at checkpoint.
   - Example: `4.4c | Tap Start and watch the countdown, then run, pause and end; the clock should hold steady. Later countdown taps may not vibrate on iPhone.`
   - Physical confirmation is still needed; do not report timed iPhone vibrations as proven.

### Data and migration

- No Dexie table, index, or schema migration is needed: the live snapshot is JSON in the existing `kv` entry managed by [src/db/runs.ts](/Users/rabah/projects/anygym/src/db/runs.ts:8).
- Keep snapshot version 1 with an optional field if backward compatibility is maintained; reject or ignore malformed, non-finite, or implausible timestamps conservatively.
- Use the timestamp only with the snapshot that passed the existing last-recorded-point fit check.
- Avoid double credit on repeated restore/save: the restored tracker is already manually paused.
- A sudden kill can lose time since the last successful write; a queued or failed write is not durable. Do not promise exact recovery beyond the saved snapshot.
- Do not change finished-run storage or retroactively rewrite existing runs.

### Edge cases

- `> 15 s` is a gap; exactly 15 seconds is still a normal step. Exercise both boundaries.
- A stationary hole may return a slightly different accepted point: retain the original standing anchor and advance `lastGood` so later timestamps are judged correctly.
- A distant return after auto-pause must not be treated as proven continuous motion; ensure the route does not draw a fake solid segment.
- Test auto-pause **off**, manual pause, rejected fixes, and repeated holes separately; the new stationary branch must not affect them.
- Snapshot while waiting for the first fix, manually paused, auto-paused, immediately after Resume, and after the gap cap: `pendingMs` already defines when credit is zero or capped.
- If `savedAt` precedes `lastGood.t`, is invalid, or the snapshot does not fit its row, never create negative or speculative time.
- A future-stamped or delayed fix and rounding around a whole second can expose a face/save mismatch; cover both rather than only integer timestamps.
- Interval time has its own wall-clock rules; do not accidentally freeze or advance it when repairing moving time.
- Cancel countdown, hide the page, and retry: timers and warmed GPS must stop, and each actual start gesture should produce at most one initial tick.

### Tests and verification

**Vitest — add focused cases to existing suites or adjacent `4.4c` files:**

1. [src/lib/gps/__tests__/tracker.test.ts](/Users/rabah/projects/anygym/src/lib/gps/__tests__/tracker.test.ts) — stationary >15-second hole preserves status, totals, open split, and anchor; next stationary and moving fixes behave correctly.
2. Same suite — exactly 15 seconds, auto-pause off, moving gap, manual pause, and distant return preserve the intended route and pace invariants.
3. [src/lib/run/__tests__/live-4.3.test.ts](/Users/rabah/projects/anygym/src/lib/run/__tests__/live-4.3.test.ts) — snapshot round trip restores the saved face time, paused; resume creates a break without crediting time away.
4. Same suite — old/malformed/mismatched snapshot, no fix, auto-pause, gap cap, and repeated restore do not invent or double-count time.
5. [src/hooks/__tests__/runEngine-4.3.test.ts](/Users/rabah/projects/anygym/src/hooks/__tests__/runEngine-4.3.test.ts) — fake time and queued writes verify a clock-only save gets a fresh timestamp, row/snapshot stay paired, and a failed save retries.
6. [src/lib/run/__tests__/liveClock-4.4a.test.ts](/Users/rabah/projects/anygym/src/lib/run/__tests__/liveClock-4.4a.test.ts) and engine tests — delayed-fix stop reproduces the two-second regression; displayed, paused, and finished values never step backward.
7. Test countdown callbacks with mocked `tick`/`buzz`: direct Start and pocket-sheet paths each invoke the first tick in their gesture; timed beats and cancellation behave as intended.

**Playwright WebKit — add `tests/verify-4.4c.spec.ts`, reusing [tests/helpers/run.ts](/Users/rabah/projects/anygym/tests/helpers/run.ts):**

8. On both requested projects, feed synthetic fixes, reach auto-pause, advance past the hole, and assert unchanged clock/distance; feed movement and verify resume.
9. Save, reload, and inspect the restored paused clock; resume, finish, and verify the route break and saved time.
10. Exercise delayed-fix Pause and hold-to-End, comparing the last visible clock with the paused state and summary.
11. Check countdown beats, cancel/restart, and both summary/detail captions; verify no clipping, horizontal overflow, console errors, or unhandled rejections.
12. Run `npm run test`, `npm run build`, and `npx playwright test tests/verify-4.4c.spec.ts --project="iPhone SE" --project="iPhone 17 Pro Max"`; rerun affected 4.3, 4.4a, 4.4b, and 4.6 verification suites.
13. Ask G to test actual iPhone countdown haptics and real GPS after deployment; Playwright cannot establish either physical behavior.

### Risks and existing-code conflicts

- [src/lib/gps/filter.ts](/Users/rabah/projects/anygym/src/lib/gps/filter.ts:37) permits plausible gap bridging; the stationary exception must run after filtering without weakening normal gap handling.
- [src/lib/run/live.ts](/Users/rabah/projects/anygym/src/lib/run/live.ts:108) accepts GPS timestamps up to two seconds late. Display smoothing and durable accounting must agree, including finish failure and retry.
- [src/hooks/runEngine.ts](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:86) currently saves only when `dirty`; adding a snapshot timestamp without changing that policy leaves the reported reload bug.
- Existing 4.4b split and voice fixes distinguish a real gap from an untimed auto-pause resume. Preserve those distinctions and their regression tests.
- The pocket explainer means the Start tap and actual countdown can be separated by another gesture; moving the mount tick only into `start` misses first-time users.
- No files were edited or tests run for this planning brief.