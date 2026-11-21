Codex brief for PLAN item 4.4e, written Nov 20 07:09 at commit 8a245f4c. SPEC.md wins if they disagree; code may have moved since.

**4.4e implementation brief**

The item is gated on G’s outdoor diagnostics export **or his word to start**. No export is present in `tests/fixtures/gps/` in this checkout. The measurements in [run-lag-4.4d.md](/Users/rabah/projects/anygym/reports/run-lag-4.4d.md) are simulated; they do not establish what G’s phone reports.

**1. Applicable specification and acceptance**

- [SPEC 12.2](/Users/rabah/projects/anygym/SPEC.md:287): current pace uses the phone’s speed over five seconds when available; otherwise use the rolling 15-second distance window. Show no pace until it is trustworthy.
- [SPEC 12.3](/Users/rabah/projects/anygym/SPEC.md:294): GPS processing is pure and unit tested; reject accuracy worse than 65 m and implausible jumps; use accuracy-weighted estimates.
- Standing and resuming use phone speed when supplied and positions otherwise; optional auto-pause starts after speed below 0.5 m/s for eight seconds.
- Distance uses filtered positions; route smoothing is for drawing only. Preserve mile/km splits and untimed distance semantics.
- [SPEC 12.2 and 12.10](/Users/rabah/projects/anygym/SPEC.md:287): GPS gaps remain visible as dashed breaks; tracking works offline.
- [SPEC 12.11](/Users/rabah/projects/anygym/SPEC.md:328): run data stays on the phone and remains included in backup.
- [SPEC 13.3–13.4](/Users/rabah/projects/anygym/SPEC.md:360): zero console errors; UI tests run on the device matrix, with WebKit for iPhones.
- [PLAN 4.4e](/Users/rabah/projects/anygym/PLAN.md:55): several readings **and agreeing displacement** must establish movement; a single noisy speed must not resume a stationary run.
- Eliminate the observed 18–54-second freezes during poor-GPS walking without inventing distance or restoring standing drift.
- Run the 4.4d matrix on every affected commit: 1.4/2.5/3.5 m/s, 1/5-second cadence, 5/15/30/50 m accuracy, cold start, tunnel, stop and still scenarios.
- The stated 4.4d gates are ≤3% distance error, ≤6-second freeze with fixes arriving while moving, pace first visible and following a change within 20 seconds, and no added standing distance.
- The current test interprets “no added” as at most 0.5 m after its 10-second settling allowance, including End; retain that explicit measurement.
- Seven priority-group-1 distance failures require investigation with G’s real trace. Do not silently weaken the 3% rule or call 4.4e passed while required gates fail.
- A real diagnostics trace lacks independent ground truth; use it to characterize inputs and replay behavior, not to claim a measured distance error without a reference path.

**2. Files and implementation**

- `tests/fixtures/gps/`: first ingest G’s export using `traceFromFile()` / `loadRecorded()` in [load.ts](/Users/rabah/projects/anygym/tests/fixtures/gps/load.ts). Report fix cadence and arrival lag, accuracy distribution over time, and speed availability/behavior.
- The export contains precise locations and timestamps. The public-repo rule prohibits personal data: keep the original private and develop a privacy-safe fixture only if its transformation preserves the behavior under test; do not commit the raw export.
- [standing.ts](/Users/rabah/projects/anygym/src/lib/gps/standing.ts): replace the single-speed shortcut with a bounded, time-aware movement evidence window. Require multiple valid readings and displacement agreement; handle sparse/missing speed and cadence explicitly.
- Reuse `pushRaw()`, `fixesWalking()`, `calmNow()` and `stillBySpeed()` where their semantics fit; change their contracts together rather than creating competing standing classifiers.
- [tracker.ts](/Users/rabah/projects/anygym/src/lib/gps/tracker.ts): apply the same evidence to `addPoint()` / `addFix()` transitions, especially `goingAgain`, `standsAt`, `speedKnown` and the poor-accuracy `drifting` branch.
- Record confirmed movement once; do not count the same withheld leg again on the next fix. Keep the clock’s stopped state distinct from the distance freeze.
- [stillness.ts](/Users/rabah/projects/anygym/src/lib/gps/stillness.ts): revisit `walkingLately()`, `movedLately()` and `minStepM()` for opposed drift and sparse fixes; retain uncertainty-aware displacement checks.
- [estimate.ts](/Users/rabah/projects/anygym/src/lib/gps/estimate.ts): change `stepEstimate()` or its uncertainty handling only if replay attribution shows estimator lag is the cause. Preserve jump confirmation and reanchoring.
- [pace.ts](/Users/rabah/projects/anygym/src/lib/gps/pace.ts): adjust `speedPace()` or the fallback only if the evidence shows stale/noisy speed or distance-window lag; retain honest nulls and SPEC’s five/15-second intent.
- [types.ts](/Users/rabah/projects/anygym/src/lib/gps/types.ts): document any new thresholds, units and reason. Tune against separate seeds and real-trace observations, not one favorable trace.
- [replay.ts](/Users/rabah/projects/anygym/tests/fixtures/gps/replay.ts): extend metrics where needed to identify evidence transitions, freeze causes and live-versus-End distance; reuse `replay()` and `measure()`.
- [traces.ts](/Users/rabah/projects/anygym/tests/fixtures/gps/traces.ts): add deterministic variants for noisy nonzero/lagged speed, no speed, and drift opposing walking.
- [expected.ts](/Users/rabah/projects/anygym/tests/fixtures/gps/expected.ts): remove an expected failure only when its unchanged rule actually passes; record remaining failures and evidence in the report.
- Create `reports/run-lag-4.4e.md`: real-trace characterization, before/after matrix, unexplained failures, privacy treatment and the decision needed on the seven cases.
- Keep GPS logic in `src/lib/gps/`; UI should continue to consume existing readings. Split a file if touching it takes it over 400 lines; `tracker.ts` is already 388 lines.

**3. Data and migration**

- No Dexie table or index change is inherently needed. Existing diagnostics are stored separately and exported through `src/hooks/runDiag.ts`; do not add raw locations to backups.
- `TrackerState` in `tracker.ts` is included in the active-run snapshot in [snapshot.ts](/Users/rabah/projects/anygym/src/lib/run/snapshot.ts). Any new evidence window must be bounded and optional for older snapshots.
- Initialize missing evidence conservatively in `trackerFrom()` or the tracker’s readers; reset it at manual pause/resume, a new stretch and a real gap as appropriate.
- Preserve existing saved runs, splits, `timedM`, points and backup format. If a schema/index change proves necessary, add a Dexie version and a previous-version migration test that verifies every saved set and run survives.

**4. Edge cases**

- A stationary phone reporting repeated 0.9–1.2 m/s must not repeatedly exit standing; one speed spike or one large fix cannot confirm motion.
- Resume from a light at 1.2–1.4 m/s with fixes five seconds apart: confirm promptly while requiring consistent displacement, not several seconds of duplicate callbacks.
- Speed may be absent, intermittent, stale or lagged after a stop; do not let remembered calm suppress a genuine walk indefinitely or old movement keep adding drift.
- Poor accuracy plus drift against the walking direction can hide net movement. Use multi-fix evidence and uncertainty; do not manufacture progress when the observations cannot distinguish movement from drift.
- Repeated coordinates, out-of-order timestamps, batched arrival, invalid speed, sudden accuracy improvement and a single wild jump must not create distance.
- Preserve `flushStill()` at Pause, End and gap: genuinely walked withheld distance is counted once; stationary drift is not flushed. Test both auto-pause settings.
- Preserve 4.4c: a >15-second hole while auto-paused on the same spot adds no distance, time or gap. Other gaps retain their existing bridge and pace exclusions.
- Preserve 4.6a’s separate distance/clock stillness rules, monotonic displayed moving time, split boundaries, and untimed resume/gap distance.
- At two-decimal km display precision, a valid sub-10 m engine update can still print the same number; distinguish engine freeze from display rounding in tests and report both.

**5. Tests**

- Vitest, new tests beside `src/lib/gps/__tests__`: isolated stillness transitions with multiple speed readings, displacement agreement, spikes, noisy nonzero speed, missing speed and sparse cadence.
- Vitest, pause/finish tests: stationary distance stays within the existing 0.5 m allowance, including `flushStill()`; real withheld movement is saved exactly once.
- Vitest, replay matrix: run all existing seeds and scenarios through `liveStep()`; assert the unchanged rules in `ruleFailures()` and name any still-expected failures.
- Add poor-GPS walking traces with drift opposing movement; assert freeze duration, first/follow pace, distance error and stationary control together so a faster display cannot hide invented meters.
- Add speed-change traces with lagged/no speed: assert pace appears and follows within 20 seconds where the stated gate applies; otherwise it remains `null`, never NaN or stale across a gap.
- Extend [diag-4.4d.test.ts](/Users/rabah/projects/anygym/src/lib/run/__tests__/diag-4.4d.test.ts): replay the privacy-safe real-derived fixture and assert finite, monotonic distance/time plus specifically observed behavior; do not assert unknown ground truth.
- Snapshot/reload Vitest: load an old snapshot without new fields, restore paused, resume and verify no lost/duplicated distance or evidence carried across the break.
- Regression Vitest: standing gap, manual pause, split and `timedM` accounting, jump/reanchor, and repeated timestamps retain their existing contracts.
- Playwright: extend [verify-4.4d.spec.ts](/Users/rabah/projects/anygym/tests/verify-4.4d.spec.ts) with a five-second-cadence walk, stop/resume, poor accuracy and a gap; inspect live distance, pace and time, then saved summary.
- Run those journeys in WebKit on configured **iPhone SE** and **iPhone 17 Pro Max**, and on the remaining SPEC matrix devices; assert no console errors and capture both requested phone screens.
- Playwright geolocation cannot supply `coords.speed` in the existing harness. Cover real speed sequences in Vitest or add a controlled browser geolocation mock; label which path each test exercises.

**6. Risks and conflicts**

- [PLAN 4.4d](/Users/rabah/projects/anygym/PLAN.md:49) is still unchecked even though its code and report exist. The 4.4e brief must not imply its full matrix passed.
- Current `goingAgain` accepts one speed ≥0.9 m/s, and `standsAt()` also lets that speed override standing; both paths must change together.
- `fixesWalking()` currently requires every fix to progress toward the last; one repeated or contrary noisy fix can reject a real walk.
- `flushStill()` currently flushes a short pending leg while moving; tightening only the standing transition can leave End adding the very drift the fix was meant to suppress.
- The simulation’s correlated drift can make truth unrecoverable from fixes alone. Keep the 3% gate visible and escalate a rule change with measured evidence; do not tune to the fixture generator.
- Real iOS cadence, GPS accuracy, background behavior and the user’s perceived lag still need G’s outdoor hand test. No files were edited for this brief.