Found **8 issues in completed `[x]` features**. No files edited. Fixed earlier findings are excluded. Typecheck passed; in-memory probes confirmed the calculation, validation and recovery failures. UI races are source-traced; physical iPhone testing was not performed.

1. **MAJOR — STILL OPEN: Failed Undo protection disappears after an app restart.**  
   [sessionRecovery.ts:38](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:38), [tombstones.ts:80](/Users/rabah/projects/anygym/src/db/tombstones.ts:80)  
   If saving Undo acceptance fails, the unresolved request survives navigation but remains memory-only. Restart after its expiry deletes the tombstone. **Reproduced:** neither the set nor its recovery record remained. Violates SPEC §13.3.  
   **Exact fix:** Persist Undo intent through a durable fallback and hydrate it before recovery or Finish. Retain a recoverable deleted record when acceptance cannot be persisted; never automatically expire an unresolved Undo.

2. **MAJOR — STILL OPEN, partial validation: A damaged backup can still freeze the dumbbell picker.**  
   [load.ts:309](/Users/rabah/projects/anygym/src/lib/load.ts:309)  
   `{ min: 5, max: 5, step: 1e-12 }` passes backup validation. Integer arithmetic rounds that step to zero, so `dumbbellsInRange()` loops indefinitely after Replace. **Parser acceptance and execution timeout reproduced.**  
   **Exact fix:** Require supported numeric precision and a positive integer-scaled step. Generate a precomputed, bounded number of options rather than using an unbounded loop.

3. **MAJOR — STILL OPEN, partial validation: Unsupported plates survive Restore and crash loading.**  
   [backup.ts:154](/Users/rabah/projects/anygym/src/lib/backup.ts:154)  
   An enabled **999 kg plate** passes validation. After Replace, opening plate loading throws `Unknown kg plate: 999`, leaving the restored gym unusable for those lifts. **Reproduced.**  
   **Exact fix:** Validate inventory weights against `PLATE_SPECS[gym.unit]` before restoration. Apply equivalent validation to stored plate breakdowns; reject unsupported equipment before changing the database.

4. **MAJOR — NEW: An open row editor can apply changes to another set.**  
   [ExerciseView.tsx:201](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:201), [ExerciseView.tsx:247](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:247)  
   Check row 3 during a delayed save, then open row 2’s weight picker. When row 3 commits, pending rows move. Done uses the old displayed index and changes the formerly preceding row too. Set-type selection has the same index dependency. **Row movement reproduced; browser race remains untested.**  
   **Exact fix:** Store editor targets by stable draft ID. Resolve their current slot when applying changes, and apply downward updates from that identity’s current position.

5. **MAJOR — STILL OPEN, partial privacy fix: Automatic diagnostics can transmit personal text.**  
   [mask.ts:66](/Users/rabah/projects/anygym/src/lib/reporting/mask.ts:66), [mask.ts:122](/Users/rabah/projects/anygym/src/lib/reporting/mask.ts:122)  
   The mask preserves lowercase names and addresses. **Reproduced:** `Error: account alice smith at 14 oak street failed` survives unchanged in both sanitized diagnostic text and the phone-push body. This breaks the privacy promises in SPEC §§0 and 24.  
   **Exact fix:** Use allowlisted diagnostic codes and fixed messages for automatic reports. Replace arbitrary error text with a generic placeholder; phone pushes should contain a report reference and approved screen information.

6. **MINOR — NEW: An earlier Send can hide a new, unsent problem report.**  
   [ReportProblemSheet.tsx:91](/Users/rabah/projects/anygym/src/screens/settings/ReportProblemSheet.tsx:91)  
   Send a report, close while it waits, reopen and type another. The first request’s completion unconditionally sets the reopened sheet to “Sent,” hiding the second report although it was never submitted. **Source-traced.**  
   **Exact fix:** Give each sheet opening and submission a generation token. Ignore completion handlers from previous generations, including their busy, error and success updates.

7. **MINOR — STILL OPEN: Equivalent mixed-unit sets fail progression eligibility.**  
   [progression.ts:154](/Users/rabah/projects/anygym/src/lib/progression.ts:154)  
   Equivalent **20 kg** and **44.092… lb** dumbbells, both reaching the top rep target, remain at 20 kg instead of progressing to the available 22 kg. `sameAll` still requires identical units. **Reproduced.**  
   **Exact fix:** Use `sameResistance()` for both `sameAll` and the bodyweight streak comparison.

8. **MINOR — NEW: Added rows disappear after restart when localStorage is full.**  
   [extraSets.ts:43](/Users/rabah/projects/anygym/src/lib/extraSets.ts:43)  
   A failed localStorage write skips the IndexedDB mirror entirely. “+ Add set” therefore survives only in memory; restarting removes the extra row. **Reproduced.**  
   **Exact fix:** Call `mirrorValue()` on write failure and hydrate extra-set state directly from IndexedDB when localStorage remains unavailable, as drafts and rest timers already do.