Codex brief for PLAN item 4.2, written Nov 10 03:19 at commit 42985527. SPEC.md wins if they disagree; code may have moved since.

Item [4.2 in PLAN.md](/Users/rabah/projects/anygym/PLAN.md:110) covers the reusable map, run setup, GPS status, music links, and countdown. `RunScreen()` is currently a placeholder. Everything below is proposed implementation; no files were changed or tests run.

**1) Applicable SPEC and acceptance checks**

- **12.1:** Title “Run With Me”; tab remains “Run”. Show a large dark map, Free run / Distance / Time / Intervals, music links immediately above one primary Start button.
- Distance picker supports 3 mi, 5 km, 10 km, and custom; Time supports 20 / 30 / 45 minutes and custom.
- Default to Free run so a new user can Start without configuring anything.
- Start displays full-screen 3 → 2 → 1; invoke the start boundary exactly once after the countdown.
- **12.10:** MapLibre with OpenFreeMap, app-palette dark styling, visible attribution, lime route and position overlays.
- Tile/style failure shows “Map offline”; route rendering and run startup remain available.
- Competitor research **gap 5** in `.design-ref/inspiration/competitors-research.md`: GPS status remains visible and never gates Start.
- **12.3:** Tracking uses high accuracy and `maximumAge: 0`; point filtering and distance calculation belong to PLAN 4.1’s `src/lib/gps.ts`.
- **12.11 + 2:** Persist run creation transactionally; route points remain compact `RunPoint` tuples.
- **0.1, 0.4, 0.5:** Never invent a position or GPS readiness; work offline after first load; keep route records local.
- **11:** Spotify and Apple Music are launch links; screen-locked GPS is outside the web app’s promises.
- **19:** Preserve the working `GymPill` on the Run tab.
- **10, 13.1–13.4, 23:** Existing tokens/components, 48 px targets, safe areas, 130% text, reduced motion, immediate press feedback.
- **23.4:** Capture screenshots and flow recordings on SE and 17 Pro Max; inspect them for clipping and covered controls.
- Scope boundary: live controls/pocket mode are 4.3; interval execution/voice 4.4; turnaround/ghost 4.5; finish/history 4.6.

**2) Files to create/change and implementation contracts**

- Existing names below are present in the repo; new modules/functions are explicitly marked **new**.
- **Change `src/screens/RunScreen.tsx`, `RunScreen()`:** replace `EmptyState`; retain `GymPill`, toast handling, and error recovery.
- Read profile through `useLive()`; initial distance unit follows `profile.distanceUnit`, then intake distance unit, then `unitsForLocale(phoneLocale()).distance`.
- Never derive running units from `Gym.unit`; switching gyms must preserve the chosen run goal.
- Compose setup controls, lazy map, GPS chip, music links, and the countdown controller.
- **New `src/screens/run/Run.module.css`:** fluid map/setup layout; Start clears both tab bar and workout ResumeBar.
- Reuse `--app-height`, safe-area variables, `--tabbar-space`, and `--resume-space`; shrink the map first on SE.
- **New `src/screens/run/RunGoalSheet.tsx`, `RunGoalSheet()`:** use `Sheet`/`SheetFooter`; accessible presets, custom input, explicit units.
- Keep separate distance/time drafts when changing run type; closing the sheet without applying preserves the previous valid goal.
- **New `src/lib/runStart.ts`:** `RunStartConfig`, `validateRunStartConfig()`, distance conversion, and countdown state transitions.
- Store distance in meters and duration in seconds; centralize conversion outside JSX and keep it separate from lifting math.
- **New `src/screens/run/RunCountdown.tsx`, `RunCountdown()`:** full-screen overlay, accessible countdown, Cancel, exactly-once completion.
- Freeze a validated config snapshot on Start; use a synchronous phase/ref guard in addition to `useTapGuard()`.
- Cancel on navigation or hiding during countdown; remove timers and ignore callbacks from a previous countdown generation.
- **New `src/hooks/useRunLocation.ts`, `useRunLocation()`:** sole owner of permission state, position watch, readiness freshness, and cleanup.
- Expose separate GPS states: not started, finding, ready, denied, unavailable; a cached/stale fix never means “GPS ready”.
- **New `src/components/run/RunMap.tsx`, `RunMap()`:** lazy MapLibre renderer accepting position, route segments, gaps, and camera mode.
- Initialize once per mount; update sources without recreating the map; `remove()` and detach listeners on cleanup.
- **New `src/lib/runMap.ts`:** `toRunGeoJSON()`, `buildDarkStyle()`, and fallback projection helpers, independently testable.
- Convert stored `[lat, lng, t, accuracy]` to GeoJSON `[lng, lat]`; render measured segments separately from dashed gaps.
- **New `src/components/run/RunMapFallback.tsx`:** plain dark SVG route renderer for failed style loading or unavailable WebGL.
- Preserve the last route through fallback/recovery; do not replace the entire Run screen with an error boundary.
- **New `src/data/run-map-style.json`:** local customized OpenFreeMap style; retain source attribution and record its upstream source/license.
- **Change `package.json` and `package-lock.json`:** add a pinned MapLibre version; import its CSS locally.
- Use the worker setup matching that version. Current v6 documentation uses named imports and a separately emitted worker URL. [MapLibre guide](https://maplibre.org/maplibre-gl-js/docs/guides/v5-to-v6-migration-guide/)
- **Change `vite.config.ts`, `cspPlugin()`:** allow only origins actually referenced by style, TileJSON, tiles, glyphs, and sprites.
- Keep `worker-src 'self'` using the emitted worker; preserve the existing bans on inline scripts and eval.
- OpenFreeMap documents Vite’s `?worker&url` setup and hosting customized style JSON locally. [OpenFreeMap integration](https://openfreemap.org/quick_start/)
- **Change `src/App.tsx`, `App()`:** lazy-load the Run implementation or its map subtree; no eager MapLibre import from shared modules.
- **New `src/db/runs.ts`:** `getActiveRun()` and `startRun()` following `getActiveSession()`/`startWorkout()` conventions.
- Countdown completion calls `startRun()` and hands the returned record to the 4.3 live controller; never navigate to an unregistered route.
- **Integration prerequisite:** 4.3 must supply a usable active-run consumer before this Start flow ships; an unfinishable active record is unacceptable.

**3) Data model and Dexie changes**

- `src/db/types.ts` already defines `Run` and `[lat, lng, timestampMs, accuracyM]` as `RunPoint`.
- `src/db/schema.ts` already has `runs: 'id, startedAt'` from v1; current `SCHEMA_VERSION` is 10.
- No new table, index, or schema migration is necessary for the map/setup itself.
- Keep legacy `Run.type: string` and `goal?: string` readable; introduce a separate validated config type for new starts.
- Proposed additive fields: `distanceUnit?: DistanceUnit` and `target?: { distanceM?: number; durationSec?: number }`.
- These preserve a run’s unit/goal after Settings changes; existing runs with missing fields remain valid.
- Update `src/lib/backup.ts`’s run validator for these optional fields, including positive finite target checks.
- `TABLE_NAMES`, `BackupTables`, and database backup/restore already include runs; do not add duplicate plumbing.
- `startRun(config, db = defaultDb, now = Date.now())` uses one `rw` transaction on `db.runs`.
- In that transaction, return an existing active run or add one via `newId()`; transaction serialization prevents competing starts.
- Find active runs by `endedAt === undefined` using the existing startedAt index; `endedAt` is not indexed.
- New records start with zero metrics and empty points/gaps/splits; `startedAt` is countdown completion time.
- Do not persist countdown ticks or setup-preview positions as route points.
- If typed fields are added, test backup round trips immediately; finish/history presentation remains 4.6 work.

**4) Tricky edge cases and handling**

- **SPEC conflict:** 0.5 permits location only during an active run; 12.1 and gap 5 imply pre-start location acquisition.
- Conservative behavior: no automatic location request on entering Run; Start begins acquisition, with truthful initial status.
- Pre-start “GPS ready” requires a documented narrow preflight exception to 0.5; resolve that before enabling automatic acquisition.
- Permission prompt, denial, timeout, poor accuracy, or missing geolocation never disables Start.
- When no trustworthy fix exists, omit the user marker; show unknown pace/distance honestly once live tracking begins.
- Keep GPS status independent from map availability: GPS can be ready while tiles are offline.
- React StrictMode mounts effects twice; cleanup must leave one watch, one map instance, and one countdown completion.
- A late location callback after Cancel, route change, or run replacement must fail its generation/ownership check.
- App backgrounding during countdown cancels setup; it must not silently start a run several minutes later.
- Active-run recovery bypasses a fresh countdown; a second tab resumes the existing record.
- Storage failure returns to a retryable start state with the config retained; never show a successful start before commit.
- Offline first visit to Run must load its lazy JS, CSS, worker, local style, and fallback from the installed app cache.
- Retain those assets in Workbox precache; check large map chunks against precache size limits.
- Handle constructor failure, context loss, style failure, and tile failure separately; avoid infinite retry/remount loops.
- Reconnection retries basemap resources without changing route points or restarting tracking.
- Cover empty route, one point, repeated points, multiple segments, and antimeridian crossing without invalid SVG bounds.
- Custom goals reject zero, negatives, nonfinite values, and malformed decimals with a plain inline explanation.
- Unit switching changes display without changing the underlying meter target or accumulating rounding errors.
- Intervals must select a valid preset for 4.4; do not expose a selectable type with no executable configuration.

**5) Tests to write and exact assertions**

- **`src/lib/__tests__/runStart-4.2.test.ts`:** preset conversion, independent distance units, custom validation, canonical target preservation.
- Same file: frozen config, 3/2/1 order, Cancel, hidden-page cancellation, stale callback suppression, exactly-once completion.
- **`src/lib/__tests__/runMap-4.2.test.ts`:** coordinate order, separate measured/gap geometry, empty/single-point routes, antimeridian bounds.
- Same file: dark palette transformation preserves layer structure and attribution; original style input is unchanged.
- **New pure location-state tests:** stale/poor fixes cannot produce ready; denial/timeout remain retryable; GPS status ignores tile state.
- **`src/db/__tests__/runs-4.2.test.ts`:** use `fake-indexeddb/auto` and isolated `AnyGymDB` instances.
- Assert concurrent starts yield one ID, an existing active run wins, initial metrics are exact, and an aborted write leaves no partial row.
- Add backup tests for old run shapes and new optional fields; assert targets and units survive export/restore.
- **`tests/run-start-4.2.spec.ts`:** import `test`/`expect` from `tests/fixtures.ts`; tag core cases `@matrix`.
- Fresh setup: title, four run types, default Free run, gym pill, and reachable Start.
- Pickers: preset/custom selection, validation, dismissal, retained choices, and correct config at countdown completion.
- Permission cases: granted, denied, unavailable, delayed, and stale; Start works in every case without waiting for a fix.
- Countdown: double tap starts once; Cancel creates no run; navigation/backgrounding cannot complete an abandoned countdown.
- Reload after committed start resumes the same run; no second countdown or duplicate row.
- **`tests/run-map-4.2.spec.ts`:** deterministic local map fixtures; prove MapLibre actually loads, not merely that fallback renders.
- Simulate missing style, failed tiles, and WebGL failure; assert “Map offline”, retained route, and usable controls.
- Test reconnect restores basemap while route and run identity remain unchanged.
- Warm app on Today, go offline, then first-open Run; verify lazy assets, picker, countdown, and fallback work.
- Music links retain existing URLs, labels, `target`, and `rel`; guarded taps launch no native app or external navigation.
- Use `setSafeArea()`, `checkLayout()`, and `checkControls()` from `tests/helpers/layout.ts`; also assert Start visible before helper scrolling.
- Run normal/130% text, reduced motion, open goal sheet, and active workout ResumeBar on both requested phones.
- Required command: `npx playwright test tests/run-start-4.2.spec.ts tests/run-map-4.2.spec.ts --project="iPhone SE" --project="iPhone 17 Pro Max"`.
- Existing profiles already select WebKit: SE is **375×667**, 17 Pro Max **440×956**; do not substitute first-generation SE.
- Run focused Vitest, `npm run build`, affected regressions, then the configured matrix; keep zero unexpected console errors.

**6) Risks and conflicts with built code**

- PLAN 4.1 is unchecked and `src/lib/gps.ts` is absent: agree on its exports before wiring location; never duplicate filtering in `RunMap()`.
- PLAN 4.3 is absent: startup persistence and live ownership need an explicit shared contract before either item is considered integrated.
- `AppShell()` owns scrolling, tab spacing, and workout ResumeBar; an unmodified floating `BottomCTA` would overlap bottom chrome.
- `src/pwa.ts`, `activity()` already detects persisted active runs; countdown needs a transient busy signal so an update cannot reload it.
- `src/db/backup.ts` protects restoration against active workouts, not active runs; coordinate a transactional active-run guard before tracking ships.
- `tests/fixtures.ts` blocks external hosts; provide local fixtures/interception without weakening the global network guard.
- `tests/csp-2.2f.spec.ts` assumes an exact connect-src list; update that assertion and retain enforcement tests under production CSP.
- That CSP test also expects heading “Run”; update it for “Run With Me” while preserving the tab label.
- `tests/edge.spec.ts` and `tests/matrix.spec.ts` expect “No runs yet”; replace those placeholder assertions.
- Preserve `tests/gyms-3.9.spec.ts`’s Run gym-switching coverage; gym changes must not reset run configuration.
- Remote tile requests disclose the viewed area to the tile provider even though route records stay local; reconcile the absolute privacy wording.
- Keep route coordinates out of telemetry, errors, and URLs; use synthetic tracks in fixtures, screenshots, videos, and reports.
- Review the three local design skill files named in SPEC 23 before UI implementation; keep `.design-ref` material out of commits.