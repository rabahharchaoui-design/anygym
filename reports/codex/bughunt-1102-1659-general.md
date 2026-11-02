**6 findings: 4 MAJOR, 2 MINOR.** Reviewed completed `[x]` features in the current workspace; fixed earlier findings excluded. No files edited. Typecheck passed. Verification used source inspection and in-memory probes; physical iPhone behavior was not tested.

1. **MAJOR — NEW: Removing an exercise can offer Undo after its sets have expired.**  
   [WorkoutScreen.tsx:475](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:475), [deleteUndo.ts:93](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:93)  
   Each set’s five-second Undo timer starts during sequential deletion, but the exercise’s Undo toast appears only afterward. Tapping within the toast’s advertised window can restore the exercise with some or all sets missing. The failure rollback also cannot recover expired records. A manager-level probe reproduced this; full UI timing remains unverified. Violates §§0 and 13.1.  
   **Exact fix:** Treat exercise removal as one undoable operation. Protect every deleted set until a shared five-second window ends, starting when the group toast appears. Accept Undo for all group members durably before restoring any, and treat missing restoration results as failures.

2. **MAJOR — STILL OPEN: Retry can overwrite a newer successful correction.**  
   [mutations.ts:265](/Users/rabah/projects/anygym/src/db/mutations.ts:265), [mutations.ts:317](/Users/rabah/projects/anygym/src/db/mutations.ts:317)  
   Separate tab runtimes can generate identical fallback IDs because IDs use a timestamp and runtime-local counter. Independently, Retry reads pending changes before acquiring the save lock, then submits an obsolete correction as a new operation. **Reproduced both variants: successfully saved 19 reps reverted to 17.** The new supersession receipts do not close these paths. Violates §§0 and 13.3.  
   **Exact fix:** Give each intent a globally unique, persistent ID. Retry must retain that identity and, under the session lock, recheck its supersession receipt before journaling or applying it.

3. **MAJOR — STILL OPEN, storage-recovery variant: An unrelated edit replaces another tab’s pending weight.**  
   [drafts.ts:170](/Users/rabah/projects/anygym/src/lib/drafts.ts:170), [drafts.ts:261](/Users/rabah/projects/anygym/src/lib/drafts.ts:261)  
   The new per-row fallback protects writes while localStorage refuses them. Once storage accepts writes again, a hydrated tab still skips merging and mirrors its stale complete collection over IndexedDB. **Reproduced: A durably saved 73 lb; B edited another row after storage recovered; the durable weight became 53 lb.** Violates §§0 and 13.3.  
   **Exact fix:** Use transactional per-row persistence during recovery as well as failure. Merge dirty rows into authoritative IndexedDB state first, then refresh the localStorage mirror from that committed result.

4. **MAJOR — STILL OPEN: Changing “Loaded with” invents a selected weight.**  
   [exerciseLoad.ts:135](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:135)  
   Barbell and plate-machine rebuilding accept drafts selected under incompatible load kinds. **Reproduced: a selected single 60 lb weight became a confirmable 45 lb bare bar without another weight selection.** This can put an unintended load into history and progression. Violates §§0 and 20.2.  
   **Exact fix:** Preserve the draft’s selected load kind, reject mismatches in `currentLoad()` and `confirmablePick()`, and invalidate weight selection when the load type changes. Require explicit reselection before logging.

5. **MINOR — NEW: Another tab silently loses added or removed rows.**  
   [extraSets.ts:48](/Users/rabah/projects/anygym/src/lib/extraSets.ts:48), [extraSets.ts:78](/Users/rabah/projects/anygym/src/lib/extraSets.ts:78)  
   This store keeps a permanent cached collection and writes it wholesale without cross-tab merging. **Reproduced with working storage: A saved two extra squat rows; B added a bench row; the stored squat count fell to one.** The same overwrite can lose removal markers, making removed rows reappear. Violates §§13.3 and 20.2.  
   **Exact fix:** Persist count changes and deletion markers transactionally by session/exercise or set identity. Synchronize other tabs and build mirrors from committed state.

6. **MINOR — STILL OPEN: Demo pause controls miss the required touch-target size.**  
   [FormDemo.module.css:84](/Users/rabah/projects/anygym/src/components/exercise/FormDemo.module.css:84)  
   Pause/Play is explicitly **44 × 44 px**, below §§0 and 13.3’s 48-point minimum. This remains from the earlier merge-gate brief and makes stopping a form demonstration harder to tap reliably. Source-confirmed.  
   **Exact fix:** Increase the interactive button to at least 48 × 48 px; keep the visible glyph and glass circle smaller inside it.