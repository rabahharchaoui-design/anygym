**10 findings in completed `[x]` features.** No files edited. Fixed earlier findings are excluded. Typecheck passed; in-memory probes confirmed the recovery and calculation failures noted below. Browser races remain source-traced; physical iPhone behavior was not tested.

1. **MAJOR — STILL OPEN: An open picker can turn pounds into kilograms.**  
   [WeightSheet.tsx:73](/Users/rabah/projects/anygym/src/screens/workout/WeightSheet.tsx:73)  
   Leave a **65 lb** picker open, then change the gym to kg in another tab. The incompatible load becomes null, but Done stays enabled because plates exist. Confirmation returns unitless plates that become a loggable **40 kg**. Calculation path reproduced; full browser sequence untested. Violates §§0 and 20.2.  
   **Exact fix:** Include the originating unit in `WeightPick`; validate it on confirmation and application. Permit null loads with plates only for genuinely unknown bases with valid units and inventory.

2. **MAJOR — STILL OPEN: Delayed bar selection removes newer plates.**  
   [SetLoadInput.tsx:198](/Users/rabah/projects/anygym/src/screens/workout/SetLoadInput.tsx:198)  
   Choose a zero-base Smith bar with `[45]` loaded, then add 10 lb plates while saving the choice is pending. Completion uses the captured `[45]`, dropping the newer plates and producing **90 lb instead of 110 lb**. Source-traced race.  
   **Exact fix:** Read the latest plates when the write completes, reject stale choice completions, and block Done while the choice is unsettled.

3. **MAJOR — STILL OPEN: Unavailable localStorage bypasses durable draft saving.**  
   [drafts.ts:149](/Users/rabah/projects/anygym/src/lib/drafts.ts:149), [durable.ts:73](/Users/rabah/projects/anygym/src/lib/durable.ts:73)  
   When accessing localStorage throws, draft persistence skips IndexedDB entirely. A synthetic **53 lb/17-rep** draft produced **zero durable records** despite working IndexedDB; restarting loses those pending values. Violates §13.3.  
   **Exact fix:** Persist the complete draft blob directly to `db.kv` through `durableRow()` when storage is null. Apply the same fallback to clears and rest state; allow `mirrorValue()` to handle null storage.

4. **MAJOR — NEW: Finish → Undo loses pending edits and added rows.**  
   [WorkoutScreen.tsx:430](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:430), [workouts.ts:357](/Users/rabah/projects/anygym/src/db/workouts.ts:357)  
   Log a set, customize another pending row, add an extra set, then Finish → Done → Undo. Finish clears drafts and extra-set counts; Undo restores only the session and plan pointer. **Reproduced:** reopening succeeded, but the 17-rep draft was gone and the extra-set count was zero.  
   **Exact fix:** Preserve a durable snapshot of pending drafts, extra rows and rest state while Finish remains undoable. Restore that snapshot before navigating back, reconciling drafts against committed submissions.

5. **MAJOR — STILL OPEN: Changing units moves legacy Smith history into Olympic history.**  
   [history.ts:50](/Users/rabah/projects/anygym/src/db/history.ts:50)  
   A legacy barbell set without `barId` resolves as Smith while its gym retains the matching answer. Changing that gym to kg clears the evidence; the resolver falls back to Olympic. **Identity change reproduced.** LAST TIME, targets and records can then compare incompatible equipment, violating §0.  
   **Exact fix:** Persist resolvable legacy identities before replacing unit/equipment settings. Keep ambiguous records unresolved and excluded from equipment comparisons.

6. **MAJOR — STILL OPEN: Import Save silently restores a rejected weight.**  
   [ImportSetSheet.tsx:42](/Users/rabah/projects/anygym/src/screens/settings/ImportSetSheet.tsx:42), [importPlan.ts:262](/Users/rabah/projects/anygym/src/lib/import/importPlan.ts:262)  
   Edit an imported **53 lb** set, then clear its weight or enter rejected value **501**. Save remains enabled, omits the null load and marks the set checked. Import falls back to the original **53 lb**, despite the edited readout. Source-confirmed.  
   **Exact fix:** Disable Save for invalid edited weights. Distinguish unchanged, cleared and valid replacement loads; explicitly changed fields must never fall back to source values.

7. **MAJOR — STILL OPEN: Timestamp failure suppresses the durable workout copy.**  
   [durable.ts:48](/Users/rabah/projects/anygym/src/lib/durable.ts:48)  
   If the workout value saves but its timestamp write fails, execution exits before IndexedDB persistence. **Reproduced: zero mirror records.** Drafts/rest lose their intended process-kill protection; actual device-level loss remains unverified.  
   **Exact fix:** Snapshot the value and timestamp, attempt timestamp storage separately, and attempt the IndexedDB write regardless of timestamp failure.

8. **MAJOR — NEW: A rest-storage read failure crashes workout opening.**  
   [rest.ts:89](/Users/rabah/projects/anygym/src/lib/rest.ts:89)  
   If the storage object exists but `getItem()` throws, `loadRest()` lets the exception escape into `WorkoutScreen`’s state initializer. The error boundary replaces the app; Reload repeats the failure while storage remains blocked. **Throw reproduced with fault injection.**  
   **Exact fix:** Catch storage-read failures. Hydrate rest directly from IndexedDB before rendering when possible; otherwise show a recoverable rest error while allowing access to the saved workout.

9. **MAJOR — STILL OPEN: Default tests omit acceptance coverage on four devices.**  
   [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47)  
   Ordinary `npm run test:ui` restricts Android and the 320 floor to `@matrix` tests. Kill and monkey tests lack that tag, so failures there cannot fail the default suite. This breaks §§13.3–13.4. **Confirmed coverage gap; no additional device defect is asserted.**  
   **Exact fix:** Remove the filter or make full-matrix execution mandatory in the standard test command. Add a discovery check requiring shared acceptance cases on all seven projects.

10. **MINOR — STILL OPEN: Reporting cannot read the server’s retry delay.**  
    [http.ts:14](/Users/rabah/projects/anygym/workers/anygym-api/src/http.ts:14)  
    The Worker returns `Retry-After` without exposing it through CORS. Browser transport therefore uses its shorter fallback delay, causing unnecessary retries while reports remain queued. Source-confirmed.  
    **Exact fix:** Add `Access-Control-Expose-Headers: Retry-After` to allowed-origin responses and verify it through an actual cross-origin browser request.