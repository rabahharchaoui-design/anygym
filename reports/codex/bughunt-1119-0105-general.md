I found **8 issues** in the completed run features. The current `PLAN.md` marks 4.0–4.4 complete; I excluded unchecked work as missing functionality, while reporting defects in the completed features. Findings previously identified in `reports/codex/` are marked **STILL OPEN**.

1. **BLOCKER — STILL OPEN: Restoring a backup can erase an active run.**  
   [backup.ts:125](/Users/rabah/projects/anygym/src/db/backup.ts:125), [backup.ts:145](/Users/rabah/projects/anygym/src/db/backup.ts:145)  
   Restore checks for an active workout but not an active run. Replace can clear the run’s database row while the runner is away from the live screen; if the app closes before another save, the route is lost. A backup made during a run can also restore an unfinished run as active.  
   **Exact fix:** Coordinate run start and restore, including an in-memory run whose initial write failed. Refuse both restore modes while a run is active, check durable runs inside the restore transaction, and omit unfinished run rows from imported backups.

2. **MAJOR — STILL OPEN: Failed run saves are invisible.**  
   [runEngine.ts:75](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:75), [runEngine.ts:174](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:174)  
   Initial and periodic write failures only set a retry flag. If storage remains unavailable and iOS closes the app, the run and its route can disappear without warning.  
   **Exact fix:** Expose initial and autosave failure in engine state, show a persistent actionable warning on the live screen, keep retrying, and clear the warning only after the latest state is durably saved. Use an independent durable fallback where available.

3. **MAJOR — STILL OPEN: A failed restore is treated as an empty database.**  
   [runEngine.ts:144](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:144)  
   A transient read failure enables Start even if an unfinished run exists. Starting another run overwrites the single live-snapshot key, making recovery of the original run unreliable.  
   **Exact fix:** Represent restore failure separately from “no active run,” offer Retry, and block a new start until the check succeeds. Store snapshots by run ID and enforce the single-active-run rule transactionally.

4. **MAJOR — STILL OPEN: Old pace remains visible after GPS stops.**  
   [runEngine.ts:101](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:101), [LiveStats.tsx:40](/Users/rabah/projects/anygym/src/screens/run/LiveStats.tsx:40)  
   The display updates its GPS state only on callbacks. If fixes stop arriving, it can continue presenting the last rolling pace as current indefinitely, contrary to the no-bad-data rule.  
   **Exact fix:** Track the age of the last accepted fix on a bounded timer. After the GPS gap threshold, show `--` for current pace and a GPS-lost message, and restart the watch; restore pace only after valid fixes return.

5. **MAJOR — STILL OPEN: The offline voice pack can remain incomplete after returning to the app.**  
   [voiceWarm.ts:12](/Users/rabah/projects/anygym/src/hooks/voiceWarm.ts:12)  
   `pagehide` aborts the background download, but `started` remains true. If iOS returns the same page from its page cache, warming cannot resume; uncached coaching clips may then be unavailable on an offline run.  
   **Exact fix:** Restart the unfinished cache fill on `pageshow` and when the app next becomes eligible and online. Reset the in-progress state on abort or failure, retaining already cached clips.

6. **MAJOR — STILL OPEN: VoiceOver cannot reliably read the interval countdown.**  
   [LiveRun.tsx:186](/Users/rabah/projects/anygym/src/screens/run/LiveRun.tsx:186), [LiveStats.tsx:76](/Users/rabah/projects/anygym/src/screens/run/LiveStats.tsx:76)  
   The interval face sits inside a disabled button whose accessible name is “Show the next number big.” Its block name and countdown are consequently hidden by the button’s label, leaving a VoiceOver user without the interval instructions.  
   **Exact fix:** Render the interval face outside the cycle button and expose its block, round and remaining time as accessible text without announcing every 250 ms tick.

7. **MAJOR — STILL OPEN: Losing the wake lock is not reported.**  
   [runWake.ts:26](/Users/rabah/projects/anygym/src/hooks/runWake.ts:26)  
   The engine reports the wake lock as on after acquisition but does not listen for its release by the system. The screen can lock during a run without the user being told, interrupting GPS tracking.  
   **Exact fix:** Listen for each sentinel’s `release` event, update wake state, and request a new lock when visible and still wanted. If reacquisition fails, show the existing actionable warning.

8. **MINOR — STILL OPEN: Discard can fail silently.**  
   [runEngine.ts:225](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:225)  
   The summary closes before the database deletion finishes, and deletion errors are suppressed. A run the user chose to discard can remain stored.  
   **Exact fix:** Await the deletion before closing the summary. If it fails, keep the summary open and show a retryable error.

This was a read-only source review; I did not edit files, run tests, or verify behavior on a physical iPhone. The failure paths above are source-confirmed, but their device timing and VoiceOver behavior still need hands-on verification.