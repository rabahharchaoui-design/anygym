**6 findings: 5 MAJOR, 1 MINOR.** Reviewed completed `[x]` features and earlier reports against the current source. Fixed findings excluded. No files edited.

1. **MAJOR — STILL OPEN: Finish interrupts group Undo and permanently loses sets.**  
   [deleteUndo.ts:179](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:179), [WorkoutScreen.tsx:474](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:474)

   Group Undo’s acceptance phase is untracked, so Finish can proceed while restoration is starting. **Reproduced: Undo three deleted sets, immediately Finish → only one saved; remaining recovery records deleted.** Violates §§0 and 13.3.

   **Exact fix:** Register the entire group operation synchronously when Undo is tapped, before awaiting exercise restoration or acceptance. Finish must drain that accepted operation completely. Closing must reject new operations while allowing accepted groups to finish.

2. **MAJOR — STILL OPEN: Duplicate Log clears input it never saved.**  
   [rowLog.ts:209](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:209), [setTable.ts:150](/Users/rabah/projects/anygym/src/lib/setTable.ts:150)

   Separate tabs can produce identical revisions with different values. **Reproduced: saved 17 reps at revision 2; submit 19 at revision 2 → success callback, saved value remains 17, pending 19 disappears.** Receipt-read failures also fall back to the requested revision. Violates §§0, 13.3 and 20.2.

   **Exact fix:** Persist a globally unique edit identity and value fingerprint in submission receipts. Reconcile against that committed identity; preserve conflicting input under a successor draft ID. Missing or failed receipt reads must leave reconciliation unresolved.

3. **MAJOR — STILL OPEN: Logging can overwrite another tab’s durable pending weight.**  
   [drafts.ts:185](/Users/rabah/projects/anygym/src/lib/drafts.ts:185)

   `draftsDurableMerge()` lets clean cached rows overwrite authoritative IndexedDB rows at equal revisions. **Reproduced with blocked localStorage: IndexedDB held 73 lb; the stale tab’s Log merge replaced it with 63 lb.** Restart restores the wrong weight. Violates §§0 and 13.3.

   **Exact fix:** Merge only dirty rows and explicit deletions into IndexedDB. Clean cached rows must adopt committed values. Allocate revisions transactionally and acknowledge dirty rows only after persistence succeeds.

4. **MAJOR — NEW: A backup can omit a set committed during export.**  
   [backup.ts:40](/Users/rabah/projects/anygym/src/db/backup.ts:40), [backup.ts:52](/Users/rabah/projects/anygym/src/db/backup.ts:52)

   Database tables are captured before drafts and fallback state. A concurrent Log can commit and clear its draft between those reads. **Reproduced: source contained the saved set; exported sets, journal and drafts contained no copy.** Restoring that backup loses the lift.

   **Exact fix:** Flush pending draft persistence, then snapshot tables, receipts, journals and durable live state in one IndexedDB read transaction. Coordinate fallback capture with the workout lock and build the export exclusively from that snapshot.

5. **MAJOR — NEW, timing-dependent: Swipe removal can delete another pending row.**  
   [SwipeRow.tsx:171](/Users/rabah/projects/anygym/src/screens/workout/SwipeRow.tsx:171), [ExerciseView.tsx:423](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:423)

   Removal waits 180 ms, then uses the captured row index against the latest logged count. Start removing B, then log later row C before the animation completes: B’s old index now identifies A. **Helper interleaving reproduced: A’s draft disappeared; B remained.** Full browser gesture timing remains unverified. Violates §§13.3 and 20.2.

   **Exact fix:** Materialize a stable draft ID when removal starts. Pass that ID through the animation, resolve its current slot when applying removal, and abort if it already committed or disappeared.

6. **MINOR — STILL OPEN: Another tab loses added rows or resurrects removed rows.**  
   [extraSets.ts:48](/Users/rabah/projects/anygym/src/lib/extraSets.ts:48), [extraSets.ts:84](/Users/rabah/projects/anygym/src/lib/extraSets.ts:84)

   Each tab caches and rewrites the complete adjustment collection. **Reproduced: two extra squat rows became one after another tab added a bench row.** Removal markers have the same overwrite path.

   **Exact fix:** Persist adjustments transactionally by session/exercise and removal markers by set identity. Refresh tab caches and storage mirrors from committed state.

Typecheck passed, plus **1,320 weight-sum cases and 15 solver round trips**. Reproductions used in-memory IndexedDB; physical iPhone layout, VoiceOver and native touch behavior were not verified.