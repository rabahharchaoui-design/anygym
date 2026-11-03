**7 findings: 6 MAJOR, 1 MINOR.** Reviewed completed `[x]` work and earlier reports against the current source. Fixed findings excluded. No files edited.

1. **MAJOR — STILL OPEN: Finish interrupts group Undo and permanently loses sets.**  
   [deleteUndo.ts:179](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:179), [WorkoutScreen.tsx:474](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:474)

   Group acceptance is absent from the manager’s tracked writes. Finish can close the manager before restoration begins, then delete the remaining tombstones. **Reproduced with the production manager: Undo three sets, immediately Finish → one saved set and no remaining recovery records.**

   **Exact fix:** Register the whole group synchronously when Undo is tapped, before awaiting exercise restoration or acceptance. Track acceptance and restoration as one operation. Finish must await it; closing must allow an already accepted group to complete.

2. **MAJOR — STILL OPEN: Duplicate Log discards values it never saved.**  
   [rowLog.ts:209](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:209), [setTable.ts:150](/Users/rabah/projects/anygym/src/lib/setTable.ts:150)

   Independent tabs can produce equal revisions containing different values. **Reproduced: 17 reps committed at revision 2; submitting 19 at revision 2 returned success, fired the landed callback, and erased pending 19.** A failed receipt read also defaults to the requested revision and clears unsaved input.

   **Exact fix:** Give each edit a globally unique identity and persist that identity plus a value fingerprint in its submission receipt. Reconcile against the committed identity, preserving conflicting input under its deterministic successor ID. Missing or failed receipt reads must leave reconciliation unresolved.

3. **MAJOR — STILL OPEN: Logging overwrites another tab’s durable pending weight.**  
   [drafts.ts:185](/Users/rabah/projects/anygym/src/lib/drafts.ts:185)

   `draftsDurableMerge()` allows clean cached rows to replace authoritative IndexedDB rows at equal revisions. **Reproduced with localStorage refusing writes: IndexedDB held 73 lb; the stale tab’s merge replaced it with 63 lb.** Restart then restores the wrong input.

   **Exact fix:** Merge only dirty rows and explicit deletions into IndexedDB. Clean rows must adopt committed values. Allocate revisions transactionally across tabs and acknowledge dirty changes only after persistence commits.

4. **MAJOR — STILL OPEN: Backup can omit a set committed during export.**  
   [backup.ts:40](/Users/rabah/projects/anygym/src/db/backup.ts:40), [backup.ts:52](/Users/rabah/projects/anygym/src/db/backup.ts:52)

   Tables are captured before drafts and fallback state. A concurrent Log can commit and clear its draft between those reads. **Reproduced: the source contained the saved set, while the exported sets, journal and drafts contained no copy.** Restoring that backup loses the lift.

   **Exact fix:** Flush pending draft persistence, then snapshot tables, receipts, Undo intents and durable live state in one IndexedDB read transaction. Coordinate memory/fallback capture with workout write admission and build the export exclusively from that snapshot.

5. **MAJOR — NEW: A discarded correction returns after Finish→Undo.**  
   [mutations.ts:424](/Users/rabah/projects/anygym/src/db/mutations.ts:424)

   Discarding a held correction removes storage copies but writes no discard receipt for its identity. Another tab retains its memory copy. **Reproduced: A chose Finish without the failed 19-rep correction and finished with 10; after reopening, B still offered that correction, and Retry changed the saved set to 19.**

   **Exact fix:** Under the session lock, transactionally record discard receipts for every explicitly discarded held ID and its covered predecessors before removing copies. Filter all tabs’ memory/fallback entries against those receipts. Retain receipts across Finish and reopening.

6. **MAJOR — STILL OPEN, timing-dependent: Swipe removal deletes a different pending row.**  
   [SwipeRow.tsx:171](/Users/rabah/projects/anygym/src/screens/workout/SwipeRow.tsx:171), [ExerciseView.tsx:423](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:423)

   The animation delays removal, then passes an old row index to the latest handler. With pending A, B and C, start removing B and log C before the callback runs: the changed logged count makes B’s old index identify A. **Helper interleaving reproduced: A disappeared; B remained. Full browser gesture timing remains unverified.**

   **Exact fix:** Materialize and capture the draft ID before starting the animation. Resolve that identity’s current slot when removing it; abort if it committed or disappeared.

7. **MINOR — STILL OPEN: Another tab loses added rows or resurrects removed rows.**  
   [extraSets.ts:48](/Users/rabah/projects/anygym/src/lib/extraSets.ts:48), [extraSets.ts:84](/Users/rabah/projects/anygym/src/lib/extraSets.ts:84)

   Tabs permanently cache and rewrite the complete adjustment collection. **Reproduced: A displayed two added squat rows; B added a bench row and persisted only one squat addition.** Removal markers have the same overwrite path.

   **Exact fix:** Persist adjustments transactionally by session/exercise and removal markers by deletion identity. Refresh caches and mirrors from committed state.

Typecheck passed. Control probes passed for transactional rollback, failed-Log retry, commit-before-cleanup reconciliation, failed Edit/Undo recovery, Finish→Undo snapshots, and update deferral during active or unreadable activity. Physical iOS termination and live service-worker timing were not tested.