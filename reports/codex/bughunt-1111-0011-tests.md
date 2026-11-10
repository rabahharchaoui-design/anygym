**12 findings: five confirmed saving defects and seven test blind spots, all STILL OPEN.** Completed `[x]` scope only; fixed earlier findings excluded. No files edited.

Typecheck passed. Production-function probes with in-memory IndexedDB reproduced findings 1–5. Vitest stopped before collection because the read-only sandbox blocked its temporary directory. Playwright and physical iPhone behavior were not executed; test counterexamples below describe coverage risks, not confirmed device failures.

1. **MAJOR — STILL OPEN: Failed Retry deletes the last durable correction.**  
   [mutations.ts:402](/Users/rabah/projects/anygym/src/db/mutations.ts:402)

   A correction survives in IndexedDB, but Retry unconditionally forgets its predecessor when replacement registration fails—even if replacement fallback persistence also failed. **Reproduced:** after reopening, the intended **73 lb × 19** correction vanished; **53 lb × 10** remained saved.

   **Exact fix:** Retain the predecessor until a replacement journal or recovery record commits durably, or the user explicitly discards it.

   **Test to add:** Persist a failed correction; reject both Retry’s journal write and replacement fallback write; reopen with fresh runtime state. Assert the exact correction remains retryable and blocks Finish.

2. **MAJOR — STILL OPEN: Finish overlooks a submitted lift stored only in the durable draft mirror.**  
   [workouts.ts:530](/Users/rabah/projects/anygym/src/db/workouts.ts:530), [WorkoutScreen.tsx:666](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:666)

   Another tab’s failed journal write can leave its submission solely in `kv`. Finish checks journals and held corrections, succeeds, then clears drafts. **Reproduced:** durable submitted **73 lb × 19** was overlooked; Finish saved only the earlier set.

   **Exact fix:** Serialize Log admission with Finish under the session lock. Inside Finish’s transaction, reconcile durable submitted drafts against submission/cancellation receipts, refuse unresolved submissions, and snapshot the reconciled state for Undo.

   **Test:** The case at [codex-cross-tab-submission-evidence.test.ts:85](/Users/rabah/projects/anygym/src/db/__tests__/codex-cross-tab-submission-evidence.test.ts:85) already specifies the failure but uses `it.fails`. Make it a normal acceptance test after fixing; extend through offline restart → Retry → exactly one saved lift.

3. **MAJOR — STILL OPEN: Reconciliation erases conflicting input with a lower revision.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)

   Fingerprints protect differing payloads only when revisions match, although tabs allocate revisions independently. **Reproduced:** pending **73 lb × 19, revision 1** disappeared against saved **53 lb × 10, revision 5**.

   **Exact fix:** Require matching payload evidence before consuming a draft, regardless of revision ordering. Preserve conflicting input under a recoverable identity; coordinate revisions transactionally.

   **Test:** Promote the existing `it.fails.each` cases at [codex-cross-tab-submission-evidence.test.ts:47](/Users/rabah/projects/anygym/src/db/__tests__/codex-cross-tab-submission-evidence.test.ts:47). Require both the committed lift and recoverable conflicting input after restart; retain the matching-payload deduplication control.

4. **MAJOR — STILL OPEN: “Finish without it” can discard values the user never reviewed.**  
   [ExerciseView.tsx:319](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:319), [rowLog.ts:363](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:363)

   Toast Retry reuses its operation ID; discard compares identifiers without comparing payloads. **Reproduced:** a snapshot representing **53 lb × 17** deleted a journal containing **73 lb × 19** under identical identifiers.

   **Exact fix:** Generate a fresh operation ID on every toast Retry. Include the payload fingerprint in `ShownRow`; transactionally require the exact displayed identity, revision, operation and fingerprint before cancellation.

   **Blind spot/test:** [codex-3.2c.test.ts:51](/Users/rabah/projects/anygym/src/db/__tests__/codex-3.2c.test.ts:51) manually supplies different operation IDs, bypassing this UI failure. Add identical-ID/revision/operation but different-payload interleaving; the unseen submission must survive and continue blocking Finish.

5. **MAJOR — STILL OPEN: Backup omits a durably retained correction.**  
   [backup.ts:79](/Users/rabah/projects/anygym/src/db/backup.ts:79), [backup.ts:101](/Users/rabah/projects/anygym/src/db/backup.ts:101)

   Held corrections are captured before the table snapshot. A correction retained during that gap enters neither exported sets nor pending changes. **Reproduced:** backup contained the original 10-rep set and a later committed set, while omitting the source’s durable 19-rep correction.

   **Exact fix:** Read durable held corrections inside the snapshot transaction alongside sets, journals and suppression receipts. Coordinate memory/fallback capture with mutation registration under the session lock.

   **Test to add:** Extend [codex-3.2b.test.ts:217](/Users/rabah/projects/anygym/src/db/__tests__/codex-3.2b.test.ts:217): pause export before its table snapshot, retain a new failed correction, commit another set, resume export, then restore into a fresh context. Require the correction’s exact values to remain retryable.

6. **MAJOR — STILL OPEN: SPEC 13.3 has no hard-kill test at in-flight persistence boundaries.**  
   [kill.spec.ts:85](/Users/rabah/projects/anygym/tests/kill.spec.ts:85)

   Current termination tests wait for visible state and database snapshots to settle. Unit “relaunch” tests reopen an in-memory database after awaited operations.

   **Counterexample:** settled drafts restore correctly, but termination between receipt commit and reconciliation loses another pending row or permits duplication. A current browser failure here is **unconfirmed**.

   **Exact fix/test:** Add deterministic gates after journal commit, during the set transaction, and after receipt commit/before reconciliation. SIGKILL at each gate, reopen offline, Retry, and assert literal pending payloads plus exactly one committed submission. Include Undo acceptance/restoration boundaries.

7. **MAJOR — STILL OPEN: Default acceptance omits four required devices for most functional tests.**  
   [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47)

   Android projects and the 320-wide floor select only `@matrix` tests by default. Kill and monkey tests therefore do not satisfy SPEC 13.3–13.4 across the required matrix.

   **Counterexample:** a Chromium-only recovery failure cannot fail the normal suite because its recovery test is never selected. This is a coverage defect, not an established Android bug.

   **Exact fix/test:** Make full-matrix execution the acceptance default; expose checkpoint subsets separately. Add a discovery assertion comparing applicable test IDs across all seven projects, explicitly requiring kill and monkey cases. Audit internal browser/device skips too.

8. **MAJOR — STILL OPEN: The console-error fixture suppresses real application CSP failures.**  
   [fixtures.ts:184](/Users/rabah/projects/anygym/tests/fixtures.ts:184)

   `quietHarnessStyleNoise()` filters matching stylesheet errors before any console listener receives them, even outside screenshots.

   **Counterexample:** an interaction inserts a forbidden stylesheet; the user sees broken styling, but SPEC 13.3’s zero-console-error gate passes. No current component failure is claimed.

   **Exact fix/test:** Replace global message filtering with narrowly attributed screenshot exemptions and document-wide `securitypolicyviolation` collection. Add a harness test that inserts a forbidden `<style>` without taking a screenshot and must fail teardown; retain a screenshot-only noise control.

9. **MAJOR — STILL OPEN: “Swipe” tests simulate away native touch behavior.**  
   [loads.spec.ts:58](/Users/rabah/projects/anygym/tests/loads.spec.ts:58), [polish-2.2d.spec.ts:44](/Users/rabah/projects/anygym/tests/polish-2.2d.spec.ts:44)

   Wheel coverage assigns `scrollLeft`; row swipes use mouse dragging.

   **Counterexample:** incorrect `touch-action` prevents a finger from scrolling a wheel inside a sheet, while both tests pass. Physical-device failure is **unconfirmed**.

   **Exact fix/test:** Add native touch drags through Chromium touch injection and an iOS simulator/device driver. Swipe wheels inside Weight/Edit sheets, immediately confirm Done/Save, and assert saved weight equals the displayed selection. Verify horizontal row deletion and vertical scrolling without deletion.

10. **MINOR — STILL OPEN: Backup completeness repeats production’s whitelist.**  
    [backup.test.ts:73](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:73), [backup.test.ts:97](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:97)

    Both the snapshot and expected table names derive from `TABLE_NAMES`.

    **Counterexample:** removing a required category from production also removes it from these expectations, allowing an incomplete backup to pass.

    **Exact fix/test:** Define an independent literal backup contract. Seed distinct sentinels in each required category, including drafts, rest, extra rows and pending changes; restore into a fresh context and assert each destination sentinel directly. Omitting any required category must fail.

11. **MINOR — STILL OPEN: Muscle-list expectations call the production filter.**  
    [muscles-2.2c.spec.ts:13](/Users/rabah/projects/anygym/tests/muscles-2.2c.spec.ts:13)

    Expected membership and the rendered list both depend on `exercisesForRegion()`.

    **Counterexample:** the helper accidentally omits a valid exercise; both actual and expected lists omit it. Existing individual examples provide only partial protection.

    **Exact fix/test:** Add independently audited literal exercise-ID sets for representative muscles, including shoulder overrides and secondary-only exclusions. Compare rendered membership against those literals without calling the production filter; removing an expected exercise must fail.

12. **MINOR — STILL OPEN: Newly mounted controls escape the active 130% text tests.**  
    [codex-se-lifecycle.spec.ts:40](/Users/rabah/projects/anygym/tests/codex-se-lifecycle.spec.ts:40), [codex-se-offline-dynamic-text.spec.ts:33](/Users/rabah/projects/anygym/tests/codex-se-offline-dynamic-text.spec.ts:33)

    The active interaction test enlarges existing elements once, then mounts reps/rest controls. The test that continuously scales new elements remains skipped.

    **Counterexample:** enlarged Done/rest labels overlap, but acceptance passes because those new labels render at normal size. Current overlap is **unconfirmed**.

    **Exact fix/test:** Enable continuous baseline-preserving scaling for newly mounted controls and unskip the regression. Assert each new label computes to 1.3× baseline, then check clipping, overlap, 48-point hit areas and current-set visibility before any automatic scrolling.