Found **10 findings in completed features and their tests**. No files edited. Fixed earlier findings are excluded; remaining variants are marked **STILL OPEN**.

Typecheck passed. In-memory probes confirmed backup, recovery, progression and record failures. Full Vitest/Playwright suites and physical iPhone testing were not run.

1. **MAJOR — STILL OPEN, partial fix: Damaged backups can freeze weight selection.**  
   [backup.ts:130](/Users/rabah/projects/anygym/src/lib/backup.ts:130), [load.ts:303](/Users/rabah/projects/anygym/src/lib/load.ts:303)

   Validation checks numeric types but accepts `{ min: 5, max: 100, step: 0 }`. Replace accepts this gym; opening its dumbbell picker enters an endless loop. Parser acceptance was reproduced; the freeze follows directly from the loop.

   **Exact fix:** Require positive increments, nonnegative minimums and `max >= min`. Bound generated option counts. Add defensive validation inside `dumbbellsInRange()` too.

   **Test to add:** Parameterize zero/negative increments and reversed ranges through `parseBackup()`. Expect `DAMAGED` and unchanged database contents. Existing validator tests mostly exercise missing fields and wrong types.

2. **MAJOR — STILL OPEN, partial fix: Restored drafts remain inaccessible when localStorage stays unavailable.**  
   [durable.ts:77](/Users/rabah/projects/anygym/src/lib/durable.ts:77), [main.tsx:24](/Users/rabah/projects/anygym/src/main.tsx:24)

   Restore now saves drafts durably, but startup still requires copying them into localStorage. If that write keeps failing, startup swallows the error and presents the workout without its pending values. Reproduced: a restored 17-rep submitted row became invisible, and failed-row detection returned zero.

   **Exact fix:** Hydrate the runtime draft store directly from IndexedDB when localStorage fails. Finish must inspect that authoritative state before permitting completion.

   **Mocked-away failure/test:** [fixes-1.7i.test.ts:316](/Users/rabah/projects/anygym/src/screens/workout/__tests__/fixes-1.7i.test.ts:316) restarts with a fresh, functioning storage mock. Keep storage broken across restart, destroy runtime caches, and assert the exact draft remains visible, Finish refuses, and retry saves it once.

3. **MAJOR — NEW: Backup omits failed submissions surviving only in the journal.**  
   [backup.ts:34](/Users/rabah/projects/anygym/src/db/backup.ts:34), [schema.ts:77](/Users/rabah/projects/anygym/src/db/schema.ts:77)

   After restart, a failed Log may exist only in IndexedDB’s journal. Exporting from Settings before opening its exercise reads neither that journal nor its values. Reproduced on a fresh destination: the active workout restored, its failed 17-rep lift did not, and Finish discarded the workout without identifying an unsaved set.

   **Exact fix:** Include pending journal entries in the backup contract, or reconcile them into exported drafts within a consistent snapshot. Restore their submission identity, revision and values.

   **Implementation-repeating assertion/test:** [backup.test.ts:97](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:97) checks completeness against production’s own `TABLE_NAMES`; its snapshot uses the same whitelist. Add a journal-only failed submission, export without mounting the exercise, restore into a separate database, and assert Finish blocks and retry restores exactly one 17-rep set.

4. **MAJOR — NEW: Failed “Keep it deleted” can restore the unwanted set during Finish.**  
   [deleteUndo.ts:150](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:150), [WorkoutScreen.tsx:453](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:453)

   Cancellation forgets the recovery record immediately and swallows failure to delete its tombstone. Finish then sees `undo: true` and restores the set the user explicitly chose to keep deleted. Reproduced: the finished workout contained both sets.

   **Exact fix:** Make cancellation asynchronous and tracked. Retain unresolved state until tombstone deletion commits; await cancellation before Finish and expose a retry on failure.

   **Mocked-away failure/test:** [fixes-1.7i.test.ts:177](/Users/rabah/projects/anygym/src/screens/workout/__tests__/fixes-1.7i.test.ts:177) fails restoration without first persisting acceptance, and cancellation succeeds. Persist acceptance, fail restoration, then fail cancellation. Assert Finish remains blocked; successful cancellation must finish with only the retained set.

5. **MAJOR — NEW: Stack deload reduces only the pin, leaving added resistance unchanged.**  
   [progression.ts:193](/Users/rabah/projects/anygym/src/lib/progression.ts:193)

   After two below-range sessions at **100 lb pin +100 lb added**, “Reset and build back up” suggests **190 lb total**, although an exact 10% reset—**180 lb**—is loadable. Reproduced.

   **Exact fix:** Calculate the reset from complete resistance. Subtract the retained add-on from that target, then round the resulting pin to the machine’s increment.

   **Test to add:** Extend [progression.test.ts:183](/Users/rabah/projects/anygym/src/lib/__tests__/progression.test.ts:183), which tests stacks without additions. Two six-rep sessions, range 8–12 and 5 lb increments must produce `{ stackValue: 80, added: 100, total: 180 }`.

6. **MAJOR — STILL OPEN: Default test discovery excludes most acceptance cases from four devices.**  
   [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47)

   Android and 320-wide projects run only `@matrix` tests. For example, the new wheel confirmation regressions are untagged, so an Android-only failure cannot fail the normal run. This remains contrary to SPEC 13.3–13.4.

   **Exact fix:** Remove the default filter for shared acceptance tests; retain explicit exclusions only for genuinely platform-specific cases.

   **Test to add:** Compare discovered shared test IDs across all seven projects. Require each acceptance case—including wheel confirmation, restore and kill recovery—to appear on every applicable project.

7. **MAJOR — STILL OPEN, boundary coverage: Hard-kill tests avoid the transaction transitions most likely to lose data.**  
   [kill.spec.ts:85](/Users/rabah/projects/anygym/tests/kill.spec.ts:85)

   Real process termination is now covered, but after successful UI assertions and snapshots. It does not deterministically kill during Log commit, draft reconciliation or accepted Undo restoration. The corresponding Vitest tests simulate restart while their storage mock preserves writes perfectly.

   **Counterexample:** Ordinary settled-state recovery works, but termination after the set commits and before draft cleanup duplicates that lift.

   **Exact test to add:** Use a persistent profile and deterministic gates immediately before commit and immediately after commit/before cleanup. SIGKILL at each gate, relaunch offline, and assert one saved 19-rep set plus pending 7- and 8-rep rows exactly once. Repeat with accepted Undo interrupted before restoration commits. This is a coverage gap, not proof those fixed defects have returned.

8. **MAJOR — STILL OPEN: “Swipe” coverage does not exercise native touch panning.**  
   [monkey.ts:181](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:181), [loads.spec.ts:57](/Users/rabah/projects/anygym/tests/loads.spec.ts:57)

   Monkey swipes send mouse events; picker tests directly assign `scrollLeft`. Both can pass when a sheet’s touch restrictions prevent a real thumb from moving the wheel.

   **Exact fix/test:** Add native touch gestures under Chromium and iOS simulator/device automation. Drag the wheel inside Weight and Edit sheets; assert scroll position changes, the selected weight changes, and Done/Save persists that exact weight. Include nested-sheet scrolling and edge-back gestures. Synthetic DOM scroll events cannot establish this behavior.

9. **MINOR — STILL OPEN: Record detection misses equivalent loads across units.**  
   [records.ts:57](/Users/rabah/projects/anygym/src/lib/records.ts:57)

   Reproduced: ten unweighted push-ups recorded in lb followed by twelve in kg earns no rep record because `sameLoad()` requires matching units. Separately, line 41 excludes today’s later sets in another unit: 135 lb followed by 100 kg can miss a genuine heaviest record against previous 185 lb history.

   **Exact fix:** Compare compatible resistance after conversion with a defined tolerance; treat unweighted bodyweight as unit-independent. Include all compatible sets from today.

   **Tests to add:** Assert both examples, including reversed set order. Existing cross-unit tests vary historical units but keep today’s sets in one unit.

10. **MINOR — TEST BLIND SPOT: The screen matrix does not enforce accessible names or minimum target sizes.**  
    [layout.ts:119](/Users/rabah/projects/anygym/tests/helpers/layout.ts:119)

    The checker verifies clipping, safe bounds and coverage, but a fully visible **24×24 unnamed icon button** passes. Individual component checks do not establish SPEC 13.3 across every completed screen.

    **Exact fix/test:** Add a control audit requiring a nonempty computed accessible name and a reachable hit area of at least 48×48. Run it across completed screens and nested sheets on every device. Add deliberately unnamed and undersized harness controls and require rejection. This is a confirmed coverage gap; no additional current accessibility violation is asserted.