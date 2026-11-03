**8 findings: 6 MAJOR, 2 MINOR.** Reviewed completed `[x]` features against the current working tree and earlier reports. No files edited. Typecheck and 51 targeted Vitest tests passed. Reproductions below used actual modules with in-memory IndexedDB; Playwright and physical iPhone behavior were not verified.

1. **MAJOR — NEW: Finish interrupts group Undo and permanently loses sets.**  
   [deleteUndo.ts:179](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:179), [deleteUndo.ts:205](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:205)

   Group Undo’s acceptance phase is absent from `running`. Finish therefore closes the manager before restoration starts. **Reproduced with the production workout manager:** Undo three deleted sets, immediately close and Finish → only one set saved, Undo rejected, zero recovery tombstones remaining.

   **Exact fix:** Register the entire group Undo synchronously as one tracked operation before its first `await`. Finish must await acceptance and restoration of every member. Closing must block new actions while allowing an already accepted group to finish restoring.

   **Blind spot/test:** [codex-2.0k.test.ts:291](/Users/rabah/projects/anygym/src/db/__tests__/codex-2.0k.test.ts:291) uses immediately successful acceptance mocks; its production-manager case awaits Undo before Finish. Add three real sets, delete with `{ hold: true }`, start `undoAll`, immediately call `close()` and `finishWorkout`. Require all three original IDs, orders and values to survive.

2. **MAJOR — STILL OPEN, additional variants: Duplicate Log acknowledges values it never saved.**  
   [rowLog.ts:209](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:209), [rowLog.ts:245](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:245)

   Tabs can independently produce revision 2 with different values. **Reproduced:** 17 reps already committed at revision 2; another tab submits 19 at revision 2 → success callback fires, 17 remains saved, and the 19-rep draft disappears. Separately, a failed receipt read defaults to the requested revision and produces the same loss even with different revisions.

   **Exact fix:** Give edits globally unique identities and persist the committed identity/value fingerprint in the submission receipt. Preserve conflicting input under a successor draft ID. Failed or missing receipt reads must leave reconciliation unresolved.

   **Blind spot/test:** [codex-2.0k.test.ts:266](/Users/rabah/projects/anygym/src/db/__tests__/codex-2.0k.test.ts:266) equates identical revisions with identical submissions. Add same ID/revision but 17 versus 19 reps; require saved 17, pending 19, and no landed callback. Repeat with different revisions while rejecting the post-commit receipt read.

3. **MAJOR — STILL OPEN, Log-transaction variant: A stale tab overwrites another tab’s pending weight.**  
   [drafts.ts:185](/Users/rabah/projects/anygym/src/lib/drafts.ts:185)

   `draftsDurableMerge()` lets clean cached rows replace authoritative rows when revisions are equal. **Reproduced:** with localStorage refusing writes, A retains 63 lb/revision 2; B subsequently persists 73 lb/revision 2. A’s unrelated Log merge changes IndexedDB back to 63 lb.

   **Exact fix:** Merge only dirty rows and explicit deletions into IndexedDB. Clean cached rows must adopt committed values. Allocate revisions transactionally across tabs and clear dirty markers only after persistence succeeds.

   **Blind spot/test:** [drafts-2.2e.test.ts:97](/Users/rabah/projects/anygym/src/lib/__tests__/drafts-2.2e.test.ts:97) tests a strictly newer stored revision. Add two hydrated module instances, blocked localStorage, conflicting revision-2 weights, then submit another exercise through `submitRow`. After restart, require 73 lb and the unrelated submission to survive.

4. **MAJOR — STILL OPEN, SPEC §13.3 coverage gap: Hard-kill tests avoid in-flight writes.**  
   [kill.spec.ts:85](/Users/rabah/projects/anygym/tests/kill.spec.ts:85)

   The browser is killed after visible state and database snapshots have settled. Termination during journaling, commit or reconciliation remains untested.

   **Counterexample:** settled drafts recover correctly, while termination after set commit but before draft cleanup duplicates or loses a row. This browser defect is **not established**.

   **Exact fix/test:** Add deterministic gates after journal persistence, before set commit, and after receipt commit before reconciliation. SIGKILL at each gate, reopen offline, and assert literal expected saved values and unchanged pending rows. Include termination between group Undo acceptance and restoration.

5. **MAJOR — STILL OPEN, SPEC §§13.3–13.4 coverage gap: Default acceptance runs omit four devices.**  
   [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47)

   Android projects and the 320-wide floor run only `@matrix` cases. Their kill and monkey tests are excluded from ordinary execution.

   **Counterexample:** an Android-specific recovery or stuck-navigation regression cannot fail the default suite because those cases never run there. No additional device defect is claimed.

   **Exact fix/test:** Make full-matrix execution the acceptance default; provide a separately named checkpoint subset. Validate test discovery by comparing normalized acceptance-test IDs across all seven projects, explicitly requiring kill and monkey cases.

6. **MAJOR — STILL OPEN, mocked interaction: “Swipe” coverage bypasses native touch handling.**  
   [loads.spec.ts:58](/Users/rabah/projects/anygym/tests/loads.spec.ts:58), [polish-2.2d.spec.ts:44](/Users/rabah/projects/anygym/tests/polish-2.2d.spec.ts:44), [monkey.ts:181](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:181)

   Wheel tests assign `scrollLeft`; row and monkey swipes use mouse dragging.

   **Counterexample:** `touch-action` blocks finger scrolling or causes `pointercancel`, while programmatic scrolling and mouse tests pass. A current physical-device failure is **not established**.

   **Exact fix/test:** Add native touch drags using Chromium touch injection and an iOS simulator/device driver. In Weight/Edit sheets, drag the wheel and verify the displayed selection persists through Done/Save. For rows, require horizontal touch movement to reveal Delete and vertical movement to scroll without deleting.

7. **MINOR — STILL OPEN: Another tab silently loses added or removed rows.**  
   [extraSets.ts:48](/Users/rabah/projects/anygym/src/lib/extraSets.ts:48), [extraSets.ts:84](/Users/rabah/projects/anygym/src/lib/extraSets.ts:84)

   Each tab permanently caches and rewrites the complete row-adjustment collection. **Reproduced:** A shows two added squat rows; B adds a bench row using its stale cache; persisted squat additions drop to one. Removal markers have the same overwrite path.

   **Exact fix:** Persist adjustments transactionally by session/exercise and removal markers by set identity. Refresh tab caches from committed state.

   **Test to add:** Extend [extraSets.test.ts:11](/Users/rabah/projects/anygym/src/lib/__tests__/extraSets.test.ts:11) with two isolated module instances sharing storage. Interleave squat and bench additions, then removal markers. Reload and require every adjustment to remain.

8. **MINOR — STILL OPEN, implementation-repeating assertion: Muscle-list completeness uses the production filter as its oracle.**  
   [muscles-2.2c.spec.ts:13](/Users/rabah/projects/anygym/tests/muscles-2.2c.spec.ts:13)

   The UI and expected list both call `exercisesForRegion()`. Their exact-membership comparison therefore cannot independently establish completeness.

   **Counterexample:** that helper accidentally omits a valid quad exercise; the rendered list and computed expectation omit it together. Separate sample assertions offer some protection, but this comparison adds none against that failure.

   **Exact fix/test:** Specify audited expected IDs independently for representative muscles, including primary, secondary-only and overridden shoulder cases. Compare the rendered IDs against those literals without importing the production filter. Require the tests to fail when a valid expected exercise is deliberately omitted.