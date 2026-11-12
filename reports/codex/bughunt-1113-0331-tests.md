**12 findings, worst first: 11 MAJOR, 1 MINOR. All are STILL OPEN from earlier reports.** Reviewed completed work only; fixed findings are excluded. No files edited.

Typecheck passed. Focused Vitest execution produced **6 passes and 5 expected failures** reproducing known defects. Additional in-memory probes confirmed findings 2, 5, 6 and 7. Playwright and physical iPhone testing were not run; the device counterexamples below are coverage risks, not confirmed phone failures.

1. **MAJOR — STILL OPEN: Finish can omit a submitted lift.**  
   [workoutFinish.ts:83](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:83)

   A failed Log in another tab can leave **73 lb × 19** only in the durable draft mirror. Finish checks journals and held corrections, overlooks that submission, and succeeds. The UI then clears drafts.

   **Exact fix:** Serialize submission registration with Finish under the session lock. Inside Finish’s transaction, reconcile durable submitted drafts against commit/cancellation receipts and reject unresolved submissions. Capture Undo state from that authoritative snapshot.

   **Test:** Make [codex-cross-tab-submission-evidence.test.ts:85](/Users/rabah/projects/anygym/src/db/__tests__/codex-cross-tab-submission-evidence.test.ts:85) an ordinary test instead of `it.fails`. Extend through restart → Retry twice → exactly one saved **73 lb × 19** set.

2. **MAJOR — STILL OPEN: Discard → Undo loses pending input.**  
   [discard.ts:14](/Users/rabah/projects/anygym/src/db/discard.ts:14), [TodayScreen.tsx:200](/Users/rabah/projects/anygym/src/screens/TodayScreen.tsx:200)

   A failed first Log can leave a submitted draft without a journal or saved set. Discard accepts the workout as empty and clears drafts. Undo restores only the session and counter. Ordinary unsubmitted picks also disappear.

   **Exact fix:** Under the session lock, refuse Discard while submitted drafts or held corrections remain unresolved. Transactionally retain drafts, added rows and rest state; restore their durable and runtime copies on Undo.

   **Test:** Fail the first journal write after picking **73 lb × 19**. Discard, Undo and restart. Assert either Discard was refused or the exact input remains recoverable. Repeat with an unsubmitted pick; existing discard tests seed no drafts.

3. **MAJOR — STILL OPEN: Recovery erases conflicting lower-revision input.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)

   Different payloads receive fingerprint protection only at equal revisions. Tabs allocate revisions independently, so pending **73 lb × 10, revision 1** disappears against saved **53 lb × 10, revision 5**.

   **Exact fix:** Require matching payload evidence or explicit causal supersession before consuming a draft, regardless of revision ordering. Preserve conflicts under distinct recoverable identities.

   **Test:** Remove `it.fails.each` at [codex-cross-tab-submission-evidence.test.ts:47](/Users/rabah/projects/anygym/src/db/__tests__/codex-cross-tab-submission-evidence.test.ts:47). Require both payloads to survive restart and the conflicting payload to save once. Retain the matching-payload deduplication control.

4. **MAJOR — STILL OPEN: Backup can omit a durable correction.**  
   [backup.ts:80](/Users/rabah/projects/anygym/src/db/backup.ts:80), [backup.ts:102](/Users/rabah/projects/anygym/src/db/backup.ts:102)

   Held corrections are captured before the database snapshot. A correction retained during that gap appears in neither exported sets nor pending changes—even when a later committed set enters the backup. Restore loses the correction.

   **Exact fix:** Read durable held corrections inside the same snapshot transaction as sets, journals and suppression receipts. Coordinate memory/fallback capture with mutation registration.

   **Test:** Promote the “at snapshot” case at [codex-backup-arriving-correction.test.ts:28](/Users/rabah/projects/anygym/src/db/__tests__/codex-backup-arriving-correction.test.ts:28) from expected failure. Restore into a fresh database, restart, Retry twice and assert the exact correction commits once.

5. **MAJOR — STILL OPEN: Logging resurrects deliberately removed drafts.**  
   [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)

   The durable merge reinserts a clean cached draft whenever IndexedDB lacks its slot. With localStorage unavailable, input removed elsewhere can therefore return after another row is logged.

   **Exact fix:** Remove the clean-row insertion fallback. Apply only dirty updates and explicit deletions; clean cached rows must adopt committed absence. Refresh memory from the committed merge without overwriting subsequent edits.

   **Test:** Use two isolated module contexts sharing IndexedDB with localStorage blocked. Hydrate the same draft, remove it in A, log another row in B, then restart. Assert the removed identity stays absent and B’s set exists once.

6. **MAJOR — STILL OPEN: Rechecking a failed Log changes its gym.**  
   [setTable.ts:213](/Users/rabah/projects/anygym/src/lib/setTable.ts:213), [useLogRow.ts:50](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:50)

   Submit at gym A, let journaling fail, switch to B and tap the row’s check again. `markSubmitted()` replaces the captured gym with B, contaminating machine history and future targets.

   **Exact fix:** Preserve `base.gymId` whenever `base.submitted !== undefined`, including revision zero. Capture the current gym only for a fresh submission.

   **Test:** Parameterize submitted revisions **0 and 1**. Fail journaling at A, switch to B, recheck, restart and retry. Assert one saved set stamped A, present only in A’s machine history.

7. **MAJOR — STILL OPEN: Beginner targets discard stack add-on resistance.**  
   [useWorkout.ts:282](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:282)

   The calculation receives only the pin value, then reconstructs without the add-on. A **100 lb pin + 50 lb added**, lifted for ten reps, produces a **110 lb** eight-rep target.

   **Exact fix:** Calculate the estimate and increase limit from complete resistance in `src/lib/load/`. Return an explicit pin/add-on load representing the intended total.

   **Test:** Extend [coach-3.8.spec.ts:269](/Users/rabah/projects/anygym/tests/coach-3.8.spec.ts:269), which currently covers only a barbell. Add lb/kg stack cases. Under the current formula, the example should target **165 lb**; assert displayed and logged resistance agree.

8. **MAJOR — STILL OPEN, test gap: Hard-kill coverage avoids interrupted writes.**  
   [kill.spec.ts:85](/Users/rabah/projects/anygym/tests/kill.spec.ts:85)

   Tests wait for settled UI/database state before killing. They do not cover SPEC 13.3’s interrupted persistence boundaries.

   **Counterexample:** Termination after receipt commit but before draft reconciliation could duplicate a lift or lose pending input while these tests pass.

   **Exact fix/test:** Add deterministic gates after journal commit, during the set transaction, and after receipt commit before reconciliation. SIGKILL at each gate, relaunch offline, Retry and assert exact pending payloads plus one committed submission. Include interrupted Undo acceptance/restoration.

9. **MAJOR — STILL OPEN, test gap: Default execution omits required devices.**  
   [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47)

   Android projects and the 320-wide floor select only `@matrix` tests. Kill and monkey cases lack that tag, so normal execution omits their required SPEC 13.3–13.4 coverage.

   **Counterexample:** A Chromium-only recovery failure passes default acceptance because its test never runs there.

   **Exact fix/test:** Make all seven projects mandatory for acceptance; expose the fast subset separately. Add a discovery check requiring applicable kill and monkey test IDs on every project, accounting for internal skips.

10. **MAJOR — STILL OPEN, suppressed failure: The fixture hides application CSP errors.**  
    [fixtures.ts:184](/Users/rabah/projects/anygym/tests/fixtures.ts:184)

    `quietHarnessStyleNoise()` suppresses matching stylesheet violations from every console listener, even outside screenshots. The dedicated CSP walk does not cover every interaction.

    **Counterexample:** Opening a sheet inserts a forbidden stylesheet; its styling fails while the ordinary test’s zero-error gate passes.

    **Exact fix/test:** Collect `securitypolicyviolation` events globally. Exempt only violations positively attributable to screenshot operations. Add a harness test inserting a forbidden `<style>` without a screenshot and require the collector to record it; retain a screenshot-noise control.

11. **MAJOR — STILL OPEN, simulated interaction: Swipe tests bypass native gesture handling.**  
    [loads.spec.ts:58](/Users/rabah/projects/anygym/tests/loads.spec.ts:58), [touch.ts:24](/Users/rabah/projects/anygym/tests/helpers/touch.ts:24)

    Wheel tests assign `scrollLeft`; the touch helper dispatches untrusted DOM events. Neither verifies native scrolling or gesture arbitration.

    **Counterexample:** Incorrect `touch-action` prevents finger scrolling inside a picker while these tests pass.

    **Exact fix/test:** Add native Chromium touch injection and an iOS simulator/device gesture test. Drag wheels inside Weight/Edit sheets, immediately confirm, and assert saved weight equals the displayed selection. Verify vertical scrolling never deletes a row.

12. **MINOR — STILL OPEN, repeating assertion: Backup completeness shares production’s whitelist.**  
    [backup.test.ts:73](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:73), [backup.test.ts:97](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:97)

    Both the snapshot and expected exported table names derive from production `TABLE_NAMES`.

    **Counterexample:** Removing `exerciseSettings` from that list removes it from actual and expected snapshots. The completeness assertions pass despite losing bar choices and rest settings.

    **Exact fix/test:** Define an independent literal backup contract. Seed distinct sentinels in every required category, restore into a fresh database, and directly assert destination records and live state. Do not construct expectations through `TABLE_NAMES` or production `readTables()`.