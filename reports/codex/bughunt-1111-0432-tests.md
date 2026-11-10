**11 findings: five product defects and six test blind spots, all STILL OPEN.** Reviewed completed `[x]` work only. No files edited. Fixed earlier findings are excluded.

Typecheck passed. In-memory IndexedDB probes reproduced findings 1–4 using production functions. Vitest could not start because the read-only sandbox blocked its temporary config file. Playwright and physical-device behavior were not executed.

1. **MAJOR — STILL OPEN: Finish accepts an unresolved submitted lift.**  
   [workouts.ts:530](/Users/rabah/projects/anygym/src/db/workouts.ts:530), [WorkoutScreen.tsx:659](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:659)

   Another tab’s failed Log can survive solely in the durable draft mirror. Finish checks journals and held edits, overlooks that submission, then clears drafts. **Reproduced:** pending **73 lb × 19** existed, but Finish returned success with only the earlier saved set.

   **Exact fix:** Serialize Log admission with Finish under the session lock. Inside Finish’s transaction, reconcile durable submitted drafts against submission/cancellation receipts, refuse unresolved submissions, and capture the reconciled drafts for Undo.

   **Test:** Promote [codex-cross-tab-submission-evidence.test.ts:85](/Users/rabah/projects/anygym/src/db/__tests__/codex-cross-tab-submission-evidence.test.ts:85) from `it.fails` to an ordinary acceptance test after fixing. Extend through offline restart → Retry → exactly one **73 lb × 19** set. Its current expected-failure status permits a green suite while the defect remains.

2. **MAJOR — STILL OPEN: Reconciliation deletes conflicting lower-revision input.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)

   Tabs allocate revisions independently, but differing fingerprints protect input only at equal revisions. **Reproduced:** pending **73 lb × 19, revision 1** disappeared against saved **53 lb × 10, revision 5**.

   **Exact fix:** Require matching payload evidence before consuming a draft at any revision. Preserve unmatched input under a recoverable identity; allocate submission revisions transactionally across tabs.

   **Test:** Promote the `it.fails.each` cases at [codex-cross-tab-submission-evidence.test.ts:47](/Users/rabah/projects/anygym/src/db/__tests__/codex-cross-tab-submission-evidence.test.ts:47). Assert the original committed set and exact conflicting input both survive restart, then resubmission saves the latter once. Keep the matching-payload deduplication control.

3. **MAJOR — STILL OPEN: Backup omits a durably retained correction.**  
   [backup.ts:79](/Users/rabah/projects/anygym/src/db/backup.ts:79), [backup.ts:101](/Users/rabah/projects/anygym/src/db/backup.ts:101)

   Held corrections are read before the table snapshot. A failed edit retained during that gap enters neither exported sets nor pending changes. **Reproduced:** the source retained **73 lb × 19**; backup contained the original **53 lb × 10** and a later committed set, but omitted the correction.

   **Exact fix:** Include durable held corrections in the same snapshot transaction as sets, journals and suppression receipts. Coordinate memory/fallback capture with mutation registration under the session lock.

   **Test:** Extend [codex-3.2b.test.ts:217](/Users/rabah/projects/anygym/src/db/__tests__/codex-3.2b.test.ts:217): pause export before its table snapshot, retain a newly failed edit, commit another set, resume export, restore into a fresh context, and assert the correction remains retryable with exact values. Existing coverage tests an earlier correction becoming obsolete, not a new correction arriving.

4. **MAJOR — STILL OPEN: Logging resurrects deliberately removed pending input.**  
   [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)

   The durable merge restores clean cached rows whenever IndexedDB lacks them. With localStorage unavailable, a stale tab can therefore undo another tab’s deliberate removal. **Reproduced:** removed **73 lb × 19** returned to durable storage.

   **Exact fix:** Apply only dirty updates and explicit deletions. Clean cached rows must adopt committed state, including absence. Refresh memory from the successfully committed merge.

   **Test:** Use two isolated module contexts sharing IndexedDB and blocked localStorage. Hydrate the same draft in both; remove it in A; log another row in B; restart. Assert the removed identity is absent from storage and UI, while B’s newly logged set exists exactly once.

5. **MAJOR — STILL OPEN: An unresolved generated plan silently uses Quick workout prescriptions.**  
   [useWorkout.ts:161](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:161), [workouts.ts:428](/Users/rabah/projects/anygym/src/db/workouts.ts:428), [main.tsx:64](/Users/rabah/projects/anygym/src/main.tsx:64)

   Plans are resolved from a runtime registry populated at startup. An older tab can observe a session created elsewhere without knowing its generated plan. A startup plan-read failure is also swallowed. The workout then falls back to Quick defaults, and Finish omits plan progress. Source-confirmed; the browser interleaving was not rerun.

   **Exact fix:** Resolve saved definitions reactively from IndexedDB by `planId`; include loading/errors in workout readiness. A nonempty unresolved plan ID must block logging and Finish. Resolve its definition inside Finish’s transaction too.

   **Test:** Open A before B generates and starts a plan prescribing **2 × 4–6**. Resume in A without reloading; assert those prescriptions and correct advancement after Finish. Separately reject the plan read and require a retryable error instead of default rows.

6. **MAJOR — STILL OPEN: Hard-kill tests avoid in-flight persistence boundaries required by SPEC 13.3.**  
   [kill.spec.ts:85](/Users/rabah/projects/anygym/tests/kill.spec.ts:85)

   Tests wait for visible state and database snapshots before killing. They establish settled-state recovery, leaving interrupted-write recovery untested.

   **Counterexample:** termination after receipt commit but before reconciliation loses another pending row or allows duplicate submission. A current device failure is unconfirmed.

   **Exact fix/test:** Add deterministic gates after journal commit, during the set transaction, and after receipt commit/before reconciliation. SIGKILL at each gate, relaunch offline, Retry, and assert exact pending payloads plus one committed submission. Include interrupted Undo acceptance/restoration.

7. **MAJOR — STILL OPEN: Default acceptance excludes four required devices from most functional tests.**  
   [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47)

   Android projects and the 320-wide floor run only `@matrix` tests by default. Kill and monkey coverage therefore does not meet SPEC 13.3–13.4 across the required matrix.

   **Counterexample:** a Chromium-only recovery failure cannot fail default acceptance because its recovery test is never selected.

   **Exact fix/test:** Make full-matrix execution the acceptance default; provide a separate checkpoint subset. Add a discovery check comparing applicable test IDs across all seven projects, explicitly requiring kill and monkey cases and auditing internal skips.

8. **MAJOR — STILL OPEN: The error fixture suppresses real application CSP failures.**  
   [fixtures.ts:184](/Users/rabah/projects/anygym/tests/fixtures.ts:184)

   `quietHarnessStyleNoise()` filters matching stylesheet errors from every console listener, even when no screenshot occurs. Dedicated CSP tests do not protect interactions exercised only elsewhere.

   **Counterexample:** an interaction inserts a forbidden stylesheet; styling breaks, but SPEC 13.3’s console gate passes. No current component failure is claimed.

   **Exact fix/test:** Collect `securitypolicyviolation` events globally and exempt only positively attributed screenshot operations. Add a harness case inserting a forbidden `<style>` without taking a screenshot; teardown must reject it. Retain a screenshot-only noise control.

9. **MAJOR — STILL OPEN: Simulated swipes bypass native touch failures.**  
   [loads.spec.ts:58](/Users/rabah/projects/anygym/tests/loads.spec.ts:58), [loads.spec.ts:313](/Users/rabah/projects/anygym/tests/loads.spec.ts:313), [polish-2.2d.spec.ts:48](/Users/rabah/projects/anygym/tests/polish-2.2d.spec.ts:48)

   Wheel coverage assigns `scrollLeft` or drags with a mouse; row swipes also use mouse input. Native touch scrolling and gesture arbitration are simulated away.

   **Counterexample:** incorrect `touch-action` prevents finger scrolling inside a sheet while these tests pass. Physical-device failure is unconfirmed.

   **Exact fix/test:** Add native touch drags through Chromium touch injection and an iOS simulator/device driver. Swipe inside Weight/Edit sheets, immediately confirm, and assert saved weight equals the displayed selection. Verify horizontal row deletion and vertical scrolling without deletion.

10. **MINOR — STILL OPEN: Newly mounted controls escape active 130% text coverage.**  
    [codex-se-lifecycle.spec.ts:40](/Users/rabah/projects/anygym/tests/codex-se-lifecycle.spec.ts:40), [codex-se-offline-dynamic-text.spec.ts:33](/Users/rabah/projects/anygym/tests/codex-se-offline-dynamic-text.spec.ts:33)

    The active test enlarges existing elements once, then mounts reps/rest controls. The regression that scales newly mounted elements remains skipped.

    **Counterexample:** enlarged Done or rest labels overlap, but acceptance passes because those new controls render at normal size. Current overlap is unconfirmed.

    **Exact fix/test:** Enable baseline-preserving scaling for newly mounted controls and unskip the regression. Assert each new label computes to 1.3× baseline, then check clipping, overlap, 48-point targets and current-set visibility before automatic scrolling.

11. **MINOR — STILL OPEN: Backup completeness assertions repeat production’s whitelist.**  
    [backup.test.ts:73](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:73), [backup.test.ts:97](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:97)

    Both the snapshot and expected exported table names derive from production `TABLE_NAMES`.

    **Counterexample:** removing `exerciseSettings` from that whitelist removes it from both actual and expected snapshots, allowing lost bar choices/rest settings to pass the completeness assertions.

    **Exact fix/test:** Define an independent literal backup contract. Seed distinct sentinels in each required category, including drafts, rest, extra rows and pending changes; restore into a fresh context and assert each destination directly. Omitting any required category must fail.