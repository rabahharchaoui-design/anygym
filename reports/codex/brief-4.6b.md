Codex brief for PLAN item 4.6b, written Nov 19 18:09 at commit 88eb3749. SPEC.md wins if they disagree; code may have moved since.

## Scope and acceptance

1. **SPEC 12.2:** Pause and hold-to-End preserve the run; GPS gaps remain visibly broken, with no invented solid route.
2. **SPEC 12.3:** Distance uses trusted, unsmoothed fixes and haversine; reject poor accuracy and implausible speed. Auto-pause and mile/km splits remain intact.
3. **SPEC 12.9 and 12.11:** Finish, History, saved totals, pace, splits and route agree with the final tracker state.
4. **SPEC 12.12:** GPX remains a valid export with separate segments at breaks.
5. A walk inside the wide stillness circle whose clock is running retains its withheld leg when paused or ended.
6. That leg contributes to both `distanceM` and `timedM`, without counting its already-recorded time again.
7. A GPS gap retains the pre-gap withheld leg and accounts for any plausible gap bridge separately.
8. A genuinely stationary phone does not gain distance from the flush.
9. Auto-paused time, manual pauses, rejected fixes and unbridgeable gaps retain their existing protections.
10. GPX names include local start seconds, distinguishing runs started in different seconds of the same minute.
11. Write regression tests first and confirm they fail on the current implementation.

## Implementation

12. **Change [tracker.ts](/Users/rabah/projects/anygym/src/lib/gps/tracker.ts)**: centralize withheld-leg accounting in a small pure helper.
13. Reuse `advance()` so `distanceM`, `timedM`, pace samples and split state update together.
14. The candidate leg runs from `lastRecorded` to a trusted endpoint; its time has already entered `movingMs`.
15. Add eligible timed distance with `ms: 0`, `timed: true`, `gap: false`.
16. Advance the accounting anchor or otherwise mark the leg consumed so repeated pause, finish or retry cannot add it twice.
17. `pauseRun()` should flush before setting `manual`, including when `now` is absent.
18. Preserve its existing `pendingMs()` and `holdGap()` rules; neither should count the leg’s time twice.
19. When the clock has stopped, preserve the earlier timed portion represented by `stopAt`; do not label later stationary drift as timed movement.
20. For old snapshots where `stopAt` is absent, preserve the existing conservative behavior.
21. In `addPoint()`’s `v.link === 'gap'` branch, account for the eligible pre-gap leg before the gap bridge.
22. Measure a plausible gap bridge from the last good pre-gap fix to the new fix, so the pre-gap leg is not counted twice.
23. Continue using `judgePoint()`’s bridge decision; gap distance is untimed, and the break stays dashed.
24. Keep the existing same-spot, auto-paused gap early return: zero new distance and time, no gap flag.
25. Carry any completed splits from both operations into the recorded event in order.
26. Keep `TrackerEvent`, `TrackBreak`, and split semantics coherent if the pre-gap endpoint becomes a recorded point.
27. **Change [live.ts](/Users/rabah/projects/anygym/src/lib/run/live.ts)** as needed to put a flushed trusted endpoint in `LiveRun.points`.
28. The saved route must include a credited endpoint once, in timestamp order, without joining across a pause or gap.
29. **Change [summary.ts](/Users/rabah/projects/anygym/src/lib/run/summary.ts)** so direct calls to `finishRun()` also finalize an unpaused run.
30. The engine already pauses first in `runEngine.end()`; finalization must be idempotent for that path.
31. Preserve the existing distinction between finalizing distance and adding clock time at the actual End tap.
32. **Check [snapshot.ts](/Users/rabah/projects/anygym/src/lib/run/snapshot.ts)**: `restoreLive()` calls `pauseRun()` and checks `lastRecorded` against the row’s last point.
33. If flushing changes `lastRecorded`, update the restored points and snapshot-fit handling together.
34. Otherwise a restored snapshot can fail the fit check, replay an incomplete route or lose a credited leg.
35. **Change [gpx.ts](/Users/rabah/projects/anygym/src/lib/run/gpx.ts)**: append zero-padded local `getSeconds()` after `timeKey(d)`.
36. Keep the existing local date/time convention, prefix and `.gpx` extension.
37. `RunShare.tsx` already calls `gpxFileName()`; change it only if integration testing exposes a need.
38. Reuse existing helpers; keep GPS arithmetic in `src/lib/gps/` and saving in `src/db/`.
39. Tracker is currently 267 lines; extract a focused helper if needed to respect the approximate 300-line rule.

## Data and migration

40. No Dexie schema change or migration is required if existing `TrackerState` fields suffice.
41. Existing `Run` fields already store `distanceM`, `timedM`, points, gaps and splits.
42. If a new tracker field is unavoidable, make it optional with a conservative default in `trackerFrom()`.
43. Keep `SNAPSHOT_VERSION` compatibility and test old snapshots; do not rewrite historical finished runs.
44. The autosaved row and snapshot must describe the same last recorded point after any flush.

## Edge cases and decisions

45. **Stationary versus slow movement:** distance inside the uncertainty circle is ambiguous.
46. Do not blindly flush `lastRecorded → lastGood` for every `still` state: GPS wander would become distance.
47. Gate the timed portion using the existing clock/stopped evidence and validate with seeded stationary tracks at several accuracies.
48. With auto-pause disabled, `clockStopped()` is always false; explicitly test stationary wander in this mode too.
49. If existing state cannot distinguish a noisy stationary phone from a slow walk, document that limitation and choose a conservative rule.
50. **Walk then stop:** credit only the timed portion up to `stopAt`; do not credit the later auto-paused drift.
51. **Pause then resume:** the first new fix starts a new segment; the pause itself contributes no distance or time.
52. **Finish while already manually paused:** no second flush, including after a failed save and retry.
53. **Gap after withheld movement:** flush the pre-gap leg even when the later bridge is rejected or returns to the standing circle.
54. Do not turn an unbridgeable gap into a solid line or add its unknown distance.
55. Keep the existing first-15-seconds gap hold and `heldMs` exclusion from pace.
56. **Split boundary:** a flush can complete a split; store it once and preserve its timed/gap classification.
57. A zero-time distance flush cannot reconstruct exactly where previously accumulated time fell across a split boundary.
58. Test the chosen behavior and avoid claiming precision that the existing state cannot support.
59. **GPS points:** held fixes currently update `lastGood` and `here` but are absent from `points`.
60. A credited fix needs consistent route, gap timestamps, GPX segments and snapshot restoration.
61. **Filename:** seconds distinguish different seconds, not two starts in the same second or repeated local time during a clock change.

## Tests and verification

62. Add focused Vitest coverage in `src/lib/gps/__tests__/` using the existing `fixtures.ts` helpers.
63. Poor-accuracy walk remains inside the circle: `pauseRun()` adds the expected leg to distance and timed distance, preserving moving time.
64. Repeat pause and finish: totals, points and splits remain unchanged on the second application.
65. Walk followed by a stop: only the known timed portion is credited; stopped time remains excluded.
66. Gap after withheld movement: assert pre-gap timed meters, separately bridged untimed meters, break timestamps and gap flags.
67. Test plausible, impossible and over-five-minute bridges, including same-spot auto-paused behavior.
68. Seeded stationary tracks at 10, 15 and 20 m accuracy, auto-pause on and off: flush does not create spurious distance.
69. Test no fix, rejected fix, manual pause/resume, missing `stopAt`, and a split crossed by a flush.
70. Add `src/lib/run/__tests__/` integration tests for direct `finishRun()`, engine-style pause then finish, route points and GPX segmentation.
71. Add snapshot restore tests for a withheld leg, old snapshots, pause after restore and no duplicate distance after resume.
72. Update `fixes-4.6a.test.ts` and `finish-4.6.test.ts` filename expectations to `HHMMSS`.
73. Assert zero-padded seconds and different names for two starts in the same minute.
74. Keep `gpxParse-4.6.test.ts` passing so the document remains valid.
75. Add `tests/verify-4.6b.spec.ts`; reuse `startRun`, `fix`, `wake`, `holdFor` and the controlled clock from [tests/helpers/run.ts](/Users/rabah/projects/anygym/tests/helpers/run.ts).
76. Feed a trusted poor-accuracy walking track that remains inside the circle; Pause, resume and End.
77. Assert saved IndexedDB distance and timed distance, summary values and History detail agree; check the route endpoint.
78. Exercise End without prior manual pause, plus a gap case and a stationary control.
79. Run the spec on **iPhone SE** and **iPhone 17 Pro Max** WebKit projects; verify controls remain usable on both.
80. Run targeted Vitest tests, `npm run test`, `npm run build`, and the targeted Playwright projects; investigate failures before broadening.

## Existing conflicts and risks

81. SPEC 12.2 says gap time is excluded; PLAN 4.4a deliberately retains the first 15 seconds already shown. Preserve the implemented rule for this item.
82. PLAN 4.6b asks for a flushed leg while CLAUDE.md forbids uncertain numbers: noisy stationary fixes make those goals difficult to satisfy perfectly.
83. `finishRun()` currently serializes without pausing, while the engine pauses first; fixing only the engine misses direct callers.
84. `pauseRun()` returns only tracker state, so recording an endpoint requires coordination with `LiveRun.points` and restore.
85. `addPoint()` reports completed splits, but `pauseRun()` does not; decide how pause-time split completion reaches any voice or goal consumers.
86. Existing pace, best-effort and PR logic use both totals and route points; test consistency rather than assuming a total-only change is sufficient.

No files were edited, and no tests were run.