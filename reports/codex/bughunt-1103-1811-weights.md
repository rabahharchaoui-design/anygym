**8 findings: 7 MAJOR, 1 MINOR.** Reviewed completed `[x]` features against SPEC.md and earlier reports. Fixed findings excluded. No files edited.

1. **MAJOR — STILL OPEN: Finish interrupts group Undo and permanently loses sets.**  
   [deleteUndo.ts:179](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:179), [WorkoutScreen.tsx:474](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:474)  
   Group Undo’s acceptance phase is untracked. Finish can close the manager and delete recovery records before restoration starts. **Reproduced: three deleted sets stayed lost; Finish saved only the remaining set, with zero tombstones.**  
   **Exact fix:** Register the entire group operation synchronously when Undo is tapped, before awaiting exercise restoration or acceptance. Finish must await that operation, and closing must allow already accepted groups to complete.

2. **MAJOR — STILL OPEN: Duplicate Log acknowledges and clears a weight it never saved.**  
   [rowLog.ts:209](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:209)  
   Two tabs can assign the same revision to different weights. **Reproduced: 135 lb already saved; submitting 155 lb at the same revision returned success, fired the landed callback, and erased the pending 155 lb.** Failed receipt reads also default to the requested revision.  
   **Exact fix:** Persist a globally unique edit identity and payload fingerprint in each submission receipt. Reconcile against that committed identity, preserving conflicting input under a successor ID. Missing or unreadable receipts must leave reconciliation unresolved.

3. **MAJOR — STILL OPEN: Logging overwrites another tab’s durable pending weight.**  
   [drafts.ts:187](/Users/rabah/projects/anygym/src/lib/drafts.ts:187)  
   `draftsDurableMerge()` lets clean cached rows replace authoritative IndexedDB rows at equal revisions. **Reproduced: a durable 73 lb draft became 63 lb after the stale context merged.** Restart then restores the wrong weight.  
   **Exact fix:** Merge only dirty rows and explicit deletions. Clean rows must adopt committed values. Allocate revisions transactionally across tabs and clear dirty markers only after persistence succeeds.

4. **MAJOR — NEW: Retry saves a different weight and bar from the pending row.**  
   [ExerciseView.tsx:297](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:297), [rowLog.ts:281](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:281)  
   After a failed 135 lb Olympic-bar Log, change the exercise’s bar to the women’s bar, then close the weight sheet without Done. The pending row rebuilds as **125 lb**, while Retry submits the original draft. **Production-helper reproduction saved 135 lb with `barId: 'olympic'` while the row showed 125 lb with `barId: 'womens'`.**  
   **Exact fix:** Make failed rows display and retry one canonical payload. Preserve the submitted equipment snapshot visibly until resolved; an explicit weight/equipment correction must replace both draft and journal with a new revision before Retry.

5. **MAJOR — STILL OPEN: Backup can omit a lift committed during export.**  
   [backup.ts:40](/Users/rabah/projects/anygym/src/db/backup.ts:40), [backup.ts:52](/Users/rabah/projects/anygym/src/db/backup.ts:52)  
   Tables are captured before live drafts. A concurrent Log can commit and clear its draft between those reads. **Reproduced: the source held two sets; the backup held one, with no draft or journal copy of the missing lift.**  
   **Exact fix:** Flush pending draft persistence, then capture tables, receipts, journals, Undo intents and durable live state in one IndexedDB read transaction. Coordinate fallback capture with write admission and build the export exclusively from that snapshot.

6. **MAJOR — STILL OPEN: An explicitly discarded correction returns after Finish → Undo.**  
   [mutations.ts:424](/Users/rabah/projects/anygym/src/db/mutations.ts:424)  
   Discard removes stored copies but leaves no receipt suppressing another tab’s memory copy. **Reproduced: a discarded 155 lb correction reappeared after reopening; Retry changed the saved 135 lb set to 155 lb.**  
   **Exact fix:** Under the session lock, transactionally record discard receipts for every discarded held ID and its covered predecessors. Filter every context’s memory/fallback entries against those receipts, retaining them across Finish and reopening.

7. **MAJOR — STILL OPEN, timing-dependent: Swipe removal deletes another pending row.**  
   [SwipeRow.tsx:171](/Users/rabah/projects/anygym/src/screens/workout/SwipeRow.tsx:171), [ExerciseView.tsx:427](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:427)  
   Removal uses an old row index after its animation. Start removing B, then log later row C before removal completes: the changed logged count makes that index identify A. **Helper interleaving reproduced: A disappeared; B remained. Full browser gesture timing remains unverified.**  
   **Exact fix:** Materialize and capture the draft ID before animation. Resolve that ID’s current slot when removing; abort if it committed or disappeared.

8. **MINOR — STILL OPEN: Another tab loses added rows or resurrects removed rows.**  
   [extraSets.ts:48](/Users/rabah/projects/anygym/src/lib/extraSets.ts:48), [extraSets.ts:84](/Users/rabah/projects/anygym/src/lib/extraSets.ts:84)  
   Tabs cache and rewrite the whole adjustment collection. **Reproduced: two added squat rows became one after another context added a bench row.**  
   **Exact fix:** Persist adjustments transactionally by session/exercise and removal markers by deletion identity; refresh caches from committed state.

Typecheck passed, alongside **2,712 lb/kg sum cases and 42 solver round trips**, covering bar weights, collars, sleeve capacity, machine starts, stack add-ons, each-hand versus total, and lifted totals. Persistence probes used in-memory IndexedDB; physical iPhone behavior was not tested.