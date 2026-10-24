Read earlier reports first and reviewed completed `[x]` scope. No files edited. Excluded the unchecked workout redesign and fixed earlier findings. **Six application findings and six test blind spots**, worst first. Runtime probes used the actual modules with in-memory IndexedDB; full suites and physical iPhone testing were not run.

1. **MAJOR — STILL OPEN: Smith and free-weight history mix.**  
   [history.ts:30](/Users/rabah/projects/anygym/src/db/history.ts:30), [types.ts:159](/Users/rabah/projects/anygym/src/db/types.ts:159)  
   Choosing Smith for a bench exercise saves a generic barbell load. Returning to Olympic can include those Smith sets in free-weight targets, even across gyms. The reverse query includes free-weight sets from the selected gym. Reproduced at the database layer.  
   **Exact fix:** Persist equipment identity, including `barId`, on each logged load. Filter history using saved identity and isolate Smith records by gym. Keep ambiguous legacy records separate.  
   **Test:** Log Smith and Olympic bench at two gyms; assert Olympic history contains only free-weight sets across gyms, while Smith history contains only Smith sets from the requested gym.

2. **MAJOR — STILL OPEN: Older machine edits show a different weight from Save.**  
   [PlateMachineInput.tsx:26](/Users/rabah/projects/anygym/src/components/load/PlateMachineInput.tsx:26), [EditSetSheet.tsx:86](/Users/rabah/projects/anygym/src/screens/workout/EditSetSheet.tsx:86)  
   Log 45 lb per side with zero starting resistance: 90 lb. Change starting resistance to 50 through another set, then reopen the original. Its diagram shows 140 lb, while a reps-only Save retains 90 lb. Adding and removing a plate silently changes it to 140 lb.  
   **Exact fix:** Pass the saved machine `barWeight` into the edit input, keep starting resistance local to that edit, and derive display and Save from the same canonical load.  
   **Test:** Keep two machine sets; change resistance through the second, reopen the untouched first, then verify diagram, reps-only Save, and add/remove round trip all retain 90 lb.

3. **MAJOR — Historical collar settings can corrupt an edit; configuration-dependent.**  
   [SetLoadInput.tsx:139](/Users/rabah/projects/anygym/src/screens/workout/SetLoadInput.tsx:139)  
   Edits preserve the historical bar but use today’s `gym.collars`. A saved 65 kg set—20 kg bar, 20 kg per side, 5 kg collars—shows 60 kg when today’s collars are none. A plate round trip changes the saved total to 60 kg. Calculation reproduced. **I have not established a collar-change path through the completed UI; this currently affects differing stored configurations.** PLAN already acknowledges the gap.  
   **Exact fix:** Store collar contribution on new loads. For legacy loads, recover it from `total − barWeight − 2 × sum(perSide)` when valid. Keep it local during editing.  
   **Test:** Seed that 65 kg set in a gym currently using no collars; assert display and both edit paths preserve 65 kg.

4. **MAJOR — Database read failures masquerade as empty history.**  
   [useLive.ts:14](/Users/rabah/projects/anygym/src/hooks/useLive.ts:14), [HistoryScreen.tsx:21](/Users/rabah/projects/anygym/src/screens/HistoryScreen.tsx:21)  
   A failed initial query sets `ready: true` without exposing an error. History then says “No workouts yet,” although saved workouts may exist. The failed subscription also has no explicit retry path.  
   **Exact fix:** Return an error state and retry operation from `useLive`; display “Could not load workouts. Try again.” Preserve any last successful result and recreate the subscription on retry.  
   **Test:** Seed a finished workout, fail the initial sessions read, assert an error rather than the empty state, remove the fault, tap Retry, and verify the original workout appears unchanged.

5. **MAJOR — TEST BLIND SPOT: The delayed-log remount regression is not exercised in React.**  
   [logQueue.test.ts:45](/Users/rabah/projects/anygym/src/lib/__tests__/logQueue.test.ts:45), [verify-1.10d.spec.ts:54](/Users/rabah/projects/anygym/tests/verify-1.10d.spec.ts:54)  
   Vitest’s “mounted card” is an object manually subscribed to the queue. Playwright never deliberately delays the Log transaction and checks only two saved sets after navigation.  
   **Counterexample:** The real component fails to subscribe after remount; the queue tests still pass, and the browser test can finish its write before navigation.  
   **Exact test to add:** Hold the first Log transaction open, navigate away and back while it remains pending, release it, then log a distinct second weight/reps combination. Assert exactly two records with distinct IDs and the exact submitted values after reload. This tests a previously fixed defect; it does not establish that it has returned.

6. **MAJOR — TEST BLIND SPOT: Reload does not prove recovery after app termination.**  
   [codex-active-workout.spec.ts:105](/Users/rabah/projects/anygym/tests/codex-active-workout.spec.ts:105)  
   Existing recovery tests use `page.reload()`, which permits unload lifecycle handlers.  
   **Counterexample:** Persistence moved accidentally into `pagehide` would pass reload tests but lose inputs when iOS kills the process without firing it.  
   **Exact test to add:** In a persistent browser profile, prepare an unlogged weight/reps draft, start a hold and rest timer, then forcibly terminate the browser process without graceful page closure. Relaunch the same profile offline. Assert session, selected exercise, draft values, stopwatch timestamps, rest deadline, and committed sets. No run coverage is requested here because runs remain unbuilt.

7. **MAJOR — TEST BLIND SPOT: The required device matrix is absent.**  
   [playwright.config.ts:7](/Users/rabah/projects/anygym/playwright.config.ts:7), [playwright.config.ts:28](/Users/rabah/projects/anygym/playwright.config.ts:28)  
   Projects cover three iPhones, all in WebKit. Pixel, compact Galaxy, small Android and the 320-wide floor are missing. Some specs additionally skip every profile except one.  
   **Counterexample:** A 360-wide Chromium layout can cover a primary action while every configured project passes.  
   **Exact fix/test:** Add Chromium projects at 412×915, 360×780 and 360×640, plus a 320-wide floor. Run completed logging, picker, sheet, History and plan flows on them without platform skips; assert no horizontal overflow, unobscured primary controls, and successful save/edit/delete/undo.

8. **MAJOR — TEST BLIND SPOT: SPEC 13’s console-error gate is optional.**  
   [fixtures.ts:99](/Users/rabah/projects/anygym/tests/fixtures.ts:99)  
   The automatic fixture enforces network restrictions only. Error checking depends on individual specs installing and asserting their own arrays.  
   **Counterexample:** An otherwise passing spec without that helper can emit `console.error` or an unhandled rejection and stay green.  
   **Exact fix/test:** Add an automatic context-wide error collector before navigation, including newly opened pages, and assert it during teardown. Add harness tests that deliberately emit a console error and an unhandled rejection, verifying each makes the test fail. Remove broad message-substring exemptions from application tests.

9. **MINOR — STILL OPEN: Six warmup-only sessions hide working history.**  
   [history.ts:40](/Users/rabah/projects/anygym/src/db/history.ts:40)  
   Sessions are limited before progression filters warmups and other load kinds. Six recent warmup-only appearances hide an older genuine working session, producing “First time.” Reproduced.  
   **Exact fix:** Select qualifying working sets of the requested equipment/load kind before collecting and limiting sessions.  
   **Test blind spot:** [history.test.ts:85](/Users/rabah/projects/anygym/src/db/__tests__/history.test.ts:85) asserts the current intermediate warmup result, then tests only an entirely warmup history. Add one older working session followed by six warmup-only sessions; assert Last time still uses the working session and suggests 140 lb after 12 reps at 135 lb.

10. **MINOR — STILL OPEN: A display ceiling prevents logging real stack weights.**  
    [StackSelector.tsx:39](/Users/rabah/projects/anygym/src/components/load/StackSelector.tsx:39), [load.ts:492](/Users/rabah/projects/anygym/src/lib/load.ts:492)  
    Pins above 300 lb / 140 kg cannot be selected, and valid higher prefills are rejected.  
    **Exact fix:** Support a confirmed machine maximum or extendable pin range. Separate the initial displayed range from load validity and use the confirmed range consistently throughout progression and prefill.  
    **Test blind spot:** [progression.test.ts:359](/Users/rabah/projects/anygym/src/lib/__tests__/progression.test.ts:359) hardcodes rejection of 305 lb, cementing the implementation limit. Configure a 400 lb machine, select/log/reload 350 lb, and assert progression permits 355 lb.

11. **MINOR — TEST BLIND SPOT: No 130% text-size acceptance test.**  
    [fullscreen-1.10b.spec.ts:48](/Users/rabah/projects/anygym/tests/fullscreen-1.10b.spec.ts:48)  
    Geometry tests run at default text size. Existing long-name checks do not establish the SPEC 13.3/13.4 combination of enlarged text and narrow screens.  
    **Counterexample:** A long exercise title wraps beneath a fixed control only at 130%; default-size screenshots remain clean. This is an untested risk, not a confirmed layout defect.  
    **Exact test to add:** Run completed screens at 130% effective text size on SE and 320-wide profiles, using the longest shipped names. Assert text is unclipped, controls do not overlap, primary actions remain reachable, and the current set needs no scrolling.

12. **MINOR — TEST BLIND SPOT: Two years of history are never exercised.**  
    [history.test.ts:102](/Users/rabah/projects/anygym/src/db/__tests__/history.test.ts:102)  
    History fixtures contain only a few sessions; SPEC 13.3 explicitly requires two years of generated history.  
    **Counterexample:** Rendering or querying thousands of sets stalls History or workout entry while every small fixture passes. This is a coverage gap, not a measured performance failure.  
    **Exact test to add:** Seed 730 dated sessions with 20 sets each, including warmups, multiple gyms and both units. Open History, inspect oldest/newest details, start a workout and verify its expected Last time/Next, then log and reload. Assert exact counts and values, no errors, reachable controls, and agreed screen-ready timing limits.