**12 findings: six reproduced product defects and six test blind spots.** Reviewed completed `[x]` scope against the earlier reports. Fixed findings—including the zero-height workout buttons—are excluded. No files edited.

TypeScript passed. All six product failures below reproduced with production functions and in-memory IndexedDB. Full Vitest/Playwright suites and physical iPhone behavior were not run.

1. **MAJOR — STILL OPEN: Finish silently omits an unresolved submitted lift.**  
   [workouts.ts:530](/Users/rabah/projects/anygym/src/db/workouts.ts:530), [WorkoutScreen.tsx:661](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:661)  
   After another tab’s journal write fails, its submission can survive only in the durable draft mirror. Finish checks journals and held corrections, overlooks that submission, succeeds, then clears drafts. **Reproduced:** pending **73 lb × 19**; finished workout contained only the earlier set.  
   **Exact fix:** Serialize Log admission and Finish under the session lock. Within Finish’s transaction, reconcile durable draft submissions against receipts and cancellations; reject unresolved submissions and construct the Undo snapshot from that reconciled state.  
   **Test:** Promote the existing expected-failure case at [codex-cross-tab-submission-evidence.test.ts:85](/Users/rabah/projects/anygym/src/db/__tests__/codex-cross-tab-submission-evidence.test.ts:85) to a normal test after fixing it. Add offline restart → Retry → exactly one saved 73 × 19 set.

2. **MAJOR — STILL OPEN: Reconciliation deletes conflicting lower-revision input.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Different fingerprints protect input only when revisions match, although tabs allocate revisions independently. **Reproduced:** pending **73 lb × 19, revision 1** disappeared against saved **53 lb × 10, revision 5**.  
   **Exact fix:** Preserve conflicting fingerprints regardless of revision ordering. Use immutable submission identities and coordinated revisions; a higher revision cannot acknowledge a different payload.  
   **Test:** The cases at [codex-cross-tab-submission-evidence.test.ts:47](/Users/rabah/projects/anygym/src/db/__tests__/codex-cross-tab-submission-evidence.test.ts:47) already describe this failure but use `it.fails`. Make them normal acceptance tests after fixing it; retain the matching-payload control.

3. **MAJOR — STILL OPEN: “Finish without it” discards values the user never reviewed.**  
   [ExerciseView.tsx:313](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:313), [rowLog.ts:363](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:363)  
   Toast Retry preserves the old operation ID. The discard check compares identity, revision and operation, without comparing payloads. **Reproduced:** the sheet represented **53 lb × 17**; the journal subsequently contained **73 lb × 19** under the same identifiers; dismissing the original sheet deleted the later submission.  
   **Exact fix:** Assign `op: newId()` on every Retry. Include the payload fingerprint in `ShownRow` and transactionally require that exact fingerprint before discarding.  
   **Test:** Add the same-ID/revision/operation, different-payload interleaving. Discarding the 17-rep snapshot must preserve the 19-rep submission and continue blocking Finish.

4. **MAJOR — STILL OPEN: Backup omits a durably retained correction.**  
   [backup.ts:79](/Users/rabah/projects/anygym/src/db/backup.ts:79), [backup.ts:101](/Users/rabah/projects/anygym/src/db/backup.ts:101)  
   Held corrections are captured before the database snapshot. **Reproduced:** a failed correction to **73 lb × 19** became durable during that gap; the backup contained old **53 lb × 10** and a subsequently logged set, with no pending correction. Restore loses the intended edit.  
   **Exact fix:** Read durable held corrections inside the snapshot transaction alongside sets, journals and supersession receipts. Coordinate memory/fallback capture with mutation registration.  
   **Test:** Extend [codex-3.2b.test.ts:217](/Users/rabah/projects/anygym/src/db/__tests__/codex-3.2b.test.ts:217): pause export before its snapshot, durably retain a new failed correction, commit another set, resume export, then restore into a fresh context. Require the correction to remain retryable with its exact values.

5. **MAJOR — STILL OPEN: Coach “+5 lb” removes stack add-on resistance.**  
   [levelUp.ts:61](/Users/rabah/projects/anygym/src/lib/coach/levelUp.ts:61), [useWorkout.ts:266](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:266)  
   The coach calculates from the pin value and rebuilds the target without `added`. **Reproduced:** **100 lb pin + 25 lb added = 125 lb** earned “+5 lb”; the resulting target was **105 lb total**.  
   **Exact fix:** Preserve the pin/add-on breakdown through `PlannedChange` and `CoachTarget`. Calculate percentage changes from complete resistance, solve the pin with the retained add-on accounted for, and pass that add-on to `loadAt()`.  
   **Test:** Exercise the complete decision → stored target → workout row → Log path with lb and kg stack add-ons. Assert both the promised resistance increase and the complete saved breakdown.

6. **MAJOR — STILL OPEN: Failed Quick setup leaves the wrong workout selected after Retry.**  
   [quick.ts:145](/Users/rabah/projects/anygym/src/db/quick.ts:145) — completed PLAN **3.5a** behavior.  
   Session creation commits before trimming and deck swaps. If setup subsequently fails, Retry returns that existing session immediately. **Reproduced:** a four-exercise deck became the original **16-exercise day**, without its trim.  
   **Exact fix:** Put active-session lookup, creation, trimming and all deck swaps in one outer transaction covering `sessions`, `planState`, `gyms`, `exerciseSettings`, `sets`, `journal`, `submissions` and `tombstones`. Roll back all setup on failure.  
   **Test:** Inject failure during trim and separately during the second swap. After each failure, assert no partially created session; retry and require the exact chosen deck, targets and duration.

7. **MAJOR — STILL OPEN, SPEC 13.3 blind spot: Hard-kill tests avoid in-flight writes.**  
   [kill.spec.ts:85](/Users/rabah/projects/anygym/tests/kill.spec.ts:85)  
   Termination occurs after UI assertions and database snapshots have settled. This establishes settled-state recovery without testing interruption of journal persistence, transaction commit or reconciliation.  
   **Counterexample:** committed receipts recover correctly, but another pending row disappears if termination happens before cleanup finishes. **A current browser failure at that boundary is unconfirmed.**  
   **Exact fix/test:** Add deterministic gates after journal commit, during the set transaction, and after receipt commit/before reconciliation. SIGKILL at each gate, reopen offline, Retry, and assert literal pending values plus exactly one committed submission. Include Undo acceptance/restoration boundaries.

8. **MAJOR — STILL OPEN, SPEC 13.3–13.4 blind spot: Default acceptance excludes four required devices.**  
   [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47)  
   Android and the 320-wide project run only `@matrix` cases by default; kill and monkey cases are excluded.  
   **Counterexample:** a Chromium-only recovery regression cannot fail the normal suite because its recovery test is never selected. This is a coverage defect, not evidence of an Android product bug.  
   **Exact fix/test:** Make full-matrix execution the acceptance default and expose checkpoint subsets separately. Add a discovery assertion requiring applicable functional test IDs—including kill and monkey cases—on all seven projects; audit internal device skips too.

9. **MAJOR — NEW, SPEC 13.3 blind spot: Screenshot-noise suppression also hides real application CSP errors.**  
   [fixtures.ts:184](/Users/rabah/projects/anygym/tests/fixtures.ts:184)  
   `quietHarnessStyleNoise()` suppresses matching stylesheet errors unconditionally, including outside screenshots, before any console listener receives them. The dedicated CSP test does not cover every later interaction.  
   **Counterexample:** a component injects a forbidden `<style>` after an interaction; styling fails for the user, but the normal zero-console-error trap ignores the browser’s error. **No current component failure is claimed.**  
   **Exact fix/test:** Replace the global message filter with suppression scoped to identified screenshot-generated violations. Capture application `securitypolicyviolation` events across every document. Add a harness test that appends a forbidden stylesheet without taking a screenshot and must fail at teardown; retain a separate screenshot-noise control.

10. **MAJOR — STILL OPEN, simulated interaction: “Swipe” tests bypass native touch behavior.**  
    [loads.spec.ts:58](/Users/rabah/projects/anygym/tests/loads.spec.ts:58), [polish-2.2d.spec.ts:44](/Users/rabah/projects/anygym/tests/polish-2.2d.spec.ts:44)  
    Wheel coverage assigns `scrollLeft`; row swipes use mouse dragging.  
    **Counterexample:** incorrect `touch-action` prevents finger scrolling inside a sheet while both tests pass. **A current physical-device failure is unconfirmed.**  
    **Exact fix/test:** Use native touch injection on Chromium and an iOS simulator/device driver. Swipe wheels inside Weight and Edit sheets, require changed selection, then confirm Done/Save persists the displayed weight. Separately verify horizontal row deletion and vertical scrolling without deletion.

11. **MAJOR — STILL OPEN, SPEC 13.3 blind spot: No uninterrupted fresh-user → three sets → Finish walkthrough.**  
    [intake-3.3.spec.ts:182](/Users/rabah/projects/anygym/tests/intake-3.3.spec.ts:182), [fixtures.ts:248](/Users/rabah/projects/anygym/tests/fixtures.ts:248)  
    The measured walkthrough ends on entering the workout. Other logger tests generally receive precompleted-intake flags or seeded state.  
    **Counterexample:** onboarding produces a first-use configuration that blocks logging, while isolated onboarding and established-user logging tests both pass. This product failure is hypothetical.  
    **Exact fix/test:** Add one `intake: 'fresh'` test with empty storage: complete onboarding through the UI, start the revealed day, choose a weight, log three sets, Finish, reload History. Assert one finished session and the three exact payloads; count every interaction.

12. **MINOR — STILL OPEN, implementation-repeating assertion: Backup completeness uses production’s whitelist as its oracle.**  
    [backup.test.ts:73](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:73), [backup.test.ts:97](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:97)  
    The snapshot and expected table names both derive from `TABLE_NAMES`.  
    **Counterexample:** removing a required category from production’s whitelist also removes it from these expectations, allowing an incomplete backup to pass. This does not establish that another category is currently missing.  
    **Exact fix/test:** Define an independent literal backup contract. Seed distinct sentinels in every required category, including drafts, rest, extra rows and pending changes; export and restore into a fresh context, then assert each destination sentinel directly. Removing any required export category must fail.