Codex brief for PLAN item 3.6v, written Nov 13 02:14 at commit cdaf4b29. SPEC.md wins if they disagree; code may have moved since.

Read-only review completed. No files changed and no tests run; the diagnoses below are source-backed leads to verify.

1) Scope, applicable SPEC, and acceptance checks

- [PLAN.md:64](/Users/rabah/projects/anygym/PLAN.md:64) defines 3.6v: classify the 164 failures, fix each cause, commit by spec-file group, then pass the full matrix.
- Finish 3.6u first; its CI stabilization and ten successful GitHub check runs are a separate prerequisite.
- Use [reports/matrix-3.6x.md](/Users/rabah/projects/anygym/reports/matrix-3.6x.md) as the initial inventory, preserving every failed test/device pair.
- The report establishes preexisting debt, not current root causes: “same” and “flip” are comparison labels, not app-bug/flakiness classifications.
- SPEC 0: preserve exact loads, honest demos, offline operation, and saved data.
- SPEC 4.3–4.4: preserve exact/variant/none behavior, readable form information, compact workout presentation, and accessible demo viewing.
- SPEC 9.4: owner review still supports decisions, corrections, progress, and export.
- SPEC 13.1–13.2: dismissible hints, immediate feedback, smooth transitions, reduced motion, and no layout shifts.
- SPEC 13.3: zero unexpected console errors/rejections; controls at least 48 CSS px; usable text through 130%; double taps and reloads remain safe.
- SPEC 13.4: all seven configured phones; safe areas respected; no document overflow, clipped controls, or fixed bars covering actions.
- SPEC 13.5 and 20.2: the current workout row, reps, and check remain usable without scrolling during logging/rest.
- SPEC 14 and 20.3: intake choices remain reachable; Quick Keep/Swap/Never preserve their existing meanings and tap budgets.
- SPEC 23.1–23.4: native navigation, sheet stacking, motion proof, and before/after screenshots plus recordings on SE and 17 Pro Max.
- Acceptance: every reported failure has evidence, classification, changed files, and a passing rerun; the final full matrix has zero failures.
- Existing justified skips must be accounted for; no new skips, reduced assertions, broad error exemptions, or retries to obtain green.

2) Implementation locations and contents

- Create `reports/matrix-3.6v.md`: ledger keyed by spec/title/project, reproduction command, failure evidence, classification, fix commit, and verification result.
- Start each group with `PW_FULL_MATRIX=1 npx playwright test tests/<file>.spec.ts --project="<phone>" --workers=1 --retries=0`.
- Record production build revision and worker count; compare isolated and concurrent results before classifying timing failures.
- [tests/helpers/touch.ts](/Users/rabah/projects/anygym/tests/helpers/touch.ts): fix `gesture()` portability; it currently unconditionally calls WebKit’s `document.createTouch/createTouchList`.
- Keep `touchFlick()`, `touchDrag()`, and `touchHold()` signatures; feature-detect construction and retain hit-testing, identifiers, coordinates, cancellation, and touch-only dispatch.
- Add a Chromium-native touch stream for validation if needed; a synthesized `TouchEvent` alone does not exercise browser gesture arbitration.
- [tests/helpers/quick.ts](/Users/rabah/projects/anygym/tests/helpers/quick.ts): retain explicit pointer coverage in `swipe()`; wait for the actual card/decision state before the next gesture.
- Consolidate equivalent local gesture helpers in `review-3.5i.spec.ts`, `verify-3.5i.spec.ts`, and `verify-3.5v.spec.ts`; distinguish touch tests from pointer tests.
- [src/components/deck/SwipeDeck.tsx](/Users/rabah/projects/anygym/src/components/deck/SwipeDeck.tsx): change only if correct input still fails; trace `begin()`, `move()`, `finish()`, `fly()`, and pointer-to-touch takeover.
- Preserve `busy`, `swallow`, horizontal-axis detection, cancellation, hold timers, same-slot swaps, and `canSwap` resistance.
- This file is exactly 400 lines: extract focused gesture logic before growing it; keep the exported `SwipeDeck`/`DeckProps` interface.
- [src/screens/today/WelcomeTour.tsx](/Users/rabah/projects/anygym/src/screens/today/WelcomeTour.tsx): audit `measure()`, `tabsTop()`, scrolling, and the viewport passed to `wordsTop()`.
- Its vertical bounds currently use `EDGE = 16`, not the phone’s top/bottom safe insets; make placement respect actual available space.
- `src/screens/today/WelcomeTour.module.css`: allow wrapped copy and a compact action row without shrinking Next/Skip targets.
- [src/lib/welcomeTour.ts](/Users/rabah/projects/anygym/src/lib/welcomeTour.ts): adjust `wordsTop()` only where placement math needs correction; keep `tourSteps()` and reducer semantics.
- [src/screens/quick/ConceptCard.tsx](/Users/rabah/projects/anygym/src/screens/quick/ConceptCard.tsx), `ConceptCard.module.css`: repair metadata wrapping while preserving `countLine()` output.
- Current `.metaPart { white-space: nowrap }` groups whole fragments; keep separator/time grouping readable without overflowing beside the muscle map at 130%.
- `src/screens/review/Fit.module.css`: fix the actual fixed-screen layout, shrinking flexible demo space before controls or necessary copy.
- Check `ReviewBar`, `ReviewNotice`, `ReviewActions` in `src/screens/review/FitChrome.tsx`, plus `FitFace()` and `UndoChip()`; preserve reserved notice/action space.
- Measure [src/ui/IconButton.tsx](/Users/rabah/projects/anygym/src/ui/IconButton.tsx) through `BackButton.module.css`: the outer hit target is 48 px; its decorative face is 44 px.
- `verify-3.5e.spec.ts:145`: wait for ancestor arrival transforms to settle before diagnosing the reported 47.996 px target.
- [src/screens/workout/ExerciseView.tsx](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx): preserve `SHORT_SCREEN = '(max-height: 600px)'` and its compact header behavior.
- `ExerciseHead()` in `src/screens/workout/ExerciseHead.tsx` opens `ExerciseSheet` from that compact header; the tall hero opens `DemoViewer`.
- Update stale routing expectations in `exercise-screen-2.2b.spec.ts`, `exercise-sheet-2.3.spec.ts`, and `codex-2.0k.spec.ts`; retain full demo-access assertions.
- For real sheet crowding, adjust `ExerciseSheet.module.css` and `FormDemo.module.css`; preserve demo → muscles → cues order and pinned Back/Close.
- [src/components/load/PlateDiagram.module.css](/Users/rabah/projects/anygym/src/components/load/PlateDiagram.module.css): investigate `.tray[data-many='true'] .trayPlate`, which explicitly removes the 48 px minimum.
- Keep `PlateDiagram()`/`TrayPlate()` arithmetic untouched; make small-width inventory access retain full targets and a single workout tray row.
- For remaining narrow-phone failures, inspect `TypeItSheet`, `ImportSetSheet`, and `PickExerciseSheet` using their existing shared `Sheet`/`SheetFooter`.
- `src/screens/intake/ExerciseDeck.module.css`, `src/components/deck/Deck.module.css`, and `Curate.module.css`: resolve minimum-height/large-text pressure before changing intake behavior.
- For workout/coach failures, target `Workout.module.css`, `SetTable.module.css`, `SetRowParts.module.css`, `Effort.module.css`, `Coach.module.css`, and `PRBadge.module.css`.
- Only change `src/ui/nav.ts`, `Sheet.tsx`, `TabBar.tsx`, or `useSheetLayer.ts` after proving a shared defect; their blast radius covers nearly every flow.
- Timing groups: update `foundation-2.2e`, `polish-2.2d`, `motion-3.5w`, `celebrate-3.6b`, and `art-3.6h` specs using existing page-side measurement helpers.
- [src/ui/art/lazy.tsx](/Users/rabah/projects/anygym/src/ui/art/lazy.tsx): investigate `ArtScene()`/`afterPaint()` only if the FCP/resource ordering failure persists in isolation.
- Create no replacement Button, Sheet, card, load helper, or generic layout framework; reuse existing components and helpers.

3) Data model and Dexie migration

- No schema or persisted-model change is expected; [src/db/schema.ts](/Users/rabah/projects/anygym/src/db/schema.ts) currently exports `SCHEMA_VERSION = 11`.
- Keep `profile.welcomeTour` as `pending | done`; retain `armWelcomeTour()` and `finishWelcomeTour()` behavior.
- Core review remains JSON under `kv['review:v1']`; preserve verdicts, notes, timestamps, and export shape.
- Candidate decisions remain in `candidateReviews`; gesture/layout fixes must not alter approval application or review ordering.
- Keep workout sessions, sets, load snapshots, draft journals, and Quick dislike records unchanged.
- If reproduction unexpectedly requires persistence changes, document why and add an additive previous-version migration test preserving every set; do not casually bump Dexie.

4) Edge cases and handling

- WebKit touch construction and Chromium touch arbitration are separate concerns; prove which fails before modifying `SwipeDeck`.
- One physical gesture can produce pointer and touch events; takeover must yield exactly one decision and no lingering hold timer.
- Below-threshold drags, vertical movement, cancellation, and a release outside the card must restore a usable card without saving.
- A swap changes exercise identity at the same index; wait for `data-exercise`, not merely an unchanged “2 of N” counter.
- A long press must open Fix/Never once, suppress its trailing click, and leave subsequent buttons usable.
- Tour targets can be absent, scroll, or arrive late; omit missing targets and keep lit Start/tab controls tappable.
- Compact tour copy may wrap: replace `<30 px` text-height assumptions with complete text, non-overlap, safe placement, and reachable actions.
- Review at 320×568/130% must retain controls, reason chips, and a meaningful demo; do not conceal overflow to make measurements pass.
- Seven 48 px plate targets exceed 320 px before padding; preserve target size and inventory access instead of squeezing seven undersized buttons.
- Separate document overflow from an intentional internal tray scroller; confirm any changed tray interaction against existing picker requirements.
- Measure resting hit boxes separately from press/arrival transforms; retain a strict 48 px layout requirement and only justified subpixel measurement tolerance.
- Some tests enlarge root rem sizes; others multiply computed text sizes. Preserve both intended coverage modes without double-scaling descendants.
- Performance measured under nine workers can reflect host contention; preserve thresholds and investigate isolated failures as real performance defects.
- `art-3.6h.spec.ts` already chooses the best of up to three attempts: replace that retry-to-green pattern with deterministic measurement and explicit evidence.

5) Tests to add or strengthen

- Vitest: extend `src/lib/__tests__/welcomeTour-3.5u.test.ts` with safe-bound placement, wrapped-card heights, and constrained-space cases for `wordsTop()`.
- Retain its missing-target, reducer, and `shouldShowTour()` checks; geometry changes must not rearm completed tours.
- Vitest: retain `src/db/__tests__/welcomeTour-3.5u.test.ts` assertions that completion persists and older profiles remain unchanged.
- If gesture state is extracted, add `src/components/deck/__tests__/gesture-3.6v.test.ts` for thresholds, velocity direction, cancellation, takeover, and exactly-once completion.
- Keep DOM hit-testing and actual event delivery in Playwright; node-only Vitest cannot establish browser gesture correctness.
- Retain `src/db/__tests__/review-3.5v.test.ts`: legacy decisions, Undo, and byte-compatible export survive the interaction changes.
- Extend `src/ui/__tests__/nav.test.ts` only for reproduced navigation fixes: superseded transitions resolve safely and clear navigation state.
- Playwright touch: strengthen `review-3.5v.spec.ts` on Chromium and WebKit; assert approve/wrong, three-second reasons, hold-to-Fix, Undo, reload, and stored identities.
- Playwright Quick: strengthen `quick-3.5a.spec.ts` and `curate-3.5f.spec.ts`; assert one swap, same movement, dislike increment once, no-fit behavior, and exact Undo.
- Playwright tour: strengthen `intake-3.5u.spec.ts` and `verify-3.5u.spec.ts`; test full/hotel/no-plan paths, missing Quick target, outside tap, Escape, Skip, and completion after reload.
- Playwright metadata: extend `verify-3.5d.spec.ts:182`; all durations at 100%/130%, no leading separator, intact time text, and no overflow.
- Playwright review targets: retain `verify-3.5e.spec.ts` minimums after settling; include long names, reason chips, and the Undo-visible state.
- Playwright compact demo: assert compact header → form sheet → full viewer at ≤600 px; retain tall hero → viewer coverage above that breakpoint.
- Playwright picker/import: repair the listed `verify-1.5`, `verify-1.6`, `plates`, `picture-2.0d`, and `verify-3.2` failures without weakening exact-load assertions.
- Playwright workout: cover current-row visibility during rest, folded warmups, PR popover bounds, and effort on the day list in the affected `verify-3.8*` specs.
- Run changed UI groups on **iPhone SE** and **iPhone 17 Pro Max**, then the affected Android/320 projects; these two iPhones alone cannot close this item.
- Use `simulateSafeAreas()`, `checkActiveWorkout()`, and existing control audits; add screenshots/recordings at normal and 130% text with reduced-motion coverage.
- Performance: warm prerequisites, arm measurement before input, measure inside the page, and assert real completion; avoid sleeps standing in for readiness.
- Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and the golden journeys after the relevant changes.
- Final proof: `PW_FULL_MATRIX=1 npx playwright test --retries=0`; preserve normal concurrency coverage and report every remaining skip.

6) Risks and conflicts with built code

- The matrix report includes transient iPhone 15/17 Pro Max failures despite its clean-rerun summary; account for those rows explicitly.
- Compact-header behavior was already documented in PLAN 3.5h; forcing the hero back onto 320 px phones would regress workout usability.
- Several old specs encode historical copy/layout assumptions; compare each assertion with SPEC and the latest completed item before changing product behavior.
- SPEC 13.3 requires 48 px targets although section 23 also mentions 44 px; preserve the stronger 48 px hit-area requirement.
- Existing demo timing is 1.35/0.15 seconds while SPEC 4.4 contains older timing text; flag that discrepancy without bundling a timing redesign.
- Shared deck changes affect intake, Quick, replacement, core review, and candidate review; regression-test all consumers.
- `PlateDiagram.module.css` and `Import.module.css` are each 542 lines; split a touched oversized file by concern without changing behavior.
- Keep new files around 300 lines; never raise size/duplication baselines to accommodate this cleanup.
- Existing screen-to-database exceptions may only shrink; new extraction must follow the hook boundary.
- 3.6w owns approval-load ordering, load resistance, machine horn counts, and durable-write fixes; avoid absorbing that separate work.
- `playwright.config.ts` defaults CI to one retry; pass `--retries=0` explicitly for acceptance evidence.
- Finish with one commit per spec-file group, shared fixes attributed to their first group, and the complete zero-failure matrix before marking 3.6v done.