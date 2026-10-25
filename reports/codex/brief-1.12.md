Codex brief for PLAN item 1.12, written Oct 25 02:22 at commit ba3c7eb. SPEC.md wins if they disagree; code may have moved since.

Item 1.12 is a completion and hardening pass: substantial implementation already exists in the working tree. Preserve it, finish 1.7i first, then close the remaining harness gaps. No files changed; tests were not run for this brief.

1) Implement against [PLAN.md:44](/Users/rabah/projects/anygym/PLAN.md:44), with these SPEC acceptance checks.

- **SPEC 13.3:** every unexpected console error, uncaught exception, or unhandled rejection fails the owning test automatically.
- **SPEC 13.4:** every shared UI acceptance test runs on all seven phone projects; the current default `@matrix` filter is insufficient.
- WebKit projects: iPhone SE **375×667**, iPhone 15 **393×852**, iPhone 17 Pro Max **440×956**.
- Chromium projects: Pixel 7 **412×915**, Galaxy compact **360×780**, Small Android **360×640**.
- Keep the existing WebKit **320×568** floor project; explicitly assert configured dimensions instead of trusting descriptor names.
- On every completed screen: no horizontal scrolling, no clipped text, safe controls, reachable actions, and screenshots inspected per device.
- **SPEC 13.3–13.5:** repeat layout checks at 130% text; active exercise title, guidance, current row, reps/hold, and ✓ fit before any scrolling.
- **SPEC 13.3:** generated two-year history, fresh storage, long names, zero/huge weights, both units, offline recovery, double taps, and rapid navigation.
- Monkey runs last **90 seconds per main screen per project**, with observable successful actions and no stuck state.
- **SPEC 2, 5.5, 20.2, 21.1:** delayed logging preserves exact submitted values, stable identity, row progression, and rest behavior.
- **SPEC 0, 1, 9.1–9.2:** local-only synthetic fixtures, `/anygym/` routing, service-worker recovery, and durable backup restoration.
- **SPEC 13.4:** portrait guard preserves underlying state; Back closes nested sheets before leaving the screen.
- Full onboarding and active-run recovery remain future work: onboarding and recording runs are not implemented in this checkout.
- **SPEC 23.4 and Session 1 gate:** independent UX review, screenshots/videos, full suites, deployment confirmation, live check, and hand-test list.

2) Reuse these files and make the following concrete changes.

- [playwright.config.ts](/Users/rabah/projects/anygym/playwright.config.ts): preserve `IPHONES`/`MATRIX`, explicitly set required viewports, and remove the default Android/floor `grep`.
- `PW_FULL_MATRIX=1` already enables full discovery; make that coverage unconditional for shared acceptance tests.
- Preserve `PW_PORT`, `PW_NO_BUILD`, and `PW_DIST`; they support isolated runs against a shared build.
- [tests/fixtures.ts](/Users/rabah/projects/anygym/tests/fixtures.ts): retain `trapErrors()`, `guardContext()`, automatic `errorTrap`, and `guardNewContexts`.
- Context-wide collection, plain `browser.newContext()` guarding, and exact-URL offline/network exemptions already exist; verify them rather than rebuilding them.
- Keep `allowConsoleErrors()` narrowly scoped to deliberate test faults; do not add broad application-message exemptions.
- `tests/harness.spec.ts`: retain deliberate console/error/rejection failures; strengthen proof that the expected failure came from fixture teardown.
- [tests/helpers/layout.ts](/Users/rabah/projects/anygym/tests/helpers/layout.ts): extend `checkLayout()` with a proposed active-workout option accepting required locators.
- In that mode, inspect full bounds and coverage **before scrolling**, and assert all scroll positions remain unchanged.
- Keep normal scrolling reachability checks for Settings, lists, and sheet content.
- Reuse `simulateSafeAreas()`, `insetsOf()`, `fullyShown()`, and `matrixShot()`; check nested horizontal scrollers as well as document width.
- `tests/text-130-1.7e.spec.ts`: extract `scaleText()`/clipping inspection into a shared helper; apply scaling once to newly mounted sheet content too.
- `tests/matrix.spec.ts`: cover existing routes from `src/App.tsx`, including populated/empty states, finish, History detail, import review, and restore.
- Extend sheet coverage to Edit set, Starting weight, bar choice, added weight, equipment info, and nested-sheet Back.
- [tests/helpers/monkey.ts](/Users/rabah/projects/anygym/tests/helpers/monkey.ts): retain `monkey()`, `closeSheets()`, `toTabs()`, and `goHome()`; replace attempt-only success counts.
- Count effects such as route change, dialog count, selected value, logged-set count, or scroll movement; keep blank taps as attempts.
- `tests/monkey.spec.ts`: run every project and add the built Run placeholder; include pushed-screen/sheet scenarios.
- Proposed new `tests/helpers/touch.ts`: provide Chromium native touch input and explicitly identified WebKit app-gesture simulation.
- Mouse dragging currently exercises pointer handlers but does not establish native touch panning; retain a physical-device verification item.
- [tests/helpers/history-fixture.ts](/Users/rabah/projects/anygym/tests/helpers/history-fixture.ts): retain `seedHistory()` and `dbPut()` transaction-based seeding.
- Extract pure `rng()`, `loadFor()`, and `generateHistory()` into proposed `tests/helpers/history-data.ts`; re-export existing public helpers.
- Fix `loadFor()`: `single` and `plate_machine` currently return `stackLoad()` records. Use `singleLoad()` and `plateMachineLoad()` with explicit synthetic resistance.
- `tests/history-2y.spec.ts`: extend existing ordering, timing, and Last time assertions to oldest details, exact Next targets, logging, and reload.
- [tests/helpers/kill.ts](/Users/rabah/projects/anygym/tests/helpers/kill.ts): retain `launchPersistent()`, `killHard()`, and `relaunchOffline()`; fail if profile processes survive termination.
- `tests/kill.spec.ts`: expand `snapshot()` to durable state introduced by 1.7i, plus `kv`, tombstones, and added-row state.
- `tests/helpers/idb.ts` and `tests/edge.spec.ts`: preserve the existing held-transaction React remount regression; it already checks distinct 135/155 loads after reload.
- [tests/doubletap.spec.ts](/Users/rabah/projects/anygym/tests/doubletap.spec.ts): preserve repeated same-node/same-position taps and the delayed-live-query regression.
- `src/screens/workout/ExerciseView.tsx` and `src/lib/logQueue.ts`: retain `log()`, `claim()`, `claimed()`, and layout-effect `release()`; modify only for demonstrated failures.
- Proposed new `tests/harness-layout.spec.ts` and `tests/harness-monkey.spec.ts`: prove hidden controls and tap-blocking overlays fail the harness.
- `tests/live_check.spec.ts`: add explicit unhandled-rejection coverage without importing the localhost-only network guard unchanged.
- `reports/session-1.md`: record actual results, matrix screenshots, UX findings, deployed commit, and outstanding physical checks.

3) Preserve the existing data model and resolve durability ownership with 1.7i.

- [src/db/schema.ts](/Users/rabah/projects/anygym/src/db/schema.ts) already declares **schema v7**, `SCHEMA_V7 = { kv: 'key' }`, and `KvRow`.
- Existing `kv` rows contain `{ key, value: string | null, at }`; `null` records removals.
- `src/lib/durable.ts` already implements `mirror()` and `restoreMirrors()` for drafts, rest, and extra-set keys.
- `src/main.tsx` restores mirrors before mounting React; keep that ordering.
- The harness itself needs no additional production tables or migration.
- Add a true **v6 → current** migration case in `src/db/__tests__/migration.test.ts`; existing cases stop at a v5 source database.
- Seed nonempty submissions/tombstones, sessions, sets, settings, counters, and plan state; verify every existing record survives unchanged.
- Do not allocate another schema version until 1.7i’s pending-write journal and durable restore design are settled.
- `kv` is deliberately excluded from backup `TABLE_NAMES`; preserve that only while it remains a reconstructible mirror.
- If 1.7i makes any durable table authoritative, update its backup validator/export/restore contract there.
- `mirror()` currently runs asynchronously and swallows failures; it does not provide an acknowledged durable Log journal.
- Test that restoring/replacing drafts cannot later be overwritten by an older `kv` mirror during startup.

4) Handle the difficult boundaries explicitly.

- Safe-area values are simulated through `--safe-*`; Playwright device emulation does not prove real `env()` values.
- Reuse current inset values: SE 20/0, iPhone 15 59/34, Pro Max 62/34; record them as test assumptions.
- A control scrolled into view passes reachability but can still violate the active-workout one-screen rule; keep those assertions separate.
- Ignore intentionally clipped odometer internals, inert backgrounds, and offscreen list content without exempting active text or controls.
- Test the longest shipped names with rest running and 130% text simultaneously, especially SE and the 320 floor.
- A pending write holds `sets`; do not call `dbAll('sets')` before releasing it, because that read can block behind the transaction.
- Release held transactions in `finally`; close the seam’s side connection during cleanup.
- Hard-kill tests must terminate only their own uniquely named persistent profile, never shared runner browsers.
- Warm the service worker online first, relaunch with `offline: true`, then assert storage and rendered state.
- Existing kill tests explicitly reopen the captured URL; separately verify launch at `./` and Resume behavior without claiming automatic route restoration.
- Compare stopwatch start/rest deadline exactly; compare displayed seconds with tolerance for elapsed wall time.
- Keep the hold target beyond test duration; separately test crossing a target/expired rest during termination.
- Keep failed submission, accepted Undo, and newer draft revision recovery aligned with 1.7i’s authoritative storage.
- Monkey navigation must remain within the current document; any recovery reload is a failure.
- Preserve the external-navigation guard so random input cannot launch native music apps or external sites.

5) Write or strengthen these tests with explicit assertions.

- **Vitest — `src/lib/__tests__/logQueue.test.ts`:** retain same-task/in-flight/stale-render deduplication, failed retry, release, and independent-key cases.
- Add synchronous reentry coverage proving the row is claimed before the submission callback can trigger another check.
- **Vitest — `src/lib/__tests__/durable.test.ts`:** retain lost-write/removal recovery; add older/equal/newer stamps and restart idempotency.
- Assert stale mirrors cannot resurrect cleared drafts after Finish or replace a newer restored draft.
- **Vitest — migration test:** upgrade an actual v6 database, preserve every record, reopen twice, then successfully log/delete/undo.
- **Vitest — proposed `src/lib/__tests__/historyFixture.test.ts`:** fixed seed/time produces identical data; different seeds differ.
- Assert unique IDs/orders, valid references, two-year span, both gyms/units, expected load kinds, and compatible reps/seconds.
- Use `src/lib/load.ts` constructors and validators; do not duplicate weight arithmetic in fixtures.
- **Playwright — harness:** intentional console error, rejection, exception, second-page error, and custom-context error fail through teardown.
- Assert an online local-asset failure fails; deliberately offline or guard-aborted requests remain narrowly exempt.
- **Playwright — harness layout:** below-fold ✓, fully clipped button, home-indicator overlap, nested horizontal overflow, and covered action all fail.
- **Playwright — harness monkey:** transparent blocking overlay fails before any navigation/reload; successful action counts remain zero.
- **Playwright — matrix:** every required screen/sheet passes geometry at normal and 130% text, with active controls checked without scrolling.
- **Playwright — delayed Log:** transaction stays held across actual unmount/remount; release, log a distinct second set, reload, assert two exact records.
- **Playwright — repeated ✓:** retain five rounds for 0/40/120/300 ms gaps and the 900 ms stale-read window; zero retries.
- **Playwright — kill:** draft/rest and running hold survive SIGKILL offline, preserving IDs, values, timestamps, committed records, and extra rows.
- Add a kill with an uncommitted held Log transaction; recovery must expose one recoverable submission and retry exactly once.
- **Playwright — history:** inspect newest and oldest sessions, assert exact sets/units, verify known Last time/Next, log, reload, and verify counts.
- **Playwright — discovery:** compare JSON test listings across projects; every shared acceptance test must appear seven times.
- Run targeted work first on **iPhone SE and iPhone 17 Pro Max**, then all seven projects with default coverage.
- Gate commands: `npm run build`, `npm run test`, `npm run test:coverage`, and `npx playwright test`.
- Generate reviewed report images with `SHOTS_112=1`; keep monkey duration at 90 seconds for the acceptance run.

6) Resolve these existing conflicts before declaring the gate passed.

- The checkout is on `s1-foundation` with extensive modified/untracked work, including 1.12 helpers. Review its diff before editing or staging.
- `PLAN.md` still lists **1.7i before 1.12**; its layout, monkey, contrast, journal, and restore changes overlap directly.
- Treat 1.7i’s completed contracts as prerequisites; do not implement competing persistence or harness APIs.
- `reports/codex/1.12.md` is partly stale: custom-context trapping, online-failure filtering, and UI-only monkey return navigation are already addressed.
- Current remaining gaps include default matrix filtering, scrolling active-layout checks, mouse-only swipes, attempt counters, and generator load-kind mismatch.
- Existing two-year data is roughly 300 sessions/4,000 sets; SPEC requires a two-year span, not 730 daily workouts.
- PROMPT’s “three profiles” gate predates SPEC’s seven-device requirement; SPEC wins.
- SPEC 13 requires 48 pt targets, while SPEC 23 permits 44 pt controls; record this discrepancy and use the stricter general acceptance threshold.
- Full-matrix monkeys and persistent browsers increase resource pressure; tune worker count rather than reducing coverage or retrying away races.
- GitHub Pages workflow currently builds/deploys without running these suites; establish local gate evidence before merge.
- After UX acceptance and green suites: merge without fast-forward, smoke-test master, push, confirm Pages, run `npm run test:live`, and record results.
- Hand-test list: install/launch offline; squat checks; rapid double tap; nested Back; kill/resume draft, hold, and rest; 130% text; safe areas; real share/restore.
- If UI fixes are required, follow SPEC 23 and its local design references; the critic must inspect SE/Max screenshots and actual simulator evidence.