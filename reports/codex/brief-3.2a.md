Codex brief for PLAN item 3.2a, written Nov 05 16:50 at commit a0df12e. SPEC.md wins if they disagree; code may have moved since.

Item **3.2a is at [PLAN.md:85](/Users/rabah/projects/anygym/PLAN.md:85)**. All four issues remain in the current source; [the originating review](/Users/rabah/projects/anygym/reports/codex/ui-3.2.md) identifies the same causes. No files edited; tests were not run.

**1) Applicable SPEC sections and acceptance checks**

- **SPEC 9.3:** preserve exercise grouping, every source set, uncertainty reasons, editable sets, unknown-load questions, and explicit confirmation before writing.
- **SPEC 0 and 4.3:** keeping an unmatched name must retain honest absent catalog data; no inferred photos, muscles, or exercise match.
- **SPEC 10:** use existing colors, typography, bottom sheets, safe areas, and inputs of at least 16px.
- **SPEC 13.1:** explain the two counts in plain language and expose the correction action visibly.
- **SPEC 13.3:** accessible names, minimum 48px targets, 130% text support, and zero unexpected console errors or rejected promises.
- **SPEC 13.4:** fixed actions reserve space; no horizontal overflow; results remain reachable on short phones and the 320px floor.
- **SPEC 23.1–23.3:** retain shared sheet navigation, dismissal, focus handling, icon family, and reduced-motion behavior.
- **SPEC 23.4:** capture before/after screenshots and main-flow recordings on iPhone SE and iPhone 17 Pro Max; feel score must reach 8.
- Acceptance: picker results scroll in a bounded body whose bottom ends above the entire footer, including its helper text.
- Acceptance: review explicitly distinguishes exercises needing answers from sets needing checking; resolving one category updates only the applicable counts.
- Acceptance: an uncertain, actionable set has a visible correction label and chevron inside its existing full-row button.
- Acceptance: “Keep the name” has persistent, visible consequence text before tapping, with results present and with no results.

**2) Files to change or create**

- Change [src/screens/settings/PickExerciseSheet.tsx](/Users/rabah/projects/anygym/src/screens/settings/PickExerciseSheet.tsx), specifically `PickExerciseSheet()` and its private `Body()`.
- Import `SheetFooter`; change the wrapper to `<Sheet … scroll footer>` and render the bottom actions through `<SheetFooter>`.
- Move both “Keep the name” and `skipText(skipCount)` into that slot; retain `onKeepName`, `onSkip`, and `data-testid="pick-keep-name"`.
- Put visible helper text above the action row: `Save as “{fileName}” without exercise photos or muscle info.`
- Give that helper an ID and associate the Keep button with `aria-describedby`; retain a useful accessible name.
- Remove this picker’s use of `styles.footer`: it is sticky inside scrolling content and causes the reported overlap.
- Override `styles.body`’s viewport-sized `min-height` locally; adding the reserved footer without this adjustment wastes body space.
- Keep `closestFirst()`, `normalizeName()`, `CATALOG_ONLY`, search filtering, `catalogPick()`, and selection callbacks unchanged.
- Rename “In your plans” to “Exercises,” including its section label: this list contains all `PLAN_EXERCISES`, not the user’s chosen plans.
- Change [src/screens/settings/ImportReview.tsx](/Users/rabah/projects/anygym/src/screens/settings/ImportReview.tsx), specifically private `Review()`.
- Replace the bare `{unsure} to check` line with explicit categories, e.g. `3 exercises need answers · 2 sets to check`; omit zero categories.
- Keep the existing CTA sequence: `Checking…`, `Answer N questions`, `Nothing new to import`, then `Import N sets`.
- Add visible `Check set` plus `ChevronRight` to actionable uncertain rows; this covers both ambiguous reps and missing weights accurately.
- Preserve the current row `onClick`: exercise pick first, load kind second, otherwise `ImportSetSheet`.
- Change [src/screens/settings/Import.module.css](/Users/rabah/projects/anygym/src/screens/settings/Import.module.css): add local picker-body, footer-helper, and set-action styles.
- Keep footer actions in a wrapping-safe two-column row; helper text occupies its own full-width row and uses `overflow-wrap: anywhere`.
- Allow the row affordance to wrap below the content at narrow widths; never shrink targets or truncate the uncertainty reason.
- Reuse `ChevronRight` and `ICON_STROKE` from [src/ui/icons.ts](/Users/rabah/projects/anygym/src/ui/icons.ts); mark the decorative chevron `aria-hidden`.
- Create proposed `src/lib/import/review.ts` with pure `reviewCounts(plan)` and `isSetToCheck(set)` helpers, extracting the existing count semantics for focused Vitest coverage.
- Reuse [src/ui/Sheet.tsx](/Users/rabah/projects/anygym/src/ui/Sheet.tsx) unchanged: its footer portal and flex layout already reserve space outside `.scrollBody`.

**3) Data model and Dexie migration**

- **No migration required.** [src/db/schema.ts](/Users/rabah/projects/anygym/src/db/schema.ts) currently has `SCHEMA_VERSION = 9`; leave shipped schemas and version unchanged.
- Keep `ReviewChoices.picks`, `.kinds`, and `.edits` as the review’s transient answers.
- Derive counts from `ImportPlan`; do not persist counters or add a separate checked-state flag.
- Exercise count remains `plan.open.length`, which counts exercise groups needing either selection or loading answers.
- Set count retains the current predicate: uncertain, not individually skipped, and reason different from `ASK_LOAD`.
- Exclude skipped exercises and already-imported sessions from that set count.
- Keep `KEEP_NAME → nameTarget(fileName) → nameOnlyId(fileName)` in [exerciseMatch.ts](/Users/rabah/projects/anygym/src/lib/import/exerciseMatch.ts).
- Kept names still write `import:<trimmed name>` with `catalogId: null`, `match: 'none'`, and `by: 'you'`.
- Preserve `writeImport()`, `importHash`, `importSeq`, additive `importMap`, transaction boundaries, and `undoImport()`.

**4) Tricky edge cases and handling**

- One exercise can need both a match and a load kind: `Mystery machine` initially contributes **one** open exercise, then remains open after matching.
- Therefore the count must describe exercise groups, not promise a total number of remaining modal interactions.
- Answering all exercise questions must leave the set warning visible; uncertainty currently does **not** block importing.
- Saving “Looks right” clears ambiguity only when the model can justify it; a missing weight remains uncertain and reps-only.
- Individually skipped sets leave the check count; skipping an exercise removes all its outstanding work; “Bring back” restores it.
- Already-imported rows remain disabled; do not display an active correction affordance on them.
- For unresolved exercise/load questions, label the row’s available action honestly or suppress the set-edit affordance until its prerequisites are answered.
- Use `Check set` rather than parsing arbitrary reason strings to infer whether the problem concerns reps or weight.
- Long names and filenames containing quotes must render as ordinary React text; helper text must wrap without expanding the sheet horizontally.
- A filtered list with one result and a list with no results must both retain the helper and actions without the sheet collapsing unexpectedly.
- On the 320×568 floor at 130% text, scroll content rather than overlaying it or reducing the 48px targets.
- Test first, middle, and last results: partial clipping at a scroll boundary is acceptable only when the whole row can be scrolled into view above the footer.
- Preserve shared Back/Escape/grabber dismissal and focus restoration; footer controls must remain inside the dialog’s focus cycle.

**5) Tests to write and assertions**

- Create proposed `src/lib/import/__tests__/review-3.2a.test.ts`; exercise the pure helpers against real `planImport()` output.
- Synthetic mapping fixture: assert initial counts are three open exercises and two sets to check.
- Choose a catalog target for `Mystery machine`: assert it still contributes one open exercise until `chooseKind()` answers loading.
- Mark the ambiguous squat set `ok`: assert the check count decreases while the missing-weight set remains.
- Skip a set, skip an exercise, and bring it back: assert the corresponding count changes without modifying parsed source data.
- Supply existing session hashes: assert already-imported sessions contribute neither outstanding sets nor exercise questions when nothing fresh remains.
- Assert `ASK_LOAD` contributes through the exercise-question category rather than being counted again as a set warning.
- Reuse [exerciseMatch-3.2.test.ts](/Users/rabah/projects/anygym/src/lib/import/__tests__/exerciseMatch-3.2.test.ts) for existing keep-name mapping and unchanged-hash regression coverage.
- Create proposed `tests/import-3.2a.spec.ts`; import `test` and `expect` from `./fixtures` for the existing network guard and error trap.
- Mark layout cases `@matrix`; explicitly run WebKit projects `iPhone SE` (375×667), `iPhone 17 Pro Max` (440×956), and `320 floor` (320×568).
- Picker geometry: assert scrolling-body bottom is above footer top; scroll first/middle/last results into view and verify full target visibility and hit testing.
- Repeat geometry at 100% and 130% text, with long names, no matches, one match, and both plan/catalog sections.
- Reuse `simulateSafeAreas()`, `checkLayout()`, and `checkControls()` from [tests/helpers/layout.ts](/Users/rabah/projects/anygym/tests/helpers/layout.ts).
- Keep-name consequence: assert actual visible helper text before tapping, both with results and without; an `aria-label` assertion alone is insufficient.
- Keep-name flow: tap it, import, and assert `import:Moon press` plus null catalog mapping; do not merely test that the sheet closed.
- Count flow: assert explicit categories initially, after exercise answers, after checking the ambiguous set, and after skipping/restoring an exercise.
- Edit flow: tap the visible correction affordance, verify `Check this set`, save changed reps, and assert the row updates and its warning clears.
- Navigation: search, dismiss, reopen, and verify the existing fresh-search behavior and retained review choices.
- Update the old `In your plans` assertions in [tests/import-3.2.spec.ts](/Users/rabah/projects/anygym/tests/import-3.2.spec.ts) and [tests/verify-3.2.spec.ts](/Users/rabah/projects/anygym/tests/verify-3.2.spec.ts).
- Update [tests/import.spec.ts](/Users/rabah/projects/anygym/tests/import.spec.ts)’s `/^\d+ to check$/` expectation for the explicit set category.
- Run focused Vitest/import Playwright suites first, then `npm run test` and `npm run build`; record SE/Pro Max videos and inspect before/after screenshots.

**6) Risks and conflicts with built code**

- `Picker.module.css` is shared with the workout picker; changing its global body/footer rules would expand scope and risk Quick workout regressions.
- Simply adding `SheetFooter` leaves the inherited `min-height: calc(88dvh …)` in place; the local picker-body adjustment is essential.
- The existing 130% test only compares rows with the Keep button’s top; it does not prove rows clear the whole footer or remain hittable.
- That test’s `/Keep as|Skip/` filter misses the current “Keep the name” label; replace it with explicit locators.
- Preserve the existing three-visible-rows assertion on SE/Pro Max where feasible; separately prove every result is reachable on the smaller floor.
- An action label must match the row’s prerequisite routing; otherwise “Check set” can unexpectedly open an exercise picker.
- Do not make unresolved set warnings a new import gate: existing tests deliberately import uncertain, missing-weight sets.
- Keep [ImportSetSheet.tsx](/Users/rabah/projects/anygym/src/screens/settings/ImportSetSheet.tsx)’s weight validation, cross-unit handling, and pinned Save footer intact.
- `importDraft` is memory-only; reloading returns to Settings. Persistence changes belong outside this polish item.
- Existing intake code is already present despite PLAN 3.3 remaining unchecked; use the normal guarded fixtures, which mark intake complete.
- The review report’s “In your plans” wording issue is a small adjacent correction; include the rename without adding saved-plan filtering.
- Use synthetic fixtures only. This item does not require opening or copying `~/anygym-private/g-history.json`.
- Before implementation visuals, follow SPEC 23’s local design guidance; no new dependencies, catalog generation, or shared-sheet redesign is needed.