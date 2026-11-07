Codex brief for PLAN item 3.8, written Nov 08 01:06 at commit 845b6d1. SPEC.md wins if they disagree; code may have moved since.

[PLAN.md:97](/Users/rabah/projects/anygym/PLAN.md:97) leaves 3.8 unchecked, but the working tree already contains substantial, uncommitted coach code and tests. **Complete and harden that implementation; do not start another engine.**
The brief below reflects the current source, including the findings in [reports/codex/3.8.md](/Users/rabah/projects/anygym/reports/codex/3.8.md).
No files changed. Tests were read, not run.

**1) Applicable SPEC sections and acceptance checks**

- **SPEC 15:** recommendations are pure, local, offline, specific, explainable, and actionable in one tap.
- Starting weights: show no numeric suggestion before a real test set; use its committed load and reps to derive the working target.
- Warmups: intermediate and experienced users get loadable light ×10, approximately 50% ×5 and 75% ×3 before the first compound; these remain separate from working sets.
- Weekly progression: evaluate the completed training week; isolation earns reps before weight; ineligible lifts explain why they hold steady.
- Manual and automatic level up must use the same decision and rounding functions; missed reps prevent a raise.
- Auto level up defaults off; first enablement shows a real lift example, Turn on and Not now; subsequent automatic changes have persistent See changes and per-lift Undo.
- Personal progression: internal Epley/Brzycki estimates, reps capped at 15, EMA smoothing, a 4–8-week learned rate, bounded increments, and durable learning after misses.
- Effort: one optional Easy/Good/Hard choice after an exercise’s last set; skipping does not fabricate an answer; previous effort is offered as the default.
- Plateau: under 1% change across three sessions **or Hard twice at the same weight** produces an action for that lift alone.
- Recovery: sharp rep drops, widespread Hard/misses, and accumulated training weeks suppress pushing; accepted deload means approximately 10% lighter and one fewer set.
- Welcome back: after seven days off, offer approximately 90%; missed-workout plan changes require an explicit choice.
- **SPEC 6, 5.4–5.5:** preserve history scope, stored units, exact load breakdowns, weekly-table reps, and honest unknowns; weight arithmetic stays in `src/lib/load.ts`.
- **SPEC 0, 2, 9.1–9.2:** transactional writes, offline operation, no fabricated data, versioned storage, and consistent backup/restore.
- **SPEC 7.2–7.4, 14, 19, 22:** respect equipment, intake restrictions, swaps, time budgets, gym-specific machines, and existing ordering/rest rules.
- **SPEC 20.2, 21.1–21.2, 13, 23:** preserve one-tap logging; one coach recommendation at a time; plain language, reduced motion, accessible controls and phone layouts.
- Competitor research gaps 1–4 apply: live PR, specific finish celebration, consent before plan changes, and Fresh muscles from logged sets only.
- Acceptance for Fresh muscles: verified muscle mappings only, “Based on your logged sets,” explicit recency legend, and no card without qualifying data.

**2) Files to create or change**

- **Existing engine entry:** `src/lib/coach.ts` already re-exports `src/lib/coach/index.ts`; retain this public API and the pure modules beneath it.
- `src/lib/coach/types.ts`: extend `LiftSession` with known expected working-set counts; add durable outcome and target ownership metadata to the existing change/target types.
- `src/lib/coach/strength.ts`: retain `sessionEstimate()`, `smoothed()`, `currentEstimate()` and `weeklyRate()`; explicitly define insufficient-history behavior and chronological ordering.
- `src/lib/coach/outcome.ts`: change `judgeRaise()` and `learnedScale()` so resolved outcomes survive history-window truncation and are counted once.
- `src/lib/coach/increment.ts`: keep `raiseRule()`/`nextWeight()` shared by manual and automatic decisions; define conservative behavior after three sessions but before a usable rate exists.
- `src/lib/coach/levelUp.ts`: fix `liftVerdict()` to evaluate all relevant sessions against their prescriptions; refuse raises with an active recovery target.
- `src/lib/coach/recovery.ts`: evaluate `hardTwice` before the top-reps exclusion in `plateauOf()`; keep deload/welcome-back changes scoped and loadable.
- `src/lib/coach/today.ts`: make recovery/missed-workout priority suppress `autoApply`; derive the Leveled up notification directly from stored automatic changes.
- `src/lib/coach/rest.ts`: reconcile `coachRest()` with `src/lib/order.ts::restFor()` instead of maintaining contradictory compound defaults.
- `src/lib/coach/classify.ts`: incorporate verified exercise classification from `src/data/order.ts::profileFor()`; pattern alone is too broad for several exercises.
- `src/lib/load.ts`: retain `estimatedMax()`, `levelUpWeight()`, `scaledWeight()`, `warmUpLadder()` and `testSetNumber()` as the sole weight-calculation layer.
- `src/db/history.ts`: expose stable session identity to the coach; `getPastSessions()` currently returns dates, and `coachData()` joins them back by timestamp.
- `src/db/coachData.ts`: update `coachData()`/`rangeFor()` to preserve session identity, expected sets, actual gym/bar scope, and historical prescriptions.
- `src/db/coach.ts`: harden `applyChanges()`, `undoChange()` and `undoApplied()` against duplicate application and stale Undo; persist resolved learning transactionally.
- `src/screens/today/useCoach.ts`: keep `useCoach()` as orchestration; database idempotency must protect its auto-apply effect across tabs and remounts.
- `src/screens/today/CoachCard.tsx` and `LeveledUpSheet.tsx`: retain current actions; handle stale results, busy states, save failures and per-lift Undo accurately.
- `src/db/planState.ts` and `src/db/swaps.ts`: harden `rebuildWeek()` and `setAlwaysUse()` integration so applying an action and closing its card succeed together.
- `src/screens/settings/CoachSettings.tsx`, `src/screens/SettingsScreen.tsx`: retain the existing setting and example sheet; preserve honest empty examples and explicit enablement.
- `src/screens/workout/useWorkout.ts`: retain `progressionOf()`, `startLight()`, `warmUpsOf()` and `restOf()`; protect user edits and weekly prescriptions from coach overrides.
- `src/screens/workout/coachWarmUps.ts`: replace the separate localStorage seed marker with durable, atomic seeding; `seedWarmUps()` currently marks before writing drafts.
- `src/screens/workout/ExerciseView.tsx`, `src/lib/drafts.ts`, `src/lib/setTable.ts`: preserve row identities, `Draft.auto`, warmup isolation, LAST TIME alignment and recovery behavior.
- `src/screens/today/coachStart.ts`: move `applyLighterWeek()` into shared workout-start handling; match the complete lift key and persist the reduction idempotently.
- `src/screens/today/FreshMuscles.tsx` and `Fresh.module.css`: reuse the existing map and `freshWords()`; verify recency boundaries and accessible descriptions.
- `src/screens/TodayScreen.tsx`: retain `CoachCard`, `CoachLine`, `FreshMuscles` and sheet wiring; refresh time-dependent decisions when the day/week changes.
- PR implementation already exists: `src/lib/records.ts::recordSets()/biggestWin()`, `src/db/history.ts::workoutWins()`, `SetTable.tsx`, `PRBadge.tsx` and `FinishScreen.tsx`; extend regression coverage.
- New production modules are unnecessary unless extracting shared transactional operations; extend the existing 3.8 test files rather than creating duplicate suites.

**3) Data model and Dexie changes**

- The current working tree already defines **schema v10**, `SCHEMA_VERSION = 10`, and four coach tables in `src/db/schema.ts`.
- `coachLifts: 'key, exerciseId'` stores `CoachLiftRow`: target, learned snapshot and update time.
- `coachChanges: 'id, cardId, key, appliedAt'` stores `ChangeRecord`: old/new value, reason, source, prior target and Undo status.
- `coachCards: 'id'` stores answered cards; `efforts: '[sessionId+exerciseId], exerciseId, sessionId'` stores one effort per exercise/session.
- `src/db/types.ts::Profile.coach` already has optional `autoLevelUp` and `autoIntroAt`; absence means off.
- Extend `ChangeRecord` with an optional resolved outcome and its evidence session ID; preserve resolved learning beyond the current 16-session read limit.
- Give targets a change ID or revision; Undo must compare ownership, rather than only `setAt` and numeric value.
- Store warmup-seeding and lighter-week application markers with the session/durable state; commit them with the changes they describe.
- Keep `liftKey()` semantics: exercise + history gym scope + load kind + Smith distinction; use canonical exercise identity consistently.
- Optional fields need no index migration; any changed store/index requires a new version after v10. Never rewrite a shipped migration.
- Extend `src/lib/backup.ts` validation/normalization and `src/db/backup.ts` handling for durable coach learning, effort and change records; older backups normalize missing coach tables to empty.
- `restoreReplace()` must replace all four coach tables in its transaction; an older backup must clear later targets/cards. For merge, preserve destination decisions and define conservative coach adoption only when destination coach state is empty.

**4) Tricky edge cases and handling**

- **Recovery versus raises:** suppress both manual eligibility and automatic application during recovery; accepting a lighter week must prevent subsequent reads overwriting it.
- **Two tabs:** check card application inside `applyChanges()`’s write transaction; repeated calls return the existing result rather than inserting another change.
- **Stale cards:** recheck active workout, settings, history and target ownership at commit; a rendered recommendation is not sufficient authorization for stale data.
- **Weekly eligibility:** an earlier session below its target cannot disappear behind a successful latest session; insufficient known working sets must not earn a raise.
- **Learning retention:** resolve each raise against its qualifying outcome once; reloads and sessions aging out must not reset its penalty.
- **History corrections:** editing/deleting an evidence session or undoing Finish must invalidate affected derived decisions; retain enough provenance to detect that.
- **Mixed units:** compare strength through `comparableWeight()`; convert suggestions through load helpers and round for the current gym, without modifying historical loads.
- **Unknown/coarse equipment:** unknown bars/start resistance produce no invented load; rack limits hold steady. Make oversized minimum-step behavior explicit and tested.
- **Failure semantics:** zero-rep attempts contribute no strength estimate but still signal a miss; `WorkoutSet.failure` means a completed set taken to failure, not automatically a failed attempt.
- **Warmup durability:** kill between seeding and rendering must restore exactly one ladder; skipping a warmup never removes a working set or triggers reseeding.
- **Deload rows:** apply once across every start path, after swaps/trim resolution; never reduce below one set or reduce the wrong gym’s machine lift.
- **Calendar boundaries:** use local calendar weeks/days, test DST, and refresh at midnight/Monday without requiring an IndexedDB mutation.
- **Long breaks:** the current ten-week lift discovery window can hide pre-break lifts; retain/read the latest qualifying pre-break session without inventing recent training.
- **Test-set assumptions:** ten completed reps alone do not prove “Easy”; avoid increasing the suggested load based on an unconfirmed effort assumption.

**5) Tests to write or extend**

- `src/lib/__tests__/load-coach-3.8.test.ts`: assert formula boundaries at 1/10/11/15/>15 reps, invalid inputs, and exact loadability in lb/kg.
- Same file: assert raise caps/minimums, coarse steps, full sleeves, rack maximums, unknown resistance, and strictly lighter deload loads.
- Same file: assert warmups are increasing, below work weight, deduplicated after rounding, and reconstructible with `loadAt()`.
- `src/lib/__tests__/coach/coach-3.8.test.ts`: assert every session’s target matters, partial prescriptions do not earn raises, and isolation progresses reps first.
- Same file: assert an active recovery target blocks manual and automatic raises, including after dismissing the recovery card.
- Same file: assert two Hard sessions at top reps still produce a plateau action for that lift only.
- Same file: assert stored Leveled up changes remain available after training this week, Undo, and eligibility changes.
- Same file: assert exact Monday boundaries, seven-day return threshold, missed weekdays, target expiry, and no future-dated evidence.
- Same file: assert recency bands at 24/48/72 hours, latest-set wins, and no fabricated muscle mappings.
- `src/lib/__tests__/coach/synthetic-3.8.test.ts`: extend all four existing 12-week users through `coachToday()` and actual target consumption.
- Synthetic tests: truncate history like production, simulate misses/recovery/Undo, and assert durable adaptation, loadable bounded changes and no simultaneous raise/deload.
- `src/lib/__tests__/coach/verify-3.8.test.ts`: replace invalid `press_v`/`press_h` casts with real patterns; require earned results instead of silently continuing.
- `src/db/__tests__/coach-3.8.test.ts`: assert migration preserves old records byte-for-byte and initializes coach stores without enabling Auto.
- Same file: assert concurrent application yields one change per lift/card; injected write failure rolls back targets, records and card state together.
- Same file: assert stale Undo preserves newer targets; resolved outcomes are applied once and survive more than 16 later sessions.
- Same file: assert identical session timestamps do not mix prescriptions/effort; aliases, Smith/free bars and machines across gyms retain correct identity.
- Backup tests: restore an older backup over newer coach state; assert no future targets survive, old files import, and coach-table write failures roll back.
- Add focused warmup/start tests: blocked storage, failed seeding, trim/swap combinations, alternate plan starts, repeated starts and exact row restoration.
- Extend `tests/coach-3.8.spec.ts`, importing `test`/`expect` from `tests/fixtures.ts`; freeze dates so weekly scenarios are deterministic.
- Playwright: exercise Auto off → real example → Not now/Turn on → weekly application → See changes → per-lift Undo → offline reload.
- Playwright: test manual Apply/Undo, double taps, two tabs, injected save failure, recovery priority, and missed-days consent with unchanged history.
- Playwright: test test-set logging, warmup skip/log/reload, effort after the last set only, and default effort without silently recording it.
- Playwright: verify PR appears only after commit, responds to edit/delete/Undo, and the finish headline names the actual winning lift/set.
- Run on **WebKit iPhone SE, 375×667**, and **iPhone 17 Pro Max, 440×956**; use `simulateSafeAreas()`, `checkLayout()`, `checkControls()` and `checkActiveWorkout()`.
- Capture/review Today, recovery cards, Auto sheets, See changes, warmup rows and effort at normal/130% text and reduced motion; verify reachable Log controls.
- Use `tests/helpers/kill.ts::killHard()/relaunchOffline()` to prove warmup drafts and committed coach changes survive process termination.
- Builder checks: `npm run test`, `npm run build`, then `npx playwright test tests/coach-3.8.spec.ts --project="iPhone SE" --project="iPhone 17 Pro Max"`; run the full matrix before the merge gate.

**6) Risks and conflicts with built code**

- The existing review identifies five real gaps: recovery/auto conflict, stale state after restore, forgotten learning, Hard-at-top plateau suppression, and disappearing See changes.
- `coachRest()` conflicts with SPEC 22 and `restFor()`; several goals currently get compounds below two minutes. Preserve explicit user/curated-plan choices while unifying generated defaults.
- Pattern-only classification misses existing `profileFor()` overrides: back extensions and straight-arm pulldowns can receive compound treatment despite established isolation classifications.
- `applyLighterWeek()` currently runs only from Today’s `startDay()`, matches by exercise ID, and can miss swapped entries; shared start handling is necessary.
- Added warmups and changed rest alter duration after 3.6’s estimate. Feed resolved workout structure into the existing estimator; do not introduce separate time math.
- Warmups can create six visible rows on SE; existing three-row layout coverage does not establish that the current Log action remains reachable.
- Plateau variations currently come from `swapCandidates()` without intake restrictions; respect never-want/go-easy-on choices before offering one.
- Pending **3.5b** also needs logged-muscle recency; expose shared facts from the coach data layer without implementing that separate PLAN item.
- Existing logging durability is extensively hardened: preserve draft IDs/revisions, journal reconciliation, pending writes, Finish/Undo boundaries and user-entered loads.
- Treat existing 3.8 tests and screenshots as useful starting material, not completion evidence; none were executed for this brief.