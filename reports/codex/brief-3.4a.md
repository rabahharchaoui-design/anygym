Codex brief for PLAN item 3.4a, written Nov 05 16:39 at commit 084c813. SPEC.md wins if they disagree; code may have moved since.

Read-only brief for [PLAN.md:86](/Users/rabah/projects/anygym/PLAN.md:86), item **3.4a**. Inspected `CLAUDE.md`, `SPEC.md`, `PLAN.md`, and relevant source at `084c813`; no files edited or tests run. Names explicitly marked **new** below are proposed APIs.

**1) Applicable SPEC sections and acceptance checks**

- **22:** put deterministic, pure ordering, suggestion, pairing, rest, effort, and plan-analysis logic in `src/lib/order.ts`.
- Order compounds before accessories; honor focus within compatible ordering constraints; prevent helper-muscle fatigue before pending compounds.
- Keep calves/core late and static stretches last; preserve appropriate dynamic warmups before lifting.
- Permit opposing/non-competing pairs; reject same-target pairs and pairing with the protected heavy compound.
- Rest: heavy compounds 120–180 seconds, strength compounds 180+; other compounds about 120; isolation 60–90.
- Effort: compounds 1–2 reps left, isolation 0–1; beginners 2–3 throughout, expressed in plain words.
- Up next: after an exercise’s last working set, show one eligible exercise, one factual explanation, one-tap Add, and two alternatives when available.
- Suggestions consider actual gym equipment, completed/pending work, goal, focus, recent 48-hour training, and `easyOn`/`never` answers.
- Curated plans remain as written until Apply; collapsed “Coach tips (N)” belongs on the plan viewer, never the active workout.
- Provide Apply per tip, Apply all, persistent Hide tips, and a durable `<plan> (coach tuned)` copy with the original one tap away.
- Detect the six SPEC 22 issue families: hinge placement, static stretches, short compound rests, competing press pair, frequency, excessive core work.
- Assert no false order flags for pull-ups/rows before curls, presses before triceps, forearms/calves late, or Arnold press leading shoulders.
- **7.2–7.4, 14–15:** share equipment/pattern facts with 3.4; consume intake answers; expose ordering for generator 3.5 and trimming 3.6.
- **20–21:** retain set-table behavior, manual multi-select, pair navigation, logging tap budgets, and existing progression/history ownership.
- **0, 2, 4.3–4.5, 6, 9:** honest metadata, transactional persistence, exact exercise identities, offline operation, backup/restore compatibility.
- **13, 23:** zero console errors, 48-point targets, safe areas, 130% text, reduced motion, and reachable current set on SE.

**2) Files and concrete implementation**

- **Create `src/lib/order.ts`:** export **new** `orderDay()`, `suggestNext()`, `canPair()`, `restTarget()`, `effortTarget()`, `analyzePlan()`, and `applyPlanTips()`.
- Inputs should contain resolved exercise facts, prescriptions, intake context, gym eligibility, committed training exposure, and an injected `now`.
- Return stable IDs and structured reason codes; keep Dexie, React, JSON imports, clocks, and display copy outside this module.
- `orderDay()` should use stable dependency ordering, then compound tier/focus/original position; report unresolved metadata or contradictory constraints.
- `suggestNext()` filters first, ranks second, deduplicates, and returns `{ best, alternatives }`; never return an unsupported candidate.
- `analyzePlan()` returns stable tip IDs, affected day/item identities, evidence, and explicit patches; avoid mutable block-index-only references.
- **Create `data/order-metadata.json` and `src/data/order.ts`:** reviewed compound/accessory role, helper dependencies, static/dynamic classification, pair compatibility, restriction tags, and deterministic ranks.
- Reuse 3.4’s equipment requirements and pattern mappings once implemented; do not create an independent second eligibility engine.
- Resolve plan IDs through `src/data/muscles.ts::EXERCISE_MAP`; preserve `none` mappings without inventing catalog facts.
- **Change [src/lib/planWorkout.ts](/Users/rabah/projects/anygym/src/lib/planWorkout.ts):** retain `upNext()` for existing-row navigation; give recommendations the distinct name `suggestNext()`.
- Extend `quickEntry()` to accept a persisted prescription; its current `QUICK_DEFAULT` always supplies three sets, 8–12 reps, 90 seconds.
- Keep `dayWorkout()` faithful to the selected plan definition; do not automatically sort curated plans there.
- **Change `src/screens/workout/useWorkout.ts::useWorkout()`:** load profile/recommendation context and persisted quick prescriptions with explicit loading/error states.
- Add shared exercise resolution for `nameOf()`, `loadTypeOf()`, and `barOf()` if 3.4 introduces catalog IDs; current implementations primarily recognize plan IDs.
- **Create `src/db/orderContext.ts`:** **new** `getOrderContext()` reads recent finished sessions and their working sets across gyms, plus current committed work.
- Exclude the current session from historical exposure; exclude warmups and imported sessions whose timestamps represent file order.
- **Change `src/screens/workout/WorkoutScreen.tsx::onLogged()`:** trigger suggestions from successful final-set commits, using existing `advancesAfterLog()` semantics.
- Replace the quick-completion branch’s transient “Every set is done” experience with a durable recommendation surface; retain planned-row navigation when work remains.
- **Create `src/screens/workout/UpNextCard.tsx` and `UpNextCard.module.css`:** primary suggestion, short why, Add, expandable Other ideas, and pending/error states.
- Render it on the Quick workout list after the existing completion transition; preserve it through list navigation and reload by deriving completion from stored work.
- **Change `DayList.tsx`/`DayList.module.css`:** host the card without covering exercise rows, Finish, the rest dock, or existing actions.
- **Change `src/db/workouts.ts`:** add **new** `addSuggestedExercise()` that atomically appends the exercise and stores its prescription.
- Re-read the active session and gym inside that transaction; reject stale/unsupported suggestions and finished sessions; repeated Add must be a no-op.
- Route the write through `logQueue.mutate()` in `WorkoutScreen.tsx`; open the exercise only after persistence succeeds.
- **Create `src/screens/plans/CoachTips.tsx` and `CoachTips.module.css`:** collapsed count, explanation per issue, Apply, Apply all, Hide, and accessible save/error feedback.
- **Change `src/screens/plans/PlanViewer.tsx`:** render CoachTips, resolve saved definitions, and show “View original” on tuned copies.
- **Create `src/db/plans.ts`:** **new** `getPlan()`, `listPlans()`, `applyCoachTips()`, and `hidePlanTips()`; static `planById()` remains the bundled fallback.
- **Create `src/hooks/usePlan.ts`:** reactive saved-or-bundled lookup; distinguish pending, missing, and failed reads.
- **Change `src/db/planState.ts`:** update `choosePlan()`, `choosePlanUndoable()`, `setNextDay()`, `weekFor()`, and `planDayOf()` to resolve saved plans.
- **Change `src/db/workouts.ts::startPlanDay()`/`planProgress()`:** resolve the saved definition within transactions; include `db.plans` wherever nested reads require it.
- Update `TodayScreen.tsx`, `useWorkout.ts`, `FinishScreen.tsx`, `PlansScreen.tsx`, and `usePlanCatalogIds.ts` to use the shared resolver.
- Update `src/db/history.ts::warmUpIds()`, `screens/history/historyWords.ts::workoutTitle()`/`exerciseNamer()`, and `ui/ResumeBar.tsx::dayLabel()` for tuned IDs.
- Keep intake’s `PLANS` and place tiles curated by default; show saved tuned copies separately without duplicating their original place tiles.
- No generator exists yet: provide the pure contract now; actual generator integration occurs in 3.5.

**3) Data model and Dexie**

- Current [src/db/schema.ts](/Users/rabah/projects/anygym/src/db/schema.ts) is **v9**; `plans` and `planDays` stores already exist, although shipped plans are static.
- Extend `src/db/types.ts::Plan` with optional `definition: import('../lib/plans').Plan`, `tunedFrom`, `parentPlanId`, `appliedTipIds`, and `orderRulesVersion`.
- Store the complete normalized definition in `plans`; the existing minimal `planDays` records cannot hold prescriptions.
- Use `source: 'generated'` for an app-produced tuned copy; keep its bundled original ID in `tunedFrom`.
- Make saved definitions immutable: another Apply creates a new revision ID, preserving definitions referenced by existing sessions.
- Persist cumulative applied tip IDs; repeated application/retry against the same parent and tip set must return the same result.
- Add optional `Profile.hiddenCoachTipPlanIds?: string[]`; key hiding to the original plan family.
- Add optional `Session.quickPrescriptions?: Record<string, ...>` containing sets, reps/seconds, rest, and effort target for added suggestions.
- Keep prescribed weights out of this snapshot unless supplied through existing progression/load logic; never invent a starting load.
- These are unindexed additive fields: **no Dexie version bump is required** for this design.
- If adding a store/index instead, append v10; never edit shipped schema versions.
- Extend `src/lib/backup.ts::RECORD_CHECKS` for nested plan definitions, provenance, hiding preferences, and quick prescriptions.
- Update `planStateOk()` to validate saved-plan bounds against definitions in the backup, rather than only bundled `planById()`.
- Existing `TABLE_NAMES` includes `plans`; verify `restoreMerge()` and `restoreReplace()` preserve definitions and references without overwriting local revisions.
- Applying tips must never rewrite original JSON, historical sets, existing session IDs, or an in-progress workout’s definition.

**4) Tricky edge cases**

- **Ordering versus follow-up isolation:** bench → triceps is eligible only when it will not pre-fatigue triceps before pending overhead/bench work.
- Apply dependency constraints to the chosen day/pending work, not every compound available in the entire gym.
- **Focus versus compound priority:** arm focus cannot move curls ahead of pending rows; prioritize within valid tiers and explain the result.
- **Pair overlap:** comparing every secondary-muscle intersection would wrongly reject allowed chest/back pairs; use reviewed performance-relevant compatibility.
- **“Heaviest” across implements:** barbell totals and dumbbell-per-hand loads are incomparable; protect designated main lifts without cross-implement weight arithmetic.
- **Warmups:** static leg stretches lack `warmup: true`; `isStretchName()` also matches Dynamic Hip Flexor Stretch. Use explicit static/dynamic metadata.
- Preserve the dynamic warmup before lifting; moving static holds must retain their seconds and notes.
- **Apply all:** unpairing, rest changes, reorder, and core shortening overlap; apply identity-based patches in a defined order, then re-analyze.
- **Frequency changes:** include concrete proposed exercises/sets/days; reject duplicates and re-check equipment and pairing constraints.
- **48-hour history:** use real timestamped sessions across gyms; unknown/import-order dates cannot justify recovery claims.
- **Restricted/empty pool:** return fewer alternatives or none; offer the existing picker/Finish instead of inventing two options.
- **Unknown equipment:** bodyweight pull-ups still need a bar; a dumbbell press needs a bench. `gymSupports()` alone cannot authorize suggestions.
- **Unknown load:** eligible equipment with an unset bar/start weight remains eligible; the existing first-use picker handles it.
- **Completion edits:** deletion, Undo, added rows, failed logs, and retry must recompute suggestion eligibility; no permanent “completed” boolean from an optimistic tap.
- **Navigation races:** a late commit from a departed exercise must not reopen its card or replace a newer suggestion.
- **Rest:** `restAfter()` returns zero when all current rows are done; decide and test a Quick-specific recovery policy before offering optional rest-time pairing.
- Pairing suggestions remain optional, disabled for strength, and forbidden for protected heavy compounds.

**5) Tests to write and assertions**

- **`src/lib/__tests__/order-3.4a.test.ts`:** table of at least 30 named fixtures, each asserting exact ordered IDs, best next ID, alternatives, and reason code.
- Fixtures 1–6: push with chest/triceps/shoulder focus; pull with back/biceps focus; mixed upper. Assert compound/helper dependencies and matching follow-ups.
- Fixtures 7–12: hamstring legs, quad legs, hinge day, full body, calves/core tail, static-plus-dynamic warmup. Assert exact tier and focus placement.
- Fixtures 13–18: hotel dumbbells+bench, dumbbells without bench, bodyweight floor, pull-up bar only, cable only, empty candidate pool. Assert actual eligibility.
- Fixtures 19–24: strength, fat loss, beginner, experienced muscle goal, lower-back restriction, shoulder restriction. Assert prescriptions and excluded movements.
- Fixtures 25–30: recent chest, recent legs, exactly 48-hour boundary, never-list exclusion, existing/alias duplicate, unavailable top-ranked candidate.
- Use real IDs such as `dumbbell-bench-press`, `cable-tricep-pushdown`, `barbell-back-squat`, `machine-seated-leg-extension`, and `dumbbell-lateral-raise`.
- **Property tests:** seeded generated subsets/permutations assert preserved membership, deterministic output, input immutability, and every helper dependency.
- Assert every accepted pair passes compatibility and excludes protected compounds; every suggestion is supported, unique, and outside the workout/exclusions.
- No property library is installed; deterministic seeded generation in Vitest suffices without adding a dependency.
- **`src/lib/__tests__/coachTips-3.4a.test.ts`:** load real `five-day-split.json`; assert all six issue families with correct affected exercises.
- Assert RDL is the sixth working lift and moves behind squat; static holds move last; dynamic warmup remains first.
- Assert back squat, leg presses, Arnold press, and incline press receive appropriate rest proposals; the incline press pair becomes straight sets.
- Assert both 18-set core blocks shorten to a concrete 2–3-exercise block; all untargeted prescriptions remain identical.
- Assert no false order flags for the positive examples; separately test intentional intensity-pair labeling and idempotent Apply all.
- **`src/db/__tests__/orderContext-3.4a.test.ts`:** assert timestamp boundaries, cross-gym exposure, warmup exclusion, current-session exclusion, and import-order exclusion.
- **`src/db/__tests__/coachPlans-3.4a.test.ts`:** assert atomic save, duplicate Apply, rollback, reload, plan selection, immutable older revisions, and original preservation.
- Assert a tuned workout’s targets, Finish 60% progression, Finish → Undo, History labels, and weekly-table prescriptions resolve from its saved definition.
- **`src/db/__tests__/suggestions-3.4a.test.ts`:** assert atomic prescription+append, double Add, stale gym, concurrent Finish, failure/retry, and reload defaults.
- Extend backup tests: old records accepted, new fields round-trip, malformed definitions rejected, merge collisions preserve local data, saved pointer bounds checked.
- **`tests/order-3.4a.spec.ts`:** import from `./fixtures`; use `dbPut()`, `dbAll()`, and existing guarded error collection.
- On SE and Pro Max: complete bench/squat, assert one recommendation, factual why, alternatives, one-tap Add, correct picker and persisted sets/reps/rest.
- Verify no card on warmup/mid-exercise/failed log; test deletion/Undo, double Add, navigation, offline reload, no candidates, and changed equipment.
- **`tests/coach-tips-3.4a.spec.ts`:** assert collapsed default, count, per-tip Apply, Apply all, persistent Hide, original link, tuned selection/start, and unchanged original.
- Run layout/control audits with simulated safe areas, 130% text, long names, reduced motion, kg/lb, and zero console/page errors.
- Capture bench, squat, and dumbbells-only hotel Up next screenshots on **iPhone SE** and **iPhone 17 Pro Max**, plus Coach tips before/after.
- Record main flows in `reports/videos/`; mark core tests `@matrix` for the configured wider phone matrix.
- Builder checks: `npm run test`, `npm run build`, and targeted Playwright with `--project="iPhone SE" --project="iPhone 17 Pro Max"`.

**6) Risks and conflicts with built code**

- **Spec/data contradiction:** SPEC 22 says hamstrings train once weekly; the actual split includes leg curls on **both** leg days, plus RDL on day 1.
- Emit the frequency tip for genuinely under-frequency areas, such as chest/back/direct shoulders; do not fabricate “hamstrings once.” Record this acceptance discrepancy.
- **Rest conflict:** SPEC 7.3’s 90/60 and strength 150-second defaults conflict with later SPEC 22; use section 22 for generated/suggested prescriptions.
- **Scope dependency:** 3.4 is still unchecked; `data/patterns.json` and its support engine are absent. Only `data/catalog-ladder.json` currently exists.
- **Static-plan assumptions:** changing only PlanViewer would leave tuned plans unusable in Today, workout, Finish, History, Resume, and backup validation.
- **Identity assumptions:** workouts/drafts are exercise-keyed; adding the same exercise twice cannot represent distinct prescriptions. Deduplicate aliases and destinations.
- **Photo restrictions:** retain `photoEligibility()` and audited mappings; a ranking candidate does not automatically qualify for a demo.
- **Current baseline:** 3.3 remains unchecked and the tree has intake and `BottomCTA` edits. Build on its finalized behavior without overwriting those changes.
- Keep 3.5 generation, 3.6 trimming, and 3.8 progression separate; this item supplies shared rules and delivers Up next plus actionable curated-plan tips.