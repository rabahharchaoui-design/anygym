Found **6 findings in completed `[x]` features**. No files edited. Fixed earlier findings are excluded.

Typecheck passed, along with **10,560 weight-sum cases and 82 solver round trips** across lb/kg. Findings below were reproduced with handler or in-memory database probes; physical iPhone timing was not tested.

1. **MAJOR — STILL OPEN, partial fix: An open picker can reinterpret pounds as kilograms.**  
   [WeightSheet.tsx:73](/Users/rabah/projects/anygym/src/screens/workout/WeightSheet.tsx:73), [ExerciseView.tsx:141](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:141)  
   Leave a **65 lb** picker open—45 lb bar plus 10 lb per side—and change the gym to kg in another tab. Done remains enabled despite the incompatible load. It returns unitless plates, which are stamped as kg and rebuilt into a loggable **40 kg**. The earlier unit protection remains bypassable through this path.  
   **Exact fix:** Include the originating unit in `WeightPick`. Block confirmation on unit mismatch until a fresh selection; permit a null load with plates only when the base is genuinely unknown and the plates’ unit and inventory are valid.

2. **MAJOR — NEW: Import Save can silently retain a rejected weight.**  
   [ImportSetSheet.tsx:42](/Users/rabah/projects/anygym/src/screens/settings/ImportSetSheet.tsx:42), [importPlan.ts:262](/Users/rabah/projects/anygym/src/lib/import/importPlan.ts:262)  
   Edit an imported **53 lb** kettlebell set. Clear its weight or type **501**, which the input rejects. Save remains enabled and omits the null load from the edit. Import then restores **53 lb** from the source and marks it checked, despite the changed readout.  
   **Exact fix:** Disable Save when an edited weight is invalid. Distinguish “unchanged” from “explicitly cleared” in `SetEdit`; never fall back to the source load for an explicitly changed field.

3. **MAJOR — NEW: A delayed bar-choice save discards newer plate selections.**  
   [SetLoadInput.tsx:192](/Users/rabah/projects/anygym/src/screens/workout/SetLoadInput.tsx:192)  
   Select Smith from an Olympic setup containing `[45]`, then add a 10 lb plate while the choice write is pending. When it completes, `change(perSide, …)` uses the captured `[45]` and removes the newer 10s. The resulting zero-base Smith load is **90 lb instead of 110 lb**, and can be saved.  
   **Exact fix:** Read the latest plate selection when the asynchronous write completes, using a ref or serialized state update. Protect against stale choice completions and disable confirmation until the choice settles.

4. **MAJOR — STILL OPEN, partial fix: Changing units reclassifies legacy Smith history as Olympic.**  
   [history.ts:50](/Users/rabah/projects/anygym/src/db/history.ts:50)  
   A legacy Smith set without `barId` is correctly isolated while its gym retains the matching Smith answer. Change that gym’s unit: the resolver now falls back to the exercise’s default bar. **Reproduced:** a 90 lb Smith set previously excluded from another gym’s Olympic history appeared there afterward, affecting LAST TIME, targets and records.  
   **Exact fix:** Persist resolvable legacy identities before changing units or equipment answers. Return unresolved identity when historical evidence is unavailable; exclude those records from equipment comparisons until confirmed.

5. **MAJOR — NEW: Unavailable localStorage bypasses draft persistence entirely.**  
   [drafts.ts:149](/Users/rabah/projects/anygym/src/lib/drafts.ts:149)  
   If accessing `localStorage` throws, `storage()` returns null and the entire persistence branch is skipped—even with working IndexedDB. **Reproduced: zero IndexedDB writes** for a 53 lb/17-rep draft. Restart loses those pending values and can restore older targets.  
   **Exact fix:** Write the complete draft blob directly through `db.kv.put(durableRow(...))` when storage is null. Apply the same fallback to draft clearing; `mirrorValue()` currently also rejects null storage.

6. **MAJOR — STILL OPEN: Timestamp failure suppresses the durable weight-draft copy.**  
   [durable.ts:48](/Users/rabah/projects/anygym/src/lib/durable.ts:48)  
   If saving the draft succeeds but saving its timestamp fails, `mirror()` exits before writing IndexedDB. **Reproduced: zero mirror records.** This removes the intended protection against termination; actual device-level loss was not tested.  
   **Exact fix:** Attempt the IndexedDB write independently of timestamp persistence, using the value already being saved. Handle timestamp failure separately so it cannot suppress the durable copy.