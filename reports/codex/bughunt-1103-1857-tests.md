**12 findings: 10 MAJOR, 2 MINOR.** Reviewed completed `[x]` features against SPEC.md and earlier reports. All findings below are **STILL OPEN**. No files edited. Typecheck and 34 targeted Vitest tests passed. Playwright was reviewed statically; browser gesture timing remains unverified.

1. **MAJOR — STILL OPEN: Finish interrupts group Undo and permanently loses sets.**  
   [deleteUndo.ts:179](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:179), [WorkoutScreen.tsx:474](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:474)

   Group acceptance is absent from tracked operations. Finish can close the manager before restoration completes. **Reproduced with the production manager:** undo three deleted sets, immediately close and Finish → only one restored; the other recovery records disappear.

   **Exact fix:** Track the entire operation synchronously when Undo is tapped, including exercise restoration, acceptance and every set restoration. Finish must drain it. Closing must permit already accepted operations to complete.

   **Test to add:** The [existing group tests:283](/Users/rabah/projects/anygym/src/db/__tests__/codex-2.0k.test.ts:283) use immediately successful acceptance mocks and await Undo before Finish. Add three deleted sets plus one remaining set; start `undoAll()` without awaiting it, immediately close and Finish. Require all four original records, orders and values.

2. **MAJOR — STILL OPEN: Duplicate Log acknowledges input it never saved.**  
   [rowLog.ts:209](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:209), [setTable.ts:150](/Users/rabah/projects/anygym/src/lib/setTable.ts:150)

   Separate tabs can assign equal revisions to different values. **Reproduced:** 17 reps committed at revision 2; submitting 19 at revision 2 returns success, fires the landed callback and clears pending 19. Receipt-read failures also default to the requested revision.

   **Exact fix:** Persist a globally unique edit identity and payload fingerprint in submission receipts. Reconcile against the committed identity, preserving conflicting input under a successor draft ID. Missing or unreadable receipts must leave reconciliation unresolved.

   **Test to add:** Extend [codex-2.0k.test.ts:266](/Users/rabah/projects/anygym/src/db/__tests__/codex-2.0k.test.ts:266) with the same ID/revision containing 17 versus 19 reps. Assert saved 17, pending 19 and zero landed callbacks. Repeat with different revisions while rejecting the receipt read.

3. **MAJOR — STILL OPEN: Logging overwrites another tab’s durable pending weight.**  
   [drafts.ts:187](/Users/rabah/projects/anygym/src/lib/drafts.ts:187)

   A clean cached row wins over authoritative IndexedDB data at equal revisions. **Reproduced:** durable 73 lb became stale 63 lb after `draftsDurableMerge()`.

   **Exact fix:** Merge only dirty rows and explicit deletions. Clean rows must adopt committed values. Allocate revisions transactionally across tabs and acknowledge dirty changes only after successful persistence.

   **Test to add:** [drafts-2.2e.test.ts:97](/Users/rabah/projects/anygym/src/lib/__tests__/drafts-2.2e.test.ts:97) protects only a strictly newer stored revision. Add two hydrated contexts with conflicting revision-2 weights and blocked localStorage. Submit an unrelated exercise through `submitRow`; restart and require 73 lb plus the unrelated saved set.

4. **MAJOR — STILL OPEN: Backup can omit a lift committed during export.**  
   [backup.ts:40](/Users/rabah/projects/anygym/src/db/backup.ts:40), [backup.ts:52](/Users/rabah/projects/anygym/src/db/backup.ts:52)

   Tables are captured before live drafts and fallback state. A concurrent Log can commit and clear its draft between those reads. **Reproduced:** the source contained two sets; the backup contained one, with no draft or journal copy of the missing lift.

   **Exact fix:** Flush draft persistence, coordinate snapshot capture with workout write admission, and read tables, receipts, journals, Undo intents and durable live state in one IndexedDB read transaction. Capture fallback state within the same coordinated boundary.

   **Test to add:** Extend [backup.test.ts:87](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:87). Gate export after table capture, commit a pending `53 lb × 12` Log and complete reconciliation, then resume export. Restore and retry recovery; require that lift exactly once.

5. **MAJOR — STILL OPEN: An explicitly discarded correction returns after Finish → Undo.**  
   [mutations.ts:424](/Users/rabah/projects/anygym/src/db/mutations.ts:424)

   Discarding a held correction removes stored copies without recording a receipt for its identity. Another tab retains its memory copy. **Reproduced:** discard failed 19-rep correction, Finish with 10, reopen → another tab offers the correction; Retry saves 19.

   **Exact fix:** Under the session lock, transactionally record discard receipts for every discarded held ID and covered predecessor before deleting copies. Filter every context’s memory/fallback entries against those receipts. Retain receipts across Finish and reopening.

   **Test to add:** Hold a correction in tab B by rejecting its journal write. Discard its shown ID in A, Finish and reopen, then retry in B. Require no pending correction and the original 10 reps unchanged.

6. **MAJOR — STILL OPEN: Retry saves a different weight and bar from the displayed row.**  
   [ExerciseView.tsx:184](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:184), [ExerciseView.tsx:297](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:297)

   Failed rows rebuild their display using today’s equipment, while Retry submits the stored draft. **Production-helper reproduction:** the row displayed 125 lb on the women’s bar; Retry saved 135 lb on the Olympic bar.

   **Exact fix:** Give failed rows one canonical payload for display and Retry. Preserve the submitted equipment snapshot until resolved. An explicitly confirmed correction must replace both draft and journal with a new revision.

   **Test to add:** [rowLog.test.ts:67](/Users/rabah/projects/anygym/src/screens/workout/__tests__/rowLog.test.ts:67) substitutes `rebuild: picked => picked`, hiding equipment changes. Use real `currentLoad`: fail a 135 lb Olympic-bar Log, change bar choice, dismiss without Done, then Retry. Require displayed and saved total/bar identity to agree.

7. **MAJOR — STILL OPEN, timing-dependent: Swipe removal deletes another pending row.**  
   [SwipeRow.tsx:171](/Users/rabah/projects/anygym/src/screens/workout/SwipeRow.tsx:171), [ExerciseView.tsx:427](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:427)

   The delayed animation callback passes an old row index to the latest handler. Start removing B, then log later row C before the callback: the changed logged count makes that index identify A. **Helper interleaving reproduced:** A disappeared; B remained. Full browser timing is unverified.

   **Exact fix:** Materialize and capture the draft ID before animation starts. Resolve that identity’s current slot when applying removal; abort if it committed or disappeared.

   **Test to add:** Create distinct A/B/C drafts, start B’s removal, commit C during the slide delay, then complete removal. Assert saved C, pending A, removed B; Undo must restore B exactly.

8. **MAJOR — STILL OPEN, SPEC §13.3 blind spot: Hard-kill tests avoid in-flight writes.**  
   [kill.spec.ts:85](/Users/rabah/projects/anygym/tests/kill.spec.ts:85)

   Tests kill after visible state and database snapshots settle. They do not terminate during journaling, commit or reconciliation.

   **Counterexample:** settled drafts recover correctly, while termination after set commit but before cleanup duplicates or loses a row. This additional browser defect is **not established**.

   **Exact fix/test:** Add deterministic gates after journal persistence, immediately before set commit and after receipt commit before reconciliation. SIGKILL at each gate, reopen offline, and assert literal saved values, unchanged other drafts and exactly one committed set. Include group Undo acceptance/restoration boundaries.

9. **MAJOR — STILL OPEN, SPEC §§13.3–13.4 blind spot: Default acceptance runs omit four devices.**  
   [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47)

   Android projects and the 320-wide floor run only `@matrix` cases. Kill and monkey cases therefore do not run on them by default.

   **Counterexample:** an Android-only recovery failure cannot fail the default suite because its recovery test is excluded. No specific Android defect is claimed.

   **Exact fix/test:** Make full-matrix execution the acceptance default and give checkpoint subsets a separate command. Add a discovery assertion comparing acceptance-test IDs across all seven projects, explicitly requiring kill and monkey cases.

10. **MAJOR — STILL OPEN, mocked interaction: “Swipe” tests bypass native touch handling.**  
    [loads.spec.ts:58](/Users/rabah/projects/anygym/tests/loads.spec.ts:58), [polish-2.2d.spec.ts:44](/Users/rabah/projects/anygym/tests/polish-2.2d.spec.ts:44), [monkey.ts:181](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:181)

    Wheel tests assign `scrollLeft`; row and monkey swipes use mouse dragging.

    **Counterexample:** `touch-action` blocks finger scrolling or triggers `pointercancel`, while these tests pass. A current physical-device failure is **not established**.

    **Exact fix/test:** Add native touch drags through Chromium touch injection and an iOS simulator/device driver. Drag the wheel in Weight/Edit sheets and verify selection survives Done/Save. Require horizontal row drags to reveal Delete and vertical drags to scroll without deleting.

11. **MINOR — STILL OPEN: Another tab loses added rows or resurrects removed rows.**  
    [extraSets.ts:48](/Users/rabah/projects/anygym/src/lib/extraSets.ts:48), [extraSets.ts:84](/Users/rabah/projects/anygym/src/lib/extraSets.ts:84)

    Each context caches and rewrites the complete adjustment collection. **Reproduced:** A displayed two added squat rows; B added a bench row and persisted only one squat addition. Removal markers share this overwrite path.

    **Exact fix:** Persist adjustments transactionally by session/exercise and removal markers by deletion identity. Refresh caches from committed state.

    **Test to add:** Use two isolated module instances sharing storage. Interleave two squat additions with a stale bench addition, then independent removal markers. Reload and require every adjustment to survive.

12. **MINOR — STILL OPEN, implementation-repeating assertion: Muscle-list completeness uses its production filter as the oracle.**  
    [muscles-2.2c.spec.ts:13](/Users/rabah/projects/anygym/tests/muscles-2.2c.spec.ts:13)

    The rendered list and expected membership both use `exercisesForRegion()`.

    **Counterexample:** the helper accidentally omits a valid quad exercise; both sides omit it and the comparison passes. Existing sample assertions offer partial protection, but do not establish completeness.

    **Exact fix/test:** Specify independently audited literal membership for representative muscles, including shoulder overrides and secondary-only exclusions. Compare rendered IDs against those literals without importing the production filter. Require the test to fail when an expected exercise is deliberately omitted.