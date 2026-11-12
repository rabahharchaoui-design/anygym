Codex brief for PLAN item 3.6f, written Nov 13 02:09 at commit cdaf4b29. SPEC.md wins if they disagree; code may have moved since.

Read-only brief for [PLAN.md:63](/Users/rabah/projects/anygym/PLAN.md:63). No files edited; tests were not run. Existing functions below are named as shipped; proposed functions are explicitly marked.

**1) Applicable SPEC and acceptance checks**

- SPEC §§0, 2, 9.1–9.2: offline operation, transactional writes, honest numbers, preserved history, backup compatibility.
- SPEC §§7.2–7.4: reuse movement ladders, goal prescriptions, beginner set limits, and the single duration estimate.
- SPEC §14 items 2, 5, 6, 14: focus selection, schedule, minutes, reveal, and editable saved answers.
- SPEC §15: focus adds 2–4 weekly sets; recovery and missed-workout coaching must respect schedule style.
- SPEC §22 rules 1–8: compound order, priority muscles, helper protection, safe pairs, rest, balance, and experience limits.
- SPEC §§10, 13, 23: Titanium Glass, shared controls/motion, accessible targets, safe areas, reduced motion, phone recordings.
- SPEC §18 supplies future reminder behavior; 3.6f should establish fixed-only eligibility without building push infrastructure.
- Accept: schedule offers fixed, flexible, and week-to-week; flexible users need not select weekdays.
- Accept: flexible Today shows the next rotation day, with no overdue pile or “Missed workouts” card.
- Accept: week-to-week asks once per local training week, including the first visit after Monday.
- Accept: eight existing focus tiles remain; parts open in a sheet; Posture, Grip, Mobility are additional choices.
- Accept: Whole body balance clears other choices; choices and ranking survive Back, reload, redo, and restore.
- Accept: focus allocations share a bounded budget, respect muscle/time caps, and survive final fitting.
- Accept: reveal and day cards explain actual retained work; constrained plans name prioritized and unserved choices.
- Accept: add-day/add-minutes actions rebuild the preview; “Looks good” still lands on Today without starting a session.
- Reconcile before implementation: SPEC §22 explicitly allows fewer sets for beginners; 12–20 focused sets is therefore a target, not a beginner minimum.

**2) Files and implementation**

- `src/lib/intake/options.ts`: add `ScheduleStyle` and hierarchical focus option data with stable persisted IDs.
- Preserve existing broad `FocusId` values for old profiles; introduce a separate detailed `FocusPickId`.
- `src/lib/intake/funnel.ts`: extend `IntakeAnswers`, `setAnswer()`, `sanitizeAnswers()`, `visibleScreens()`, and draft handling.
- Remove only `focus` from `NOT_USED_YET`; preserve the independently hidden `win`, `when`, and `bodyweight` screens.
- Make empty focus an explicit valid balanced choice or provide Skip; removing `NOT_USED_YET` currently changes Continue validation.
- Split this 502-line file first: move answer types and sanitization into focused intake files, retaining existing exports.
- `src/screens/intake/ScheduleStep.tsx` **new**: three schedule choices first, then weekday chips where applicable.
- Keep the existing `weekdays` step ID to reduce draft/test churn; make its body a combined schedule form.
- Default new unspecified schedules to flexible; preserve explicit choices and old weekday-based schedules.
- Place is asked later than schedule, so never overwrite a schedule when `place` becomes `hotel` or `mix`.
- `src/screens/intake/FocusStep.tsx` **new**: top-level tiles, selected-part summaries, exclusive balance behavior.
- `src/screens/intake/FocusPartsSheet.tsx` **new**: reuse `Sheet`, `Chip`, and `Button`; provide group-wide selection.
- `src/screens/intake/FocusRank.tsx` **new**: ordered priorities with drag handles and accessible Move up/Move down controls.
- Require ranking for 5+ picks; also expose it for four picks, matching 3.6f’s stated manual test.
- `src/screens/intake/stepBody.tsx`: dispatch focus and schedule to these components instead of generic `MultiChoice`.
- `src/screens/intake/IntakeScreen.tsx`: update `COPY`, `WHY`, validation, and schedule-specific CTA explanations.
- Reuse `Steps.tsx` controls and `BodyIcons.tsx`; add focused CSS modules using existing tokens and motion.
- `src/lib/plan/focus.ts` **new, explicitly required by PLAN**: own all allocation policy.
- Proposed exports: `normalizeFocusPicks()`, `focusBudget()`, `countHardSets()`, and `curateFocus()`.
- Inputs should include ranked priorities, prescribed days, eligible candidates, experience caps, and a duration callback.
- Return changed days plus requested/retained extras, total sets, shortfalls, and reasons; no database or React imports.
- `src/lib/generator/focus.ts`: replace current policy with an adapter to that module; do not maintain two allocators.
- `src/lib/generator/plan.ts`: integrate curation into `generatePlan()` and audit final days after every fitting operation.
- `src/lib/generator/fit.ts`: make `addMoves()`, `densify()`, and `fillUp()` respect remaining muscle and focus budgets.
- `src/lib/generator/trim.ts`: preserve focus priorities where possible and report extras removed by `trim()`.
- Use `minutesOf()` → `estimateDayMinutes()` for every tentative replacement, added set, and finisher.
- `src/lib/generator/types.ts`: extend `GeneratorInput`, `Applied`, and `RawPlan`; bump `GENERATOR_VERSION` from 2.
- `src/lib/generatorRules.ts`: retire duplicated focus-budget constants; retain goal/split/prescription rules.
- `src/data/focus.ts` **new**: bind reviewed exercise facts to detailed priorities; keep data lookup outside pure allocation policy.
- Existing `Muscle` merges lats/upper back into `back`, chest regions into `chest`, and excludes obliques.
- Use reviewed source muscles/overrides for finer distinctions; never infer upper-chest or posture suitability from names.
- `src/lib/intake/yourPlan.ts`: extend `generatorInputOf()` and `yourPlanWords()` for detailed priorities and real totals.
- `src/lib/intake/planPick.ts`: make `weekOf()` calendar-label only fixed schedules; update customization detection.
- `src/screens/intake/Reveal.tsx`: render explanations and actionable shortfalls; rebuild after changing days/minutes.
- Its `chosenId` initializes once today: explicitly reconcile selection when rebuilt `mine.id` changes.
- Its answers save only on mount today: ensure rebuild actions persist the current answers before final acceptance.
- `src/lib/plans.ts`: extend `Plan`/`PlanDay` metadata and `normalizePlan()` so saved focus explanations survive reload.
- `src/screens/today/DayCard.tsx`: flexible “Next up” wording, rotation progress wording, and one short focus explanation.
- `src/screens/plans/PlanCard.tsx` / `PlanViewer.tsx`: surface saved plan/day explanations where those cards are rendered.
- `src/lib/plan/schedule.ts` **new**: pure next-day selection, recovery eligibility, and deferred rotation advancement.
- Proposed exports: `resolveNextDay()` and `advanceRotation()`; accept explicit `now` and recorded training facts.
- `src/db/schedule.ts` **new**: read recent training, save weekly choices, and persist rotation changes transactionally.
- `src/hooks/useSchedule.ts` **new**: expose that state to Today; new screens must not import database helpers directly.
- `src/screens/today/WeekScheduleSheet.tsx` **new**: once-per-week chips, save/retry, and a quiet reopen action.
- `src/screens/TodayScreen.tsx`: use one resolved day for display, time selection, Preview, and Start.
- `src/db/workoutStart.ts`: preserve `startPlanDay()` idempotence and revalidate automatic selection before session creation.
- `src/screens/today/startPreview.ts` and Quick’s preview path must start the same resolved day shown on Today.
- `src/db/planState.ts` / `src/lib/finishPlan.ts`: integrate deferred progression into `applyFinishProgress()` and `finishPlanPosition()`.
- `src/screens/today/useCoach.ts` / `src/lib/coach/today.ts`: explicitly suppress missed-day candidates for flexible schedules.
- `src/db/coachData.ts`: update `weekdaysOf()`; merely returning undefined still triggers frequency-based missed-day estimates.
- `src/screens/workout/UpNext.tsx`, `src/lib/quickFocus.ts`, and generator day ordering: consume shared normalized focus mappings.
- `src/MAP.md`: document the new `lib/plan/` folder and responsibility boundaries.

**3) Data model and Dexie**

- Recommended additive answers: `scheduleStyle?: 'fixed' | 'flexible' | 'weekly'` and ordered `focusPicks?: FocusPickId[]`.
- Keep legacy `focus?: FocusId[]`; normalize it only when detailed picks are absent, preserving broad historical intent.
- Persist weekly selections on `Profile`, for example `{ weekKey, weekdays, answeredAt }`; do not overwrite fixed weekdays.
- Persist deferred rotation order on `PlanState`, for example `pendingDayIndices?: number[]`.
- Absence of new fields must preserve current plan position and legacy finish behavior.
- Infer old schedules with saved weekdays as fixed; unspecified legacy schedules remain rotation-compatible.
- Extend `Applied`/saved definition metadata with total sets, allocated extras, unmet priorities, and per-day explanations.
- Existing stores suffice: schema version is currently 11; optional unindexed fields require no Dexie version bump.
- If implementation adds stores/indexes, append version 12; never modify shipped versions.
- `src/db/types.ts` is 433 lines: split touched record types behind compatible exports rather than growing it.
- `src/lib/backupChecks.ts`: validate optional weekly/rotation fields; `src/lib/backup.ts` must validate pending indices against plan length.
- Keep immutable generated definitions in `plans.definition`; include version and explanation-relevant inputs in generated identity.
- `saveGeneratedPlan()` skips an existing ID, so different retained metadata must not collide under the same ID.

**4) Tricky edges and handling**

- Count hard working sets only; exclude warmups, stretches, cardio, and mobility time.
- Count a physical added set once against the shared budget; credit each verified target without multiplying allocation cost.
- Deduplicate parent/child overlap: Arms plus Biceps must not buy two independent biceps bonuses.
- Upper-chest work also contributes to overall chest’s ceiling; do not create separate additive 20-set allowances.
- Posture and Mobility are objectives, not muscles: use reviewed movement/time targets and honest explanations.
- Grip requires verified forearm/grip work; helper involvement alone must not become an invented direct-set count.
- Apply replacement → added set → short finisher in that order, preserving protected compounds and required rest.
- Recount after pairing, trimming, densifying, and filling; current `Item.extra` attribution cannot prove final muscle totals.
- Use elapsed milliseconds for 48 hours; reuse `TIRED_MS`/`trainedWithin()` from `src/lib/quickWhy.ts`.
- Use local `weekKey()` from `src/lib/coach/time.ts` for Monday prompts; calendar boundaries and recovery are different clocks.
- Include actual logged exercises across gyms and Quick workouts, respecting swaps; ignore undated imports and uncertain facts.
- Consolidate existing recent-training readers: Quick, coach recovery, and Up next currently use different inclusion rules.
- Recovery selection scans pending days in stable rotation order; move blocked days later without deleting or reshuffling them.
- If every pending day conflicts, show an honest recovery state and next eligible time; do not select a conflicting day automatically.
- Do not reset the cycle merely because the numerically last day finished early; wait until all pending days advance.
- Preserve the existing 60% finish threshold, partial rings, Finish Undo, and active-workout Resume behavior.
- Weekly prompts must survive offline reload and write failure; opening/dismissing a sheet is not a successful answer.
- Flexible set counts describe an N-session rotation target; avoid claiming those sets were completed in a calendar week.

**5) Tests to write**

- `src/lib/plan/__tests__/focus.test.ts`: budget bands, ranked allocation, balance exclusivity, overlap deduplication, deterministic output.
- Assert replacement precedes growth, growth respects experience caps, and no focused muscle exceeds 20 retained hard sets.
- Assert unattainable 12-set targets produce explicit shortfalls rather than fabricated completion claims.
- `src/lib/__tests__/generator-3.6f.test.ts`: at least 500 deterministic cases, covering pick counts 0–11, days 2–6, all minute choices.
- Stratify coverage rather than relying on random sampling; additionally test every supported detailed pick and the maximum selection.
- Assert final normalized duration equals `Applied.minutes`; focus never makes an otherwise fitting day exceed its budget.
- Assert equipment, never-list, go-easy, compound order, safe pairs, and beginner/comeback constraints remain enforced.
- `src/lib/plan/__tests__/schedule.test.ts`: stable deferral, no starvation/lost days, wrap, all-blocked state, 47:59 versus exactly 48 hours.
- Simulate dated sessions for recovery properties; a generated plan alone cannot prove the runtime 48-hour rule.
- Add DST/timezone, Monday first-open-on-Tuesday, and flexible-no-missed-card cases.
- `src/lib/__tests__/intake-3.6f.test.ts`: sanitization, old broad answers, schedule switching, ordered picks, draft Back/reload.
- `src/db/__tests__/schedule-3.6f.test.ts`: weekly save/retry, atomic start selection, double Start, partial Finish, and Finish Undo.
- Extend migration/backup tests: old v11 data opens unchanged; new fields round-trip; invalid pending indices are refused.
- Extend `chain-3.6y.test.ts` and `yourPlan` tests: revealed counts equal retained saved-plan counts after normalization.
- `tests/verify-3.6f.spec.ts`: real intake through flexible schedule, four priorities, ranking, reveal, Looks good, Today, Start.
- Test 5+ priorities, balance clearing, part-sheet dismissal, accessible reorder, reload persistence, and redo from Settings.
- Test fixed weekday labels, weekly once-only prompt, recovery deferral, all-blocked state, and no flexible missed-workout card.
- Update `tests/golden/01-intake-first-workout.spec.ts`; retain its real logging assertion and existing golden journey limit.
- Import fixtures from `tests/fixtures.ts`; reuse `simulateSafeAreas()`/`checkLayout()` and add vertical touch-drag support where needed.
- Run WebKit projects `"iPhone SE"` and `"iPhone 17 Pro Max"` at 100%/130%, plus reduced motion and offline reload.
- Assert 48pt targets, reachable CTA, unclipped sheets, no horizontal overflow, and zero console errors; record both phone flows.
- Validate typecheck, Vitest, build/size/duplicate guards, golden suite, targeted phone specs, and ux-critic ≥9.

**6) Risks and conflicts with built code**

- PLAN’s premise is stale: `applyFocus()` already distributes weekly extras—3 per group, or 2 each for arms—and ordering uses focus.
- The missing work is detailed targeting, shared budget, final accounting, explanations, and schedule-aware recovery.
- PLAN’s “any number” exceeds its 0–11 test range: the listed parts plus three objectives already yield 20 detailed choices.
- At high counts, “top two +3/+4, every other +1/+2” cannot coexist with a 12-set ceiling; document a capped allocation with explicit unserved picks.
- SPEC §15 caps extras at 2–4; interpret PLAN’s “about +3” within that range, with global/time/experience limits taking precedence.
- `advancePlan()` currently wraps on the last numeric index; directly reusing it for deferred days loses rotation balance.
- `fillUp()` and `addMoves()` can restore volume after curation; an allocator-only patch will not enforce final caps.
- Curated plans must remain as written under SPEC §22; show unmet focus honestly rather than silently modifying them.
- Frozen generated plans have exact-output tests; version changes require deliberate regeneration/review of their three JSON fixtures.
- Schedule and focus changes affect many existing intake assertions; preserve stable selectors and update behavioral expectations deliberately.
- CI flakes 3.6u and matrix debt 3.6v are already queued; report inherited failures separately and never retry them into apparent success.