Codex brief for PLAN item 4.6d, written Nov 20 01:11 at commit 55ac5e0a. SPEC.md wins if they disagree; code may have moved since.

# Implementation brief: PLAN 4.6d

**Sequence:** Build after 4.4d is merged, as required by [PLAN.md](/Users/rabah/projects/anygym/PLAN.md:64). Re-read the merged GPS filter, tracker and summary before choosing final caption wording; 4.4d also touches the summary and may change the rule.

## 1. Specification and acceptance

- [SPEC §12.2–12.3](/Users/rabah/projects/anygym/SPEC.md:280): gaps appear dashed; GPS processing and gap behavior are pure and tested.
- The current implementation retains up to the first `GAP_SEC` seconds of a gap and excludes held time and bridged distance from average pace.
- [SPEC §15](/Users/rabah/projects/anygym/SPEC.md:427): show a recovery note when the same muscles are trained on consecutive days; recommendations must be specific and honest.
- [SPEC §4.3 and the no-bad-data rule](/Users/rabah/projects/anygym/SPEC.md): use only known exercise muscles; do not infer a muscle from a shared body shape.
- Acceptance: the dashed-route caption on both the finish screen and saved-run detail explains conditional gap distance, retained moving time, and exclusion of bridged distance from average pace.
- Acceptance: a GPS gap **up to and including 300 seconds** with implied speed **at most 8 m/s** is eligible for straight-line distance; a longer or faster gap adds none.
- Acceptance: the caption does not promise distance for every eligible gap: the current tracker can suppress an on-the-spot gap as stillness.
- Acceptance: if yesterday has `outer hips` and `glutes`, and today has only `glutes`, the coach can name `glutes`; the reverse direction also works.
- Acceptance: matching is by individual known labels, deduplicated and deterministic; a shared drawing alone never creates a match.
- Acceptance: existing active-workout, kept-day, recommendation-card and rest-day suppression behavior remains intact.
- Both fixes need regression tests that fail on the current code before implementation.

## 2. Files and implementation

- [src/lib/run/summary.ts](/Users/rabah/projects/anygym/src/lib/run/summary.ts:22): update `DASHED_NOTE` and its comment after 4.4d lands.
- Suggested wording: “A GPS gap up to 5 minutes may add its straight-line distance if the speed is believable. Longer or faster gaps add no distance. Any added gap distance counts in the total, but not in average pace.”
- Preserve the existing sentences about manual pause and the first `GAP_SEC` seconds, unless the merged engine changes them.
- [src/screens/run/RunSummary.tsx](/Users/rabah/projects/anygym/src/screens/run/RunSummary.tsx:63) and [src/screens/history/RunDetail.tsx](/Users/rabah/projects/anygym/src/screens/history/RunDetail.tsx:52) already consume `DASHED_NOTE` only when a dashed route exists; normally no edits needed.
- [src/lib/muscles.ts](/Users/rabah/projects/anygym/src/lib/muscles.ts:130): port `ownRegionLabels` from branch `grok-build-4.6c-1119-2046`.
- Return distinct, sorted target labels for a shared region; preserve `ownShoulderLabel`’s specific shoulder-part behavior.
- Keep `ownRegionLabel` as the existing public string API, joining those labels with ` and ` or returning `null`.
- [src/db/coachData.ts](/Users/rabah/projects/anygym/src/db/coachData.ts:89): port the backup’s `muscleWords` and make `primaryWords(exerciseId)` call it with `infoForExercise(exerciseId).muscles`.
- For each primary-shaded region, collect individual `ownRegionLabels` using primary targets only; use `regionWord` for a single-muscle region; deduplicate.
- Keep `primaryNames` and its string-valued API for existing consumers.
- `recoveryRegions` already calls `primaryWords` for both days; keep its session, work-set, uncertainty, plan-day and finisher filters.
- [src/lib/coach/today.ts](/Users/rabah/projects/anygym/src/lib/coach/today.ts:131): `recoveryLine` already intersects exact labels and limits the message to two; no change should be needed.
- Review the backup branch’s focused implementation and test; port selectively, not the branch wholesale.
- No new source folder is needed, so `src/MAP.md` needs no update.

## 3. Data model and migration

- No Dexie schema, version, stored row, backup format or migration change is needed.
- `CoachData.recovery` remains `{ yesterday: string[]; next: string[] }`, computed on read.
- Existing saved runs and workouts remain readable; the caption describes the tracker’s rules, not a newly stored field.

## 4. Edge cases

- `judgePoint` currently treats exactly 300 seconds and exactly 8 m/s as eligible: use inclusive boundary language.
- A gap is classified only after `GAP_SEC`; a manual pause is a separate break and adds neither distance nor moving time across the pause.
- `addPoint` can suppress a gap while truly still; say “may add,” not “always adds.”
- A long or implausibly fast gap still starts a new route segment; its unknown straight-line distance is not counted.
- `rowPace` uses `timedM` and subtracts `heldSec`; preserve those semantics and the fallback for older rows.
- Do not split arbitrary display strings on `" and "`: a label can itself contain those words. Extract distinct labels from muscle targets.
- Pass no secondary targets to recovery matching; otherwise a helper muscle could produce a false warning.
- Unknown exercises or unresolved muscles contribute no label and must not generate a recovery claim.
- `front delts` and `side delts`, or `lats` and `mid back`, share drawings but must not match unless the actual labels match.
- Sorting joined labels changes their display order for existing `ownRegionLabel` callers; inspect affected assertions and UI for unintended wording changes.
- Preserve `recoveryLine`’s singular/plural wording, maximum two names and priority rules.

## 5. Tests

**Vitest — write the failing regressions first:**

- Extend [src/lib/__tests__/recoveryNames-4.6c.test.ts](/Users/rabah/projects/anygym/src/lib/__tests__/recoveryNames-4.6c.test.ts:1): construct a shared glute-region target with both labels; assert each label matches the corresponding single-label day in both directions.
- Assert duplicates and reversed target order produce the same sorted `ownRegionLabels`; assert `ownRegionLabel` remains a joined string.
- Retain and extend negative cases for press versus lateral raise, row versus pulldown, unknown muscles and secondary-only targets.
- Add a focused `muscleWords` test using synthetic `MuscleMapData`: primary labels are separate, duplicate labels collapse, unrelated secondary labels do not appear.
- Add a Dexie-backed `coachData` test in `src/db/__tests__/`: seed a dated finished session and plan day, then assert the derived intersection and resulting `recoveryLine`; also check warm-up and uncertain sets do not supply evidence.
- Update [src/lib/run/__tests__/fixes-4.4c.test.ts](/Users/rabah/projects/anygym/src/lib/run/__tests__/fixes-4.4c.test.ts:19): replace the obsolete unconditional exact sentence with assertions for conditional distance, no distance for longer/faster gaps, pace exclusion and retained clock explanation.
- Extend [src/lib/gps/__tests__/geo-filter.test.ts](/Users/rabah/projects/anygym/src/lib/gps/__tests__/geo-filter.test.ts:81): test 300 seconds and just over, plus 8 m/s and just over, using controlled haversine distances.
- Add or extend tracker tests to verify eligible bridge distance is counted but excluded from `timedM`, while rejected bridge distance is zero; cover stillness and manual pause.
- Run the focused tests, then `npm run test` and `npm run build`.

**Playwright — WebKit on both requested phone projects:**

- Add `tests/fixes-4.6d.spec.ts`; reuse `tests/fixtures`, `tests/helpers/run`, `stubTiles` and `checkLayout`.
- Create a run with a dashed GPS gap; assert the finish screen displays the corrected caption, then open the saved run in History and assert the same caption there.
- Assert a run without a dashed segment does not show the caption; check layout and text wrapping on both screens.
- Seed a finished yesterday workout and a suitable next plan day with a real shared-label overlap; assert the Today `coach-line` names the actual common muscle.
- Seed a no-overlap shared-shape case and assert no false recovery line; arrange fixtures so a higher-priority coach card or rest day cannot mask the result.
- Run `npx playwright test tests/fixes-4.6d.spec.ts --project="iPhone SE" --project="iPhone 17 Pro Max"`.

## 6. Risks and conflicts

- **4.4d is unchecked on this branch.** Do not build 4.6d against its pre-merge behavior; revalidate thresholds, captions and tests after merge.
- SPEC §12.2 says gap time is not counted, while the completed 4.4a rule retains the first `GAP_SEC`; document that existing specification conflict rather than silently changing clock behavior.
- PLAN says “under 8 m/s,” but current `judgePoint` uses `<= 8`; the brief follows the implementation’s inclusive boundary, subject to 4.4d.
- PLAN 4.6b is also unchecked and changes stillness/gap distance handling; coordinate its eventual merge and rerun tracker and caption tests.
- The existing 4.4c test hard-codes the incorrect caption, so changing only the source will break it.
- `ownRegionLabel` has non-coach callers; sorting is observable there, so regression-check those callers instead of assuming the change is recovery-only.
- No tests were run and no files were edited for this brief.