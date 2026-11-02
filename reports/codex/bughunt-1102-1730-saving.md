**7 findings: 6 MAJOR, 1 MINOR.** Reviewed completed `[x]` features and earlier reports. Fixed earlier findings are excluded. No files edited.

1. **MAJOR — STILL OPEN: Removing an exercise can permanently lose sets despite tapping Undo.**  
   [WorkoutScreen.tsx:475](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:475), [deleteUndo.ts:115](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:115)

   Each set’s five-second expiry starts during sequential deletion; the group Undo toast appears afterward. Earlier records can expire before the user taps Undo. Missing records resolve without error, so restoration appears successful with sets missing. **Reproduced: Undo restored only one of two sets.** Failure rollback has the same gap.

   **Exact fix:** Delete the exercise and its sets as one durable undoable operation. Start one shared expiry when its toast appears. Accept Undo for every member before restoring any; retain the recovery records until the group is restored or explicitly finalized.

2. **MAJOR — NEW: “Finish without it” discards failed Logs the user was never shown.**  
   [WorkoutScreen.tsx:621](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:621), [rowLog.ts:283](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:283)

   The unsaved sheet retains identities for edits but only a count for failed Logs. If another tab creates a failed Log while the sheet is open, `discardFailed()` rereads and discards both submissions. **Reproduced: the sheet showed one failed set; accepting discarded two journals, then Finish succeeded.**

   **Exact fix:** Snapshot failed Log IDs and revisions alongside edit IDs. Discard only those exact journal revisions and matching submission marks. Leave later submissions unresolved so Finish asks about them separately.

3. **MAJOR — NEW: A duplicate Log acknowledges a revision it never saved.**  
   [rowLog.ts:224](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:224), [rowLog.ts:236](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:236)

   Two tabs can submit different revisions of the same draft ID before receiving each other’s updates. `logSet()` correctly retains the first committed set, but reconciliation uses the second submission’s requested revision. It therefore clears newer input as though it saved. **Reproduced: 17 reps remained saved, the 19-rep submission returned success, and its draft disappeared.**

   **Exact fix:** Reconcile against the actual committed submission receipt, including duplicate and already-deleted cases. Preserve revisions newer than that receipt under the existing deterministic successor identity.

4. **MAJOR — STILL OPEN: Retry can overwrite a newer successful correction.**  
   [mutations.ts:265](/Users/rabah/projects/anygym/src/db/mutations.ts:265), [mutations.ts:317](/Users/rabah/projects/anygym/src/db/mutations.ts:317)

   Separate runtimes can generate identical fallback IDs from the timestamp and runtime-local counter. Independently, Retry snapshots an intent before acquiring the session lock, then resubmits it as a fresh operation even if another save superseded it meanwhile. **Both variants reproduced: successfully saved 19 reps reverted to 17.**

   **Exact fix:** Allocate globally unique persistent intent IDs. Retry must retain the original identity and recheck its supersession receipt under the session lock before journaling or applying it.

5. **MAJOR — STILL OPEN: Storage recovery overwrites another tab’s durable pending weight.**  
   [drafts.ts:170](/Users/rabah/projects/anygym/src/lib/drafts.ts:170), [drafts.ts:261](/Users/rabah/projects/anygym/src/lib/drafts.ts:261)

   Per-row persistence protects the blocked-storage path, but a hydrated tab skips merging when localStorage becomes writable again. It mirrors its stale complete collection over IndexedDB. **Reproduced: A durably saved 73 lb; B edited another row after storage recovered; the durable weight became 53 lb.** Restart restores the wrong input.

   **Exact fix:** Transactionally merge dirty rows into authoritative IndexedDB state on every persistence path, including recovery. Refresh memory and localStorage from the committed result; remove stale whole-collection replacement.

6. **MAJOR — STILL OPEN: Changing “Loaded with” invents a loggable weight.**  
   [exerciseLoad.ts:135](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:135)

   Barbell and plate-machine rebuilding accept drafts selected under incompatible load kinds. **Reproduced: a selected single 60 lb weight became a confirmable 45 lb bare bar without another weight selection.** Logging saves the unintended load into history.

   **Exact fix:** Store the selection’s originating load kind, including selections with unknown bases. Reject incompatible kinds during rebuilding and confirmation. Changing load type must invalidate weight selection and require explicit reselection.

7. **MINOR — STILL OPEN: Another tab loses added rows or resurrects removed rows.**  
   [extraSets.ts:48](/Users/rabah/projects/anygym/src/lib/extraSets.ts:48), [extraSets.ts:84](/Users/rabah/projects/anygym/src/lib/extraSets.ts:84)

   Added-row counts and removal markers remain permanently cached and are written wholesale. **Reproduced with working storage: two extra squat rows became one when another tab added a bench row.** Removal markers can likewise disappear, restoring unwanted rows and changing completion counts.

   **Exact fix:** Persist count changes and removal markers transactionally by session/exercise or set identity. Synchronize tab caches and generate mirrors from committed state.

Typecheck passed. Fault-injected controls confirmed rollback for failed Log, Edit, Delete, Undo and Finish writes, plus deduplication, stored recovery, Finish→Undo snapshots, and update deferral. Findings were reproduced with actual modules and in-memory IndexedDB. Browser timing, real service-worker activation, and physical iOS termination remain unverified.