**11 findings: 7 product defects and 4 test blind spots.** Reviewed completed `[x]` scope and earlier reports; fixed findings and unfinished 2.0a/2.0b work are excluded. No files edited. Typecheck passed. In-memory probes reproduced the storage, unit-reinterpretation, and legacy-identity failures; browser races remain source-traced. Vitest and Playwright suites were not run.

1. **MAJOR — STILL OPEN: An open weight picker can reinterpret pounds as kilograms.**  
   [WeightSheet.tsx:73](/Users/rabah/projects/anygym/src/screens/workout/WeightSheet.tsx:73), [ExerciseView.tsx:141](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:141)  
   Open a 65 lb picker—45 lb bar plus 10 per side—then change the gym to kg in another tab. `currentLoad()` rejects the mismatch, but Done remains enabled because plates exist. Confirmation returns unitless plates; the row stamps them as kg and rebuilds **40 kg**. The underlying calculation was reproduced; the complete browser sequence was not.

   **Exact fix:** Add the originating unit to `WeightPick`. Validate it on confirmation and application; block mismatched picks until explicitly reselected. Allow null loads with plates only for genuinely unknown bases.

   **Test:** Keep the picker mounted through a gym-unit change. Assert Done cannot apply the old selection and no 40 kg draft or set appears.

2. **MAJOR — STILL OPEN: Unavailable localStorage skips draft persistence despite working IndexedDB.**  
   [drafts.ts:149](/Users/rabah/projects/anygym/src/lib/drafts.ts:149), [durable.ts:73](/Users/rabah/projects/anygym/src/lib/durable.ts:73)  
   A throwing `localStorage` getter produces null storage, bypassing the entire persistence branch. A 53 lb/17-rep pending draft produced **zero IndexedDB mirror records**. Restart therefore loses its latest values. Clearing drafts has the same missing fallback.

   **Exact fix:** Persist the complete draft value directly to `db.kv` using `durableRow()` when storage is null, including null values for clears.

   **Test:** Install a throwing storage getter, save a draft, await its IndexedDB record, discard module memory, and hydrate with storage still unavailable. Assert exactly 53 lb/17 reps returns; repeat after clearing and assert it stays cleared.

3. **MAJOR — STILL OPEN: Timestamp failure suppresses the durable draft/rest copy.**  
   [durable.ts:48](/Users/rabah/projects/anygym/src/lib/durable.ts:48)  
   If the workout value saves but `anygym-durable-at` cannot be written, `mirror()` exits before IndexedDB persistence. Reproduced **zero mirror records**. Loss after process termination remains device-dependent, but the intended protection is absent.

   **Exact fix:** Snapshot the value and timestamp, attempt timestamp storage separately, and attempt the IndexedDB write regardless of timestamp failure.

   **Test:** Make storage accept the workout key but reject only `STAMPS_KEY`. Assert IndexedDB contains the latest value and restores it over an older disk snapshot. The current [test’s “resolves undefined” assertion]( /Users/rabah/projects/anygym/src/lib/__tests__/durable.test.ts:83) accepts silent persistence failure.

4. **MAJOR — STILL OPEN: Import Save can silently restore a rejected weight.**  
   [ImportSetSheet.tsx:42](/Users/rabah/projects/anygym/src/screens/settings/ImportSetSheet.tsx:42), [importPlan.ts:262](/Users/rabah/projects/anygym/src/lib/import/importPlan.ts:262)  
   Edit an imported 53 lb kettlebell set, clear its weight or enter rejected value 501, then Save. Save remains enabled, omits the null load, and marks the edit checked. Import falls back to the original **53 lb**, despite the changed readout. Source-traced.

   **Exact fix:** Disable Save for an invalid edited weight. Represent unchanged, cleared, and valid replacement loads distinctly; explicitly changed fields must never fall back to source values.

   **Test:** Exercise both clear and 501 through Import Review. Assert Save is disabled and the set remains unchecked. Enter a valid replacement, import, and inspect the exact persisted load.

5. **MAJOR — STILL OPEN: Delayed bar-choice completion discards newer plate selections.**  
   [SetLoadInput.tsx:192](/Users/rabah/projects/anygym/src/screens/workout/SetLoadInput.tsx:192)  
   Choose a zero-base Smith bar while `[45]` is loaded, then add a 10 lb plate while saving the choice is delayed. Completion calls `change()` with captured `[45]`, removing the newer 10s: **90 lb instead of 110 lb**. Source-traced race.

   **Exact fix:** Read the latest plates when saving completes, reject stale choice completions, and prevent confirmation while a choice is unsettled.

   **Test:** Hold the exercise-settings transaction, choose Smith, add 10s, then release it. Assert the diagram, draft and saved set retain `[45,10]` and total 110 lb. Existing failure tests reject immediately and miss this successful delayed completion.

6. **MAJOR — STILL OPEN: Changing gym units reclassifies legacy Smith history as Olympic.**  
   [history.ts:50](/Users/rabah/projects/anygym/src/db/history.ts:50)  
   Legacy records without `barId` use today’s gym configuration. A 90 lb, plates-only Smith record resolves correctly until the gym changes to kg; the unit mismatch then returns the exercise’s default Olympic identity. This identity change was reproduced and can contaminate targets and records.

   **Exact fix:** Persist resolvable legacy identities before replacing equipment/unit settings. Return unresolved when historical evidence is unavailable, excluding those records from equipment comparisons until confirmed.

   **Test:** Save legacy Smith history at gym A, switch A to kg through `setGymUnit()`, then query Olympic history at gym B. Assert the Smith record remains excluded from history, LAST TIME and records.

7. **MAJOR — STILL OPEN, test blind spot: Default discovery omits acceptance tests on four devices.**  
   [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47)  
   Android projects and the 320 floor still require `@matrix`. Kill and monkey tests lack that tag, so ordinary `npm run test:ui` skips them there despite SPEC 13.3/13.4.

   **Counterexample:** An Android-only recovery failure passes the default suite because its recovery test never runs.

   **Exact fix/test:** Remove the acceptance-test filter or make the full-matrix command mandatory. Add a discovery contract comparing applicable functional test IDs across all seven projects, with explicit exclusions only for report-only tests.

8. **MAJOR — STILL OPEN, test blind spot: Hard-kill tests avoid transaction boundaries.**  
   [kill.spec.ts:85](/Users/rabah/projects/anygym/tests/kill.spec.ts:85)  
   Tests snapshot settled state before SIGKILL. Unit tests simulate interrupted sequences with memory-backed storage, but do not establish real browser persistence at those boundaries.

   **Counterexample:** Settled drafts survive while termination after set commit but before reconciliation duplicates a lift or loses another pending row. This is a coverage gap, not evidence that the fixed duplication bug has returned.

   **Exact fix/test:** Add deterministic gates after journal persistence, before set commit, and after receipt commit/before cleanup. SIGKILL at each, reopen offline, and assert one saved 19-rep set plus pending 7- and 8-rep rows exactly once. Repeat between Undo acceptance and restoration.

9. **MAJOR — STILL OPEN, test blind spot: “Swipe” tests bypass native touch scrolling.**  
   [loads.spec.ts:58](/Users/rabah/projects/anygym/tests/loads.spec.ts:58), [monkey.ts:181](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:181)  
   Picker tests assign `scrollLeft`; monkey swipes use mouse events. Neither validates mobile touch arbitration.

   **Counterexample:** A parent sheet’s `touch-action` blocks horizontal wheel panning while direct scrolling and mouse dragging pass.

   **Exact fix/test:** Add native touch drags inside Weight and Edit sheets—Chromium touch injection plus iOS simulator/device automation. Assert actual scrolling, changed selection, and Done/Save persisting the displayed weight. Include nested sheets and edge-back gestures. No current device failure was reproduced.

10. **MINOR — NEW, mocked-away defect: Browser reporting cannot read `Retry-After`.**  
    [http.ts:14](/Users/rabah/projects/anygym/workers/anygym-api/src/http.ts:14), [transport.ts:91](/Users/rabah/projects/anygym/src/lib/reporting/transport.ts:91)  
    The Worker supplies `Retry-After` on 429 but never exposes it through CORS. Cross-origin browser code consequently reads null and uses its short exponential delay, generating avoidable requests while reports remain queued. Source-traced.

    **Exact fix:** Add `Access-Control-Expose-Headers: Retry-After` to allowed-origin response headers.

    **Test:** Use actual browser fetch across two localhost ports with Worker-equivalent response headers and `Retry-After: 120`. Assert `nextAttemptAt` advances by 120 seconds. The existing [transport test]( /Users/rabah/projects/anygym/src/lib/reporting/__tests__/transport.test.ts:103) returns a constructed `Response`, bypassing browser CORS filtering.

11. **MINOR — STILL OPEN, assertion weakness: Backup completeness expectations reuse production’s whitelist.**  
    [backup.test.ts:73](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:73), [backup.test.ts:97](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:97)  
    Snapshot construction and expected exported keys both use production `TABLE_NAMES`.

    **Counterexample:** Accidentally removing `exerciseSettings` from that list removes it from both export and these expectations. Those assertions pass despite losing settings; separate tests may catch particular omissions.

    **Exact fix/test:** Define an independent literal backup contract. Seed distinct sentinels in every required table and active draft/journal category, restore into a separate database, and inspect destination tables directly. Explicitly assert intentional reporting-data exclusions. Do not derive expected tables or snapshots from `TABLE_NAMES` or production `readTables()`.