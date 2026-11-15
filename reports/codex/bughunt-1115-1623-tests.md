**12 findings: 7 application bugs and 5 test blind spots. All remain STILL OPEN from earlier reports.** Fixed findings are excluded. No files edited.

Validation: TypeScript passed; focused Vitest runs produced **51 passes and 5 expected failures** reproducing known defects. Additional in-memory probes confirmed findings 4–7. Playwright tests were inspected, not run; device counterexamples below are coverage risks, not confirmed phone failures.

1. **MAJOR — STILL OPEN: Finish can silently omit another tab’s submitted set.**  
   [workoutFinish.ts:83](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:83)  
   A failed journal write leaves **73 lb × 19** only in the durable draft mirror. Another tab’s Finish checks journals and held corrections, overlooks that submission, succeeds, then clears drafts.

   **Exact fix:** Serialize Log admission with Finish under the session lock. Inside Finish’s transaction, reconcile durable submitted drafts against commit/cancellation receipts, reject unresolved submissions, and build the Undo snapshot from that state.  
   **Test:** Convert [the existing expected failure](/Users/rabah/projects/anygym/src/db/__tests__/codex-cross-tab-submission-evidence.test.ts:85) into an ordinary test after fixing it. Extend through restart → Retry twice; require exactly one saved **73 lb × 19** set.

2. **MAJOR — STILL OPEN: Recovery erases conflicting input with a lower revision.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Fingerprints protect different payloads only at equal revisions, although tabs allocate revisions independently. Pending **73 lb, revision 1** disappears against saved **53 lb, revision 5**.

   **Exact fix:** Require matching payload evidence or explicit causal supersession before consuming a draft, regardless of revision ordering. Preserve conflicting payloads under recoverable identities.  
   **Test:** Promote [the three `it.fails.each` cases](/Users/rabah/projects/anygym/src/db/__tests__/codex-cross-tab-submission-evidence.test.ts:47). Require both payloads to survive restart and the conflicting payload to save once; retain the matching-payload deduplication control.

3. **MAJOR — STILL OPEN: Backup can omit a durable correction.**  
   [backup.ts:79](/Users/rabah/projects/anygym/src/db/backup.ts:79)  
   Held corrections are captured before the table snapshot. A correction retained between those reads is omitted even when a later committed set enters the backup. Restore loses that correction.

   **Exact fix:** Read durable held corrections inside the snapshot transaction alongside sets, journals and suppression receipts. Coordinate memory/fallback capture with mutation registration.  
   **Test:** Promote [the “at snapshot” expected failure](/Users/rabah/projects/anygym/src/db/__tests__/codex-backup-arriving-correction.test.ts:28). Its existing restore → restart → Retry twice assertions should pass normally.

4. **MAJOR — STILL OPEN: Logging resurrects a draft removed in another tab.**  
   [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)  
   With localStorage unavailable, a clean cached draft is reinserted whenever IndexedDB lacks its slot. Reproduced: tab A removed **73 lb × 19**; tab B’s Log merge restored it.

   **Exact fix:** Apply only dirty updates and explicit deletions. Clean cached rows must adopt committed absence. Refresh memory from the committed merge without overwriting subsequent edits.  
   **Test:** Extend `drafts-removed-3.6w.test.ts` with two isolated module contexts sharing IndexedDB. Hydrate both, remove in A, log another row in B, restart; require the removed identity to remain absent.

5. **MAJOR — STILL OPEN: One-horn machines still double the entered plates.**  
   [PlateMachineInput.tsx:46](/Users/rabah/projects/anygym/src/components/load/PlateMachineInput.tsx:46), [exerciseLoad.ts:142](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:142)  
   Math helpers support one horn, but the workout picker and reconstruction omit the count. Reproduced: one physical **45 lb** plate records **90 lb** with “Plates only.”

   **Exact fix:** Resolve and persist the machine’s horn count per gym, asking when unknown. Pass it through picking, diagrams, reconstruction, targets, editing and import; snapshot it on new loads and preserve historical totals.  
   **Test:** Add a real workout-picker journey: answer one horn, add 45 lb, Log, reload and edit. Require **45 lb**, `horns: 1`, and agreement between drawing, readout and saved load. Current helper tests manually supply the missing argument.

6. **MAJOR — STILL OPEN: “Not now” removes stack add-ons while promising the same weight.**  
   [levelUp.ts:102](/Users/rabah/projects/anygym/src/lib/coach/levelUp.ts:102)  
   `holdChanges()` copies the original pin without its add-on. Reproduced through target construction: **100 + 50 lb becomes 100 lb**; **50 + 25 kg becomes 50 kg**, labelled “Same as last time.”

   **Exact fix:** Snapshot the original pin and add-on in the proposed change. Copy both into the hold’s `to`/`toAdded`, preserving them through `targetOf()` and load reconstruction.  
   **Test:** Generate a weekly stack decision with an add-on, choose Not now, persist/reload the target and log it. Assert unchanged pin, add-on and total in lb and kg.

7. **MAJOR — STILL OPEN: An older tab silently treats a generated plan as Quick workout.**  
   [useWorkout.ts:163](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:163), [workoutFinish.ts:30](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:30)  
   Plan lookup uses a tab-local registry. A plan created elsewhere can exist in IndexedDB while lookup returns undefined. Workout entries then use Quick defaults; Finish cannot calculate plan advancement. The registry/progress discrepancy reproduced in isolated contexts; browser timing remains untested.

   **Exact fix:** Resolve saved definitions reactively by `planId`. Block workout readiness while a nonempty plan ID is unresolved. Include `db.plans` in Finish’s transaction and resolve the definition there.  
   **Test:** Open A before B creates a generated plan and session. Resume that session in A without reloading; assert its original prescriptions and correct advancement after sufficient sets.

8. **MAJOR — STILL OPEN, SPEC 13.3 gap: Hard-kill tests avoid interrupted writes.**  
   [kill.spec.ts:85](/Users/rabah/projects/anygym/tests/kill.spec.ts:85)  
   Tests kill after settled UI/database snapshots. They never deterministically terminate at persistence boundaries.

   **Counterexample:** Termination after receipt commit but before draft cleanup could duplicate a set while these tests pass.  
   **Exact test/fix:** Add deterministic gates after journal commit, during the set/receipt transaction, and after commit before reconciliation. SIGKILL at each gate, relaunch offline, Retry twice, and assert the exact payload survives with one committed submission.

9. **MAJOR — STILL OPEN, suppressed failure: The fixture hides application CSP errors.**  
   [fixtures.ts:184](/Users/rabah/projects/anygym/tests/fixtures.ts:184)  
   `quietHarnessStyleNoise()` filters matching stylesheet violations from every console listener, regardless of whether a screenshot caused them.

   **Counterexample:** Opening a sheet inserts forbidden CSS; its styling fails while the zero-error gate passes.  
   **Exact test/fix:** Collect `securitypolicyviolation` events globally and exempt only violations positively attributable to screenshot operations. Add a harness test inserting forbidden `<style>` without taking a screenshot; require collection of that violation, plus a screenshot-noise control.

10. **MAJOR — STILL OPEN, simulated interaction: iPhone swipe coverage bypasses native gesture handling.**  
    [loads.spec.ts:58](/Users/rabah/projects/anygym/tests/loads.spec.ts:58), [touch.ts:64](/Users/rabah/projects/anygym/tests/helpers/touch.ts:64)  
    The wheel “swipe” assigns `scrollLeft`; WebKit’s helper dispatches untrusted TouchEvents. Chromium’s newer native injection does not close the iPhone gap.

    **Counterexample:** Incorrect `touch-action` blocks finger scrolling while programmatic scrolling and dispatched handlers pass.  
    **Exact test/fix:** Add an iOS simulator/device gesture test that drags the wheel inside Weight and Edit sheets, immediately confirms, logs and reloads. Assert saved weight equals the displayed selection. A vertical finger swipe must preserve every row.

11. **MAJOR — STILL OPEN, SPEC 13.3–13.5 gap: Newly mounted workout controls escape active 130% coverage.**  
    [text-130-1.7e.spec.ts:10](/Users/rabah/projects/anygym/tests/text-130-1.7e.spec.ts:10), [codex-se-offline-dynamic-text.spec.ts:33](/Users/rabah/projects/anygym/tests/codex-se-offline-dynamic-text.spec.ts:33)  
    The older audit scales the current DOM. The test maintaining enlargement across newly mounted reps/rest controls remains skipped.

    **Counterexample:** A newly opened reps editor clips Done at enlarged text while snapshot-based audits pass. This is a coverage risk; current clipping was not verified.  
    **Exact test/fix:** Enable the existing persistent-scaling test. Verify each new control’s computed font is genuinely enlarged, then check full visibility, hit testing and 48 pt targets **before tapping**, through reps editing, Log, rest and offline reload.

12. **MINOR — STILL OPEN, implementation-repeating assertion: Backup completeness shares production’s whitelist.**  
    [backup.test.ts:73](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:73), [backup.test.ts:97](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:97)  
    Expected table names and round-trip snapshots both derive from production `TABLE_NAMES`.

    **Counterexample:** Removing `exerciseSettings` from that list removes it from both actual and expected snapshots; these completeness assertions still pass.  
    **Exact test/fix:** Define an independent literal backup contract. Seed distinctive records in every required category, restore into a fresh database, and directly assert destination records and live state without using production `TABLE_NAMES` or `readTables()` to construct expectations.