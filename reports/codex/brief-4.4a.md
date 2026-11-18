Codex brief for PLAN item 4.4a, written Nov 19 00:06 at commit 84e0adb1. SPEC.md wins if they disagree; code may have moved since.

# Implementation brief: PLAN 4.4a

PLAN has two entries numbered 4.4a: the live-run hand-test fixes and a conditional golden-journey investigation. Complete the deployment prerequisite first, then the run changes; investigate the journey if it fails again.

## Applicable spec and acceptance checks

- **SPEC 12.1:** Start screen has the map, run types, music links and a full-screen 3–2–1 countdown.
- **PLAN 4.4a adds:** large heavy Inter digits, about 60% of screen height without clipping, ice blue `#9FD3FF` and graphite, no lime, haptic per beat and a distinct GO beat.
- Use the designer as the plan directs. Transitions use only transform and opacity; reduced motion uses fades.
- **SPEC 12.2–12.3:** show moving time, pause correctly, filter fixes and exclude GPS-gap time. Distance and pace may update per fix.
- The live time face advances once per second between six-second GPS fixes, stops on manual and auto pause, and never visibly moves backwards.
- **SPEC 12.7:** preserve interval ring, cues and its existing wall-time clock; manual pause freezes intervals, auto pause does not.
- **SPEC 13.2–13.4 and 23:** 60 fps, no console errors, accessible controls and safe areas, reduced motion, fluid layout and the full phone matrix.
- Record before/after screenshots and main-flow videos for iPhone SE and 17 Pro Max; capture each countdown beat on both.
- **SPEC 20.2:** after the last set, the “Nice” cue may return to the workout list; it must not eject the user to Today.

## First: restore the 4.4 deployment

- In [tests/golden/02-log-finish-history.spec.ts](/Users/rabah/projects/anygym/tests/golden/02-log-finish-history.spec.ts:30), import `type Page` from `../fixtures`, which already exports it.
- Preserve [src/lib/__tests__/spec-imports.test.ts](/Users/rabah/projects/anygym/src/lib/__tests__/spec-imports.test.ts); do not relax its guard.
- Run `npm test`, push `s4-run`, watch CI pass, redo the 4.4 checkpoint merge and verify the deployed `index.html` script name changed.
- Send the plan’s 4.4 “test now” push only after the live deployment is confirmed.
- This brief does not verify current CI or deployment state; the checkout still contains the forbidden type import.

## Live clock: files and behavior

- Add a pure helper such as `liveMovingSec` in a focused new file under [src/lib/run/](/Users/rabah/projects/anygym/src/lib/run/), exported by [index.ts](/Users/rabah/projects/anygym/src/lib/run/index.ts).
- Base it on `TrackerState.movingMs`, `lastGood.t`, `manual`, `afterPause`, `still` and `autoPause`; `TrackerReading` alone lacks the timestamp needed.
- While status is running and there is a trusted anchor, estimate the display time from committed moving time plus nonnegative time since that anchor.
- Do not extrapolate while waiting for GPS, manually paused, auto-paused or awaiting the first fix after manual resume.
- Keep the estimate out of `readTracker`, `liveRow`, pace, splits, voice cues and saved totals; those remain based on accepted fixes.
- Add a visibility-aware, second-boundary scheduler in [src/hooks/](/Users/rabah/projects/anygym/src/hooks/); the existing `useNow` uses an unaligned interval.
- Mount one shared display tick in [LiveRun.tsx](/Users/rabah/projects/anygym/src/screens/run/LiveRun.tsx) only while the live screen is mounted and the document is visible.
- Derive one display reading there and pass it to [LiveStats.tsx](/Users/rabah/projects/anygym/src/screens/run/LiveStats.tsx) and the live-map readout.
- Keep time-goal progress consistent with the displayed time if it uses that reading; leave pace and distance based on the original reading.
- Do not replace the engine’s 250 ms interval timer: it serves interval cues even when the live screen is hidden.

## Countdown and GPS handoff

- Replace the expanding circle and `AnimatePresence mode="popLayout"` in [Countdown.tsx](/Users/rabah/projects/anygym/src/screens/run/Countdown.tsx).
- Remove `Origin` and the Start-button geometry calculation from [RunStart.tsx](/Users/rabah/projects/anygym/src/screens/run/RunStart.tsx).
- In [Countdown.module.css](/Users/rabah/projects/anygym/src/screens/run/Countdown.module.css), use a full-screen graphite layer, fluid viewport-constrained ice-blue digits and a reachable Cancel control.
- Size GO separately if needed so its two letters fit; check actual bounds, safe areas and 130% text scaling on every phone.
- Keep `run-countdown`, `run-count` and `run-count-cancel` selectors; expose each beat accessibly and call `onDone` only after GO.
- Fire one haptic on entry to each beat; account for the existing Start tap so 3 does not receive an unintended double tick.
- Unmount `RunMap` during countdown in `RunStart`, then restore it on cancellation; hiding a canvas alone may leave MapLibre rendering.
- Start a high-accuracy GPS watch at countdown entry, including after the pocket explainer; transfer a fresh, filtered candidate to the run at GO.
- Implement watch ownership explicitly across [useGeo.ts](/Users/rabah/projects/anygym/src/hooks/useGeo.ts) and [runEngine.ts](/Users/rabah/projects/anygym/src/hooks/runEngine.ts): avoid two concurrent watches, and clear the temporary watch on cancel, hide and unmount.
- Do not create a run row, start intervals or play the run-start cue until GO completes.
- Do not count pre-GO time or distance: seed the starting location with a GO-time anchor only if the fix is fresh and valid; otherwise wait for a new fix.
- Preserve Start with denied or unavailable GPS, the one-time pocket explainer, voice unlock from the user tap and cancellation on backgrounding.
- Confirm the console is clean under the existing CSP; close issue #2 with the fix commit link after verification, as the plan directs.

## Data and migration

- No Dexie schema migration is inherently needed: the interpolated clock and countdown fix can remain ephemeral.
- `runs.movingSec`, `points`, `gaps`, splits and snapshot version 1 retain their current meaning in [snapshot.ts](/Users/rabah/projects/anygym/src/lib/run/snapshot.ts).
- If the implementation instead persists a reconciliation offset, specify its semantics, backward-compatible snapshot parsing and restore behavior before changing the model; do not silently store estimated GPS-gap time.

## Edge cases and design conflict

- **Fundamental conflict:** a pure estimate cannot guarantee both a never-decreasing display and exact exclusion of a gap discovered only by a later fix.
- `addPoint` treats an interval over `GAP_SEC` as zero moving time; auto-pause detection can likewise reveal that extrapolated seconds were not earned.
- A displayed high-water mark can prevent a backwards jump, but it can temporarily exceed the authoritative saved time and must not contaminate splits or pace.
- Decide and document the display reconciliation explicitly: cap stale extrapolation, retain a display-only high-water mark, and let committed time catch up; the finish may still show a lower authoritative total.
- This is an unresolved product/spec tradeoff, not something a stateless `liveMovingSec(reading, nowMs)` can fully solve.
- Handle delayed, rejected, duplicate and future-dated fixes, clock changes, no initial fix, auto-pause transitions and pause immediately before a fix.
- On visibility return or reload, do not fill background time; existing restore deliberately returns paused.
- React scheduling or a stalled main thread can skip a visible second despite aligned timers; alignment avoids drift, not an absolute real-time guarantee.
- `useGeo` currently timestamps fixes at receipt, whereas `runEngine` uses `fixTime`; preserve timestamp validation and define freshness at handoff.
- Existing `verify-4.3` helpers assume the current countdown duration and first-fix timing; update expectations without weakening GPS assertions.

## Tests and proof

- Add Vitest coverage beside [live-4.3.test.ts](/Users/rabah/projects/anygym/src/lib/run/__tests__/live-4.3.test.ts): six-second fix intervals, fractional boundaries, accepted/rejected fixes and no double counting.
- Assert waiting, manual pause, auto pause, auto-pause disabled, resume-before-fix, stale/future timestamps, gaps and reconciliation never produce a backwards live display.
- Assert display interpolation never changes persisted `movingSec`, pace, splits or GPS-gap accounting.
- Add engine/watch tests in [src/hooks/__tests__](/Users/rabah/projects/anygym/src/hooks/__tests__): start at countdown, one owner, GO handoff, cancellation, denied GPS and cleanup.
- Add Playwright coverage in a new `tests/verify-4.4a.spec.ts`, reusing [tests/helpers/run.ts](/Users/rabah/projects/anygym/tests/helpers/run.ts).
- Feed moving GPS fixes every six seconds; observe consecutive displayed seconds and assert manual pause freezes the face and resume behaves correctly.
- Assert 3, 2, 1 and GO order, one completion, cancel/background behavior, no run row before GO, and no pre-GO distance or time.
- On WebKit iPhone SE and 17 Pro Max, save screenshots of all four beats; assert digit bounds, safe-area clearance, cancel hit area and no horizontal overflow.
- Exercise reduced motion and collect console errors/CSP violations; verify the map is unmounted throughout countdown and restored on cancel.
- In a Chromium project, use CDP 4× CPU throttling and collect `requestAnimationFrame` timestamps across the full countdown; fail for any gap over 50 ms and report samples.
- Chromium/CDP performance proof does not establish real iPhone smoothness; retain the required real-device hand test.
- Run the full applicable matrix, `npm test`, `npm run build`, and the affected 4.3/4.4 regressions.

## Golden journey and remaining risks

- If the journey fails again, inspect its attached `route-log` before changing behavior.
- Likely investigation points are [useExerciseNav.ts](/Users/rabah/projects/anygym/src/screens/workout/useExerciseNav.ts), where `goList()` can call `go(-1)`, and [useAfterSet.ts](/Users/rabah/projects/anygym/src/screens/workout/useAfterSet.ts), which schedules an automatic return after 2.5 seconds.
- Check whether a delayed callback and a manual Back cause two history steps; this is a hypothesis, not an established cause.
- If confirmed, cancel or guard stale navigation at the responsible app boundary and add a regression asserting one return to the list and an active workout until Finish.
- If the route log proves a test-only race, fix the test’s synchronization and retain its route diagnostics and end-to-end assertions.
- Existing local changes in `PLAN.md` and `PROMPT.md` and untracked report files are present; preserve them.
- After the run fix ships, send the requested test-now instructions: tap Start, watch the countdown, then run for 30 seconds while watching the clock.