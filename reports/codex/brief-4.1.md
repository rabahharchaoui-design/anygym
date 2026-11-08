Codex brief for PLAN item 4.1, written Nov 09 00:59 at commit 19da6439. SPEC.md wins if they disagree; code may have moved since.

[PLAN.md:105](/Users/rabah/projects/anygym/PLAN.md:105) defines 4.1 as the pure GPS engine, synthetic fixtures, and full Vitest coverage. No files were edited. Proposed APIs and unspecified behavior below are explicitly marked.

**1) Applicable SPEC and acceptance checks**

- **SPEC 12.3:** implement filtering, drawing-only smoothing, haversine distance, auto pause, and km/mile splits.
- **SPEC 12.2:** current pace uses a rolling 30-second window; GPS gaps contribute no moving time or connecting distance.
- **SPEC 12.2:** expose separate route segments so the later map can mark gaps without presenting a straight connection as traveled.
- **SPEC 12.11:** outputs must fit the existing `Run` record: meters, seconds, compact points, gaps, and splits.
- **SPEC 0:** calculations work offline; uncertain measurements remain unknown; route data stays on the phone.
- **SPEC 11:** screen-locked tracking is outside v1; suspended tracking must produce a gap.
- **SPEC 13.3–13.4:** deterministic logic tests; browser regressions on WebKit, including SE and 17 Pro Max.
- Accept accuracy **25 m**, reject accuracy **greater than 25 m**.
- Accept implied speed **8 m/s**, reject speed **greater than 8 m/s**, measured against the previous accepted point.
- Compute distance from accepted, unsmoothed coordinates; changing the drawing window must never change distance.
- Smooth only within continuous segments using a causal moving average of **3 points**; SPEC permits 3–5.
- Default auto pause on; continuously observed speed **below 0.5 m/s for 8 seconds** pauses; movement resumes automatically.
- Emit complete splits at exactly **1,000 m** or **1,609.344 m**, including interpolated boundary times.
- Keep elapsed time separate from moving time; pauses and missing tracking cannot inflate moving time.
- Never produce `NaN`, infinite pace, negative durations, duplicate splits, or a fabricated bridge through missing tracking.
- `watchPosition({ enableHighAccuracy: true, maximumAge: 0 })` is the later browser adapter’s contract, not a side effect inside this module.

**2) Files and implementation contract**

- Create [src/lib/gps.ts](/Users/rabah/projects/anygym/src/lib/gps.ts); no React, Dexie runtime, navigator, storage, timers, or network imports.
- Import the existing `RunPoint` type from `src/db/types.ts` using `import type`.
- Follow `src/lib/timer.ts`: time enters through arguments; never call `Date.now()` inside calculations.
- Export typed options, processor state, events, splits, and a summary; keep state serializable for later recovery.
- Suggested APIs below are **new names**, not functions already present in the repository.
- `haversineM(a, b)`: spherical distance in meters; use one documented radius, e.g. `6_371_000`.
- Normalize longitude differences and clamp the haversine intermediate to `[0, 1]` before inverse trigonometry.
- `createGpsState(startedAt, options)`: initialize thresholds, unit, default auto pause, and empty accumulators.
- `processGpsEvent(state, event)`: pure reducer for fix, tick, pause, resume, tracking interruption, and finish events.
- Fix events carry `RunPoint`; lifecycle events carry explicit timestamps.
- Return acceptance/rejection and newly completed splits/transitions alongside the updated state.
- `rollingPace(state, now)`: return seconds per selected distance unit, or `null` without usable distance/time.
- `smoothSegment(points, windowSize = 3)`: drawing coordinates only; never feed these coordinates into filtering or totals.
- `summarizeGps(state, now)`: expose elapsed/moving seconds, distance, completed splits, open-gap status, and draw segments.
- Maintain the previous accepted fix, recent pace segments, low-speed start, pause state, and pending gap independently.
- Keep raw accepted points distinct from smoothed drawing points; rejected points never enter either accepted-point history or distance.
- Keep pace and smoothing working buffers bounded; do not replay the entire route for every incoming fix.
- Create `src/lib/__tests__/fixtures/gps-tracks.ts` with deterministic synthetic tracks and explicit expected metrics.
- Include a 5 km loop, straight constant-speed track, noisy loop, spike, dropout, stationary period, and antimeridian crossing.
- Generate fixtures from known geometry and speeds; do not calculate expected answers by calling the production functions under test.
- Create `src/lib/__tests__/gps.test.ts`, grouped by geometry, filtering, smoothing, time, pace, pauses, gaps, and splits.
- Change [vitest.config.ts](/Users/rabah/projects/anygym/vitest.config.ts): add `src/lib/gps.ts` coverage thresholds of 100% lines and branches.
- Optionally clarify `RunPoint`, `Run.gaps`, and `Run.splits` JSDoc in `src/db/types.ts`; preserve their existing shapes.
- Create `tests/gps-4.1.spec.ts` only for scoped browser regressions described below.
- Leave `RunScreen()`, routing, map dependencies, geolocation subscriptions, wake lock, and run persistence for subsequent PLAN items.

**3) Data model and Dexie**

- [src/db/types.ts:394](/Users/rabah/projects/anygym/src/db/types.ts:394) already defines `RunPoint = [lat, lng, tMs, accuracyM]`.
- `Run` already contains `movingSec`, `elapsedSec`, `distanceM`, `points`, `gaps`, and `splits`.
- `AnyGymDB.runs` and its `id, startedAt` indexes have existed since `SCHEMA_V1`.
- Current `SCHEMA_VERSION` is **10**; 4.1 needs no new table, index, or Dexie migration.
- Keep internal durations in milliseconds and distances in meters; convert to seconds at the summary boundary without repeated rounding.
- Proposed stored convention: `gaps` contains `[startTimestampMs, endTimestampMs]`, ordered and non-overlapping.
- Proposed stored convention: each `splits` number is the moving duration in seconds of one completed full-unit split.
- Expose richer split records internally—index, distance, boundary timestamp, duration—without changing `Run.splits`.
- `Profile.distanceUnit?: 'km' | 'mi'` already exists; its type comes from `src/lib/intake/funnel.ts`.
- Pass distance unit explicitly into the engine; do not infer it from the active gym’s weight unit.
- Before later persistence, add a per-run split-unit field: existing `Run` cannot identify whether saved splits were miles or kilometers.
- That later field can be additive and unindexed; update backup validation and legacy behavior with it.
- `src/lib/backup.ts` already includes `runs` in `TABLE_NAMES` and validates the current point/gap/split tuple shapes.
- `restoreReplace()` and `restoreMerge()` already transfer runs; do not duplicate that infrastructure in 4.1.

**4) Tricky cases and proposed decisions**

- SPEC leaves the missing-fix timeout unspecified. Proposed configurable default: **10 seconds since the last accepted fix**.
- Explicit suspension/interruption events start a gap immediately; elapsed time alone can detect one through a tick or the next fix.
- Start missing coverage at the last accepted fix; close it at the first usable reacquired fix.
- Exclude that entire interval from distance and moving time; reacquisition seeds a new segment.
- After a gap, do not speed-test against the old segment’s endpoint: that creates permanent rejection after legitimate relocation.
- Within a continuous segment, a rejected spike must not replace the accepted anchor; the following good fix compares against that anchor.
- Reject nonfinite values, invalid latitude/longitude, negative accuracy, and timestamps before the run.
- Ignore duplicate/out-of-order timestamps without division by zero or moving state backward; preserve legitimate `(0, 0)` coordinates.
- A callback stream containing only rejected fixes still becomes a gap; callback arrival does not prove usable tracking.
- Proposed auto-pause timing: pause at the 8-second threshold, without retroactively rewriting the preceding grace period.
- Measure low-speed duration with timestamps, not sample counts; interrupted low-speed evidence resets the timer.
- Resume at the first accepted moving fix, which seeds the next segment; do not credit movement across the paused interval.
- Manual pause remains manual until explicit resume; auto resume cannot override it.
- Disabling auto pause removes low-speed pauses, while GPS gaps still exclude unknown movement and time.
- A tick may detect missing tracking but cannot invent stationary or moving evidence.
- Reset pace and smoothing across pauses/gaps; `null` pace is preferable to carrying stale pre-interruption pace.
- Clip the rolling window at `now - 30_000`, interpolating partial accepted segments; startup uses available continuous observations.
- Interpolate split crossings within an accepted segment; use a loop so one segment can complete multiple boundaries.
- Never interpolate across gaps or pauses; leave the final partial split separate from completed split records.
- Merge overlapping interruption intervals; repeated pause/resume/finish events must be idempotent.
- On finish during an open gap, close it at finish time without adding distance or moving time.
- Smooth antimeridian coordinates using unwrapped longitudes; averaging `179.999` and `-179.999` directly draws across the world.

**5) Tests and assertions**

- Vitest geometry: identical points yield zero; known equatorial distance is correct; symmetry, poles, and antimeridian remain finite.
- Filtering boundaries: 25 m versus just above; 8 m/s versus just above; 0.5 m/s versus just below.
- Invalid inputs: malformed/nonfinite data and nonpositive timestamp deltas leave totals and accepted anchors unchanged.
- Spike recovery: rejected teleport adds no distance; the next valid fix resumes against the previous good fix.
- Smoothing: known three-point averages, short-segment startup, no cross-gap averaging, and unchanged measured distance.
- Constant pace: known speed yields expected seconds/km and seconds/mile; irregular sample spacing produces the same result.
- Rolling window: motion older than 30 seconds is excluded; a boundary cutting a segment is interpolated correctly.
- Empty/stationary input: zero distance and unknown pace, never infinity or `NaN`.
- Auto pause: 7.999 seconds stays running; 8 seconds pauses; movement resumes; manual pause and disabled mode behave independently.
- Gaps: timeout and explicit interruption exclude the endpoint chord and missing duration; distant reacquisition succeeds.
- Noisy loop: deterministic noise remains within a declared fixture tolerance; smoothing does not improve distance by secretly replacing input.
- 5 km loop: accepted distance within **1%**, five kilometer splits, and correct remainder under mile mode.
- Split boundaries: just below/exactly/above a boundary, multiple crossings, pauses, and gaps produce no duplicate or phantom split.
- Reducer invariants: deterministic replay, frozen inputs remain unchanged, independent runs share no state, and finish is idempotent.
- Replay recovery: serialize/reload processor state mid-track; remaining output matches uninterrupted processing.
- Playwright: import `test`/`expect` from `tests/fixtures.ts`; its network guard and error trap are mandatory.
- Run scoped regressions on **iPhone SE, 375×667**, and **iPhone 17 Pro Max, 440×956**, using existing WebKit projects.
- Verify Run navigation, existing empty state, and gym pill still work; instrument geolocation to assert no tracking starts on ordinary navigation.
- Use `simulateSafeAreas()` and `checkLayout()` from `tests/helpers/layout.ts`; capture both phones with existing `shotOn()`.
- Reuse `tests/smoke.spec.ts` and the Run-pill coverage in `tests/gyms-3.9.spec.ts`; do not invent a Start button for this item.
- Actual `grantPermissions`/`setGeolocation` run simulation belongs to **4.8**, after the tracking adapter and live screen exist.
- Builder checks: `npm run typecheck`, targeted Vitest with coverage, full Vitest, then scoped Playwright on both named projects.

**6) Existing-code risks and conflicts**

- `RunScreen()` currently renders heading **“Run”**, an empty state, gym pill, and toast; changing it breaks existing smoke expectations.
- `Run.splits` has no documented semantics or saved unit; establish these before later history, voice, and backup consumers diverge.
- `src/pwa.ts` already identifies active runs by `endedAt === undefined`; later persistence must create/finish those records reliably.
- `src/db/backup.ts::refuseIfActive()` checks workouts only; later tracking must also prevent restore from replacing an active run.
- GPS accuracy filtering alone cannot eliminate stationary jitter; tests must expose distance inflation without silently inventing stronger filters.
- The timeout and auto-pause accounting above are engineering proposals, not thresholds specified by the product.
- Existing browser fixtures block external network requests; future map tests need local mocks rather than weakening the guard.
- The working tree already contains unrelated Quick/generator changes and new Codex reports; preserve them and keep 4.1 changes isolated.