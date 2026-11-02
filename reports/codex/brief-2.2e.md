Codex brief for PLAN item 2.2e, written Nov 01 16:24 at commit 559e38b. SPEC.md wins if they disagree; code may have moved since.

Read-only review complete; no files edited and no tests run. Item **2.2e is at [PLAN.md:71](/Users/rabah/projects/anygym/PLAN.md:71)**.
Existing foundations should be extended: motion tokens, `useNav()`, `Sheet`, `Segmented`, `Toast`, `Button`, and finish-screen records already exist.

**1) Applicable SPEC and acceptance checks**

- **SPEC 0, 2:** honest records, offline operation, exact saved values, transactional writes; presentation changes must not alter workout data.
- **SPEC 1:** retain HashRouter and `/anygym/`; use the installed `motion/react`, with no additional animation library.
- **SPEC 5.4–5.5:** all weight calculations and conversions belong in `src/lib/load.ts`; never convert stored loads.
- **SPEC 6:** free-weight history crosses gyms; stacks, plate machines and Smith comparisons stay within their gym.
- **SPEC 6:** no displayed estimated 1RM in v1; choose **best set volume, weight × reps**, which 2.2e explicitly permits.
- **SPEC 8, 21.1:** finish shows actual records, duration, sets and total lifted; warmups never earn PRs.
- **SPEC 10, 13.1–13.4, 23:** black/lime tokens, plain labels, 48px targets, safe areas, 130% text, responsive layouts and accessible controls.
- **SPEC 20.2–20.4:** checking stays one tap; preserve rest, last-working-set navigation and existing tap budgets.
- **Motion acceptance:** three canonical presets named tap/sheet/page; push/pop takes 180–280ms and slightly scales the outgoing page.
- Preserve SPEC 23.1’s distinct tab crossfade and shared elements; “one page transition” means one shared implementation.
- **Reduced-motion conflict:** SPEC permits crossfades; 2.2e requests none for navigation. Use immediate page changes; retain appropriate component fades.
- **Component acceptance:** all six requested components have real-screen usage and Playwright visual assertions, including selected/disabled states.
- **PR acceptance:** badge appears only after a qualifying set commits; never during the exercise’s first comparable session.
- **Finish acceptance:** lead with the largest verified improvement and the actual set; show a plain saved summary when there is no PR.
- **Performance acceptance:** WebKit iPhone 15 Pro proves press feedback under 100ms, uninterrupted transitions and no unexpected layout movement.
- Read both supplied inspiration documents; builder/critic must also read SPEC 23’s three `.design-ref/skills/*/SKILL.md` files.
- Limit work to two gmini rounds; report incomplete criteria explicitly and require ux-critic 9+ before marking the item complete.

**2) Files and implementation**

- Extend [src/ui/motion.ts](/Users/rabah/projects/anygym/src/ui/motion.ts): add canonical `TAP_SPRING`, `SHEET_SPRING`, `PAGE_SPRING` and shared directional page variants.
- Keep compatibility exports for existing `SPRING`, `SNAPPY`, `GENTLE`, `FADE`, `DUR`, `EASE`, `STAGGER` and `motionFor()` callers.
- Add `src/ui/PageTransition.tsx`: reusable page-layer animation, reduced-motion handling, and inert/aria-hidden outgoing content.
- Extend [src/ui/nav.ts](/Users/rabah/projects/anygym/src/ui/nav.ts): retain `useNav()`, `kindBetween()`, `depthOf()` and `withTransition()`; centralize direction and transition ownership.
- Preserve `sheetHistory().whenSettled()`, numeric history navigation, `replace`, navigation state and rejected-transition handling.
- Update `src/styles/transitions.css`: outgoing push translates left and scales slightly; pop reverses; replace animated brightness filters with opacity-based dimming.
- Update `src/styles/tokens.css`: keep CSS duration/easing mirrors consistent with the canonical motion values.
- Update `src/components/AppShell.tsx` and `.module.css`: replace its separate CSS fallback with the shared page layer.
- Update `src/screens/workout/WorkoutScreen.tsx`: remove local `FALLBACK_PUSH`/`FALLBACK_FADE`; consume shared variants without remounting workout ownership.
- Update `src/ui/EdgeSwipe.tsx`: match outgoing scale/dimming during drag and cancellation; completed swipes still navigate with `kind: 'none'`.
- Update `src/App.tsx`: cover standalone Finish/Review routes and a development component preview; avoid a pathname key around the entire app.
- Audit actual navigation bypasses: `HistoryScreen.tsx`, `PlansScreen.tsx`, `SettingsScreen.tsx`, `TodayScreen.tsx`, `review/ReviewScreen.tsx`, `ui/IconButton.tsx`, and `components/load/DumbbellWheel.tsx`.
- Route screen-changing links through the shared navigation path; same-screen location-state cleanup should use `kind: 'none'`.
- Add `src/ui/ChoiceCard.tsx` and `.module.css`: controlled selection, Lucide icon, label, optional description, reserved selection ring and lime selected border.
- Animate the ring’s inner fill with scale; expose selection accessibly and preserve native button activation and focus.
- Use `ChoiceCard` in `src/screens/workout/BarChoiceSheet.tsx`; preserve `knownBars()`, `onPick`, `onAsk` and unknown-weight prompts.
- Add `src/ui/SlidingToggle.tsx` and `.module.css`: generic controlled two/three-option control, one sliding lime pill and keyboard selection.
- Make `src/ui/Segmented.tsx` delegate to it, preserving existing props, radiogroup semantics, test IDs and one `tick()` per change.
- This immediately updates Settings’ muscle-body selector and other existing `Segmented` consumers without duplicating persistence.
- Add `src/ui/BottomCTA.tsx` and `.module.css`: compose `Button`, support disabled reason/busy state, and reserve measured footer space.
- Adopt it in `src/screens/workout/FinishScreen.tsx` and `src/screens/plans/PlanViewer.tsx`; adapt `Finish.module.css` and `plans/Plans.module.css`.
- Preserve Finish’s “Next up”/Change controls and PlanViewer’s existing `use()` guard; never overlap tab, resume or rest docks.
- Extend `src/ui/Toast.tsx` and `.module.css`; keep `ToastMessage`, `toast`, `bottom` and caller-owned actions compatible.
- Keep deletion timers and Undo execution in `WorkoutScreen`/`sessionRecovery`; Toast remains presentation, not a second Undo system.
- Add `src/ui/PRBadge.tsx` and `.module.css`: small lime “PR”, accessible “Personal record”, reserved footprint and one entrance per newly earned set.
- Extend [src/lib/records.ts](/Users/rabah/projects/anygym/src/lib/records.ts): retain `recordsFor()`/`bestSetOf()` and add a pure evaluator returning qualifying set IDs and a finish leader.
- Preserve existing heaviest/most-reps records; add a distinct best-set-volume result carrying set identity, previous score and improvement.
- Extend `src/lib/load.ts` only where needed for record scoring/ranking; reuse `setLifted()`, `totalLifted()`, `comparableWeight()` and existing formatting.
- Extend [src/db/history.ts](/Users/rabah/projects/anygym/src/db/history.ts): factor shared comparison-history retrieval from `workoutRecords()` into a helper usable during active sessions.
- Reuse `usableSets()`, `sessionsOfSets()`, `legacyBars()`, `historyKeyFor()` and `sameExerciseIds()` behavior; do not recreate filtering in React.
- Extend `src/screens/workout/useWorkout.ts`: expose record results keyed by committed set ID; retain the separate six-session progression history.
- Pass results through `ExerciseView.tsx` into `SetTable.tsx`; use `s.id` for logged-row keys instead of the current index key.
- Update `SetTable.module.css`: fit the badge inside existing row geometry; retain weight/reps widths and the complete SE first-screen table.
- Update `FinishScreen.tsx`: render the selected real win above stats, preserve saved confirmation, and retain the existing detailed records list.
- Add `src/ui/AppMarkLoader.tsx` and `.module.css`: draw the existing mark’s two SVG paths from `scripts/make-icons.mjs`, using accent tokens.
- Mount it during startup in `src/main.tsx`: invisible through 400ms, then a brief drawing; cancel its timer on completion/error.
- Preserve `restoreMirrors()` → `showApp()` ordering and `StartupError`; ordinary content continues using `Skeleton`.
- Add `src/screens/dev/UiDevScreen.tsx`, gated by `devToolsEnabled()`, showing deterministic states of all six components.

**3) Data model and Dexie**

- **No migration required:** `src/db/schema.ts` remains version 9; no PR table or persisted badge flags.
- Keep `WorkoutSet`, `Session`, submissions, journal, tombstones and backup formats unchanged.
- New record types belong in `src/lib/records.ts`; use set IDs and comparison keys, not visible row positions.
- Recompute from committed sets so edits, deletion, Undo, restore and imported-history corrections cannot leave stale persisted PRs.
- Read the historical baseline coherently; exclude the target session even after it becomes finished.
- Do not use `getPastSessions(..., 6)` as an all-time baseline; an older seventh-session record must still prevent a false PR.

**4) Tricky cases and explicit decisions**

- **First session:** require an earlier comparable working session; later sets within a first session never unlock badges.
- **Metric:** compare weighted set volume against the historical best and earlier eligible sets in current `order`.
- Example: previous best 185lb × 5; 185lb × 6 earns a badge; another 185lb × 6 ties and earns none.
- A historical 225lb × 5 beats 185lb × 6 by this metric; increased reps alone must not falsely qualify.
- **Biggest win:** proposed rule is largest proportional improvement over its own positive baseline; deterministic ties use workout order/set ID.
- Keep that ratio arithmetic in `load.ts`; never rank unrelated exercises by raw lifted volume.
- **Eligibility:** exclude uncertain/missing-load sets, warmups and drops; `failure: true` remains a working set under existing record policy.
- **Bodyweight/timed:** no weighted-volume claim without positive known resistance; retain existing bodyweight rep records and timed exclusion.
- **Units/equipment:** compare before display rounding; preserve dumbbell “each”, added-bodyweight labels, stack additions and legacy Smith ambiguity.
- **Mutation recovery:** failed logs get no badge; failed edits retain the committed result until accepted; Delete/Undo recalculates by set ID.
- **Read failure:** absence of history is not proof of a record; suppress the claim and expose retry without blocking normal press feedback.
- **Motion races:** rapid same-direction navigation needs transition identity, so an older completion cannot clear a newer transition’s state.
- **Fallback lifecycle:** outgoing visual layers must not duplicate active recovery, timer or logging side effects.
- **Loader:** no flash for quick startup, no perpetual loop, no delayed hide requirement, no movement with reduced motion.

**5) Tests to write**

- `src/lib/__tests__/records-2.2e.test.ts`: first-session suppression, strict volume improvement, ties, successive improvements and stable set IDs.
- Assert old `recordsFor()` heaviest/most-reps behavior remains intact; warmups/drops/uncertain sets cannot create new volume records.
- Assert leader ranking uses proportional improvement and deterministic ties; finish text names the exact qualifying set.
- Extend `src/lib/__tests__/load.test.ts`: scoring across kg/lb, dumbbell pairs, stack additions, added bodyweight, zero/missing reps and timed loads.
- Assert equivalent resistance does not become a PR through conversion noise; retain 100% `load.ts` line coverage.
- `src/db/__tests__/records-2.2e.test.ts`: active and finished evaluation agree; current/future sessions are excluded.
- Assert an older record beyond six sessions blocks a badge; aliases share history; machines/Smith obey gym boundaries.
- Assert uncertain imports and ambiguous legacy bars are excluded; committed edits, deletion and Undo update results.
- `src/ui/__tests__/motion-2.2e.test.ts`: canonical presets/variants, reverse direction and immediate reduced-motion page changes.
- Extend `src/ui/__tests__/nav.test.ts`: overlapping transitions, aborted transitions, fallback, `none`, popstate and sheet-history sequencing.
- Extend `src/ui/__tests__/components.test.tsx`: static accessible selected/disabled states, labels and decorative SVG hiding.
- Vitest currently uses Node/static rendering; exercise interactive behavior in Playwright rather than assuming a DOM test environment.
- `tests/foundation-2.2e.spec.ts`: import `test`/`expect` from `./fixtures`; snapshot every component’s normal, selected, disabled and reduced-motion states.
- Use `toHaveScreenshot()` with reviewed baselines; existing screenshot-writing helpers alone are not visual regression assertions.
- Assert two/three-option toggles, independent toggle instances, ChoiceCard activation, keyboard controls and disabled CTA non-activation.
- Assert Toast Undo fires once, survives unrelated rendering, wraps long copy, and clears above docks at 130% text.
- Assert loader absent before 400ms, visible during delayed startup, removed after success, and replaced by the existing startup error on failure.
- `tests/records-2.2e.spec.ts`: seed with `seedFinished()`/`dbPut()` from `tests/workout-helpers.ts`, then log through the real UI.
- Assert committed PR badge, first-session/tie exclusions, correct finish leader, plain no-PR finish and offline reload consistency.
- Assert edit-down removes qualification, Delete removes the badge, Undo restores it, and double taps create one set.
- `tests/navigation-2.2e.spec.ts`: test push/pop, tabs, shared hero, browser Back, sheet Back, rapid navigation and forced View Transitions fallback.
- Assert outgoing pages cannot receive taps/focus, no duplicate dialogs appear, and workout/rest state survives navigation.
- Run these on **WebKit iPhone SE 375×667 and iPhone 17 Pro Max 440×956**, including 130% text and reduced motion.
- Add a dedicated **iPhone 15 Pro** performance project/config; current `playwright.config.ts` has iPhone 15, not 15 Pro.
- `tests/performance-2.2e.spec.ts`: record pointer-down→first visible press frame, transition frame intervals and stable element bounds.
- Capture successful traces explicitly; current configuration retains traces only on failure. Playwright action traces alone do not prove compositor frame delivery.
- Use Safari timeline evidence alongside frame measurements; do not depend solely on Chromium-only tracing, throttling or layout-shift APIs.
- Save before/after shots and SE/Max videos under `reports/shots/2.2e/` and `reports/videos/2.2e/`; obtain simulator checks and critic review.
- Re-run `exercise-screen-2.2b`, `stay-2.0g`, `doubletap`, `journal-editors-2.0e`, existing record tests, then build/Vitest and the required matrix.

**6) Risks and conflicts with existing work**

- **2.2d is still unchecked:** it touches the same workout layout, row gestures, shared hero and performance paths; coordinate before implementing overlapping changes.
- **3.3 depends on these controls:** keep their APIs generic; do not build intake-specific timing or persistence into primitives.
- **3.8 duplicates live PR/finish celebration work:** record that 2.2e supplies this foundation so the coach reuses it.
- Existing `workoutRecords()` calls `finishedDetail()` and returns nothing for active workouts; calling it unchanged cannot deliver live badges.
- Existing records have only `exerciseId`, `kind`, `text`; strings cannot reliably identify the winning row or rank improvements.
- Existing shell fallback animates only the incoming page; workout fallback is separate. Updating tokens alone does not satisfy shared navigation.
- Existing `Button` already provides immediate press feedback and grey disabled styling; preserve it instead of rebuilding those behaviors.
- Existing `Sheet` owns focus, drag, nested history and footer slots; BottomCTA must not create a competing sheet footer.
- Existing `Toast` callers own durable Undo semantics; component refactoring must preserve deletion tokens, unresolved intents and Finish guards.
- Preserve the known 2.0i cross-tab Finish limitation; this visual foundation must not claim to fix it.
- Document both gmini rounds, measured evidence and remaining work in `reports/session-2.md`; partial green work does not justify checking off unmet 2.2e criteria.