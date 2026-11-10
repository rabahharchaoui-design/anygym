Codex brief for PLAN item 3.5f, written Nov 10 22:44 at commit 3e09c6a4. SPEC.md wins if they disagree; code may have moved since.

Read [CLAUDE.md](/Users/rabah/projects/anygym/CLAUDE.md), [SPEC.md](/Users/rabah/projects/anygym/SPEC.md), [PLAN.md:104](/Users/rabah/projects/anygym/PLAN.md:104), and the relevant source/tests. No files changed; tests were not run. `PLAN.md` already has uncommitted changes.
Paths and functions marked **new** below are proposed; other names exist.

**1) Applicable SPEC and acceptance checks**

- **Prerequisite: 3.5e.** It remains unchecked. Consume its approved catalog gate; never make a candidate eligible merely to deepen the deck.
- Verify 3.5e’s coverage: ≥25 sure moves per place preset and ≥3 per movement pattern, with builder verification and G approval.
- **SPEC 0, 2, 4.3:** offline operation, transactional writes, exact exercise identity, sure equipment/muscles/demos, and preserved history.
- **SPEC 7.2:** replacement ladders rank gym-supported candidates; 3.5f extends them with close-pattern fallback and deeper browsing.
- **SPEC 7.3, 14, 15:** prescriptions honor goals, experience, equipment, love/never, focus, and Go easy on.
- **SPEC 7.4:** every estimate uses `estimateDayMinutes()`; trimming protects the first two compounds and explains cuts.
- **SPEC 20.3:** Quick keeps its default fast path, Keep/Swap buttons, hold-to-hide, once-only hint, and Start as is.
- **SPEC 20.4:** preserve ≤6 taps for the planned squat flow, ≤3 extra for weight changes, and ≤7 for manual Quick.
- **SPEC 22:** compounds first, no helper pre-fatigue, safe pairs, protected heavy-lift rest, and explicit consent for curated-plan changes.
- **SPEC 10, 13, 23:** portrait, safe areas, 48 pt controls, 130% text, reduced motion, 60 fps, no console errors.
- Acceptance: one shared deck serves Quick, optional pre-Start day preview, intake exercise preferences, and explicitly opened Replace.
- Acceptance: right keeps, left replaces, hold hides; equivalent labeled buttons remain available on every surface.
- Acceptance: the third left on a slot offers “Show me 6”; subsequent swaps never recycle previously rejected options.
- Acceptance: true exhaustion says “That is every move your gym has for this”; fewer than six options never get padded.
- Acceptance: three distinct-workout rejections of one move trigger “Hide it for good?” once; declining never bans it.
- Acceptance: generated chest sessions favor compound → angle variation → isolation → safe finisher pair where equipment/time permit.
- Acceptance: target roughly 6–10 hard sets for the session’s priority muscle, subject to beginner, time, and weekly-volume constraints.
- Acceptance: every exercise card uses a reviewed fact line plus ⓘ detail; no runtime-generated training explanation.
- Acceptance: name, why, and prescription are the only face information; move gear, muscles, rest, and badges into detail.
- Acceptance: re-review 3.5b using the expanded library; check it off only after its tests and the required ux-critic ≥9 pass.

**2) Files to create/change and their responsibilities**

- [src/screens/quick/Deck.tsx](/Users/rabah/projects/anygym/src/screens/quick/Deck.tsx): extract `Deck`, `DeckButtons`, and gesture machinery into **new** `src/components/curation/ExerciseDeck.tsx`.
- Preserve pointer axis locking, capture, cancellation, long-press timing, duplicate-action lock, spring-back, and reduced-motion behavior.
- Replace its `QuickItem` dependency with a small presentation contract; callers supply prescription, fact, and action callbacks.
- Extract deck styles from [Quick.module.css](/Users/rabah/projects/anygym/src/screens/quick/Quick.module.css) into **new** `src/components/curation/ExerciseDeck.module.css`.
- **New** `src/lib/curation.ts`: pure slot-state reducer for Keep, Swap, Hide, Undo, rejection counts, tried identities, and six-option selection.
- **New** `src/components/curation/useCuration.ts`: connect that reducer to persistence and prevent gestures/buttons from dispatching duplicate decisions.
- **New** `src/components/curation/SlotOptionsSheet.tsx`: accessible two-column grid, up to six unique options, honest empty state, and return focus.
- [src/lib/swap.ts](/Users/rabah/projects/anygym/src/lib/swap.ts): add **new** `rankedSwapCandidates()` returning the full eligible pool with ranking/reason metadata.
- Keep `swapCandidates()`’s same-pattern contract for existing callers; make fallback an explicit option.
- [src/lib/quick.ts](/Users/rabah/projects/anygym/src/lib/quick.ts): make `nextSwap()` select from that pool; retain `optionKey()`, alias exclusion, and heavy/deadlift safeguards.
- Extend `SwapContext` with experience and shared eligibility; Quick’s current swap filter does not explicitly exclude advanced skills.
- Update `swapItem()`, `safePairs()`, `regroup()`, and `conceptMinutes()` so replacements produce valid prescriptions, groups, facts, and estimates.
- [src/screens/quick/QuickScreen.tsx](/Users/rabah/projects/anygym/src/screens/quick/QuickScreen.tsx): replace local `Curating`, `replaceTop()`, `decide()`, and hide orchestration with the shared controller.
- Preserve `curate()`, guarded `start()`, `quick-start`, deck test IDs, and the named hide notice with Undo.
- [src/screens/today/DayCard.tsx](/Users/rabah/projects/anygym/src/screens/today/DayCard.tsx): add a secondary Preview action while retaining direct Start and Resume.
- **New** `src/screens/today/PlanDayPreview.tsx`: adapt the selected day to gym/time, curate locally, and explicitly apply session-only changes on Start.
- [src/screens/TodayScreen.tsx](/Users/rabah/projects/anygym/src/screens/TodayScreen.tsx): wire preview to the current gym/day/week; preserve `startDay()` and coach lighter-week behavior.
- [src/screens/today/startBudget.ts](/Users/rabah/projects/anygym/src/screens/today/startBudget.ts): reuse `pickFor()`/`trimFor()`; consume the pending time pick only after successful Start.
- [src/screens/intake/Steps.tsx](/Users/rabah/projects/anygym/src/screens/intake/Steps.tsx): adapt `BothExercisesStep()`/`ExercisesStep()` to the shared deck while retaining search and selected-list editing.
- Intake semantics: Keep records love, Swap passes to another candidate without banning, Hide records never; love/never remain mutually exclusive.
- [src/lib/intake/funnel.ts](/Users/rabah/projects/anygym/src/lib/intake/funnel.ts): retain optional Skip, Back, sanitization, and the existing exclusion of exercise preferences for brand-new lifters.
- [src/screens/workout/SwapSheet.tsx](/Users/rabah/projects/anygym/src/screens/workout/SwapSheet.tsx): host the shared deck only after explicit Replace; retain restore-original and “Always use this.”
- [src/screens/workout/useWorkout.ts](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts): stop truncating `swapChoices()` before curation; supply full eligible options and current slot targets.
- [src/screens/workout/WorkoutScreen.tsx](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx): keep `doSwap()` through `logQueue.mutate()`; commit the selected replacement once.
- Never attach curation gestures to `ExerciseView`, `SetTable`, or the normal workout rows.
- [src/lib/generator.ts](/Users/rabah/projects/anygym/src/lib/generator.ts), [generatorRules.ts](/Users/rabah/projects/anygym/src/lib/generatorRules.ts), and [quickStyles.ts](/Users/rabah/projects/anygym/src/lib/quickStyles.ts): share selection/prescription policy instead of adding a fourth builder.
- Add reviewed angle metadata to candidates; `Pattern = 'horizontal push'` alone cannot distinguish flat from incline.
- [src/lib/order.ts](/Users/rabah/projects/anygym/src/lib/order.ts): reuse `orderUnits()`, `heaviestOf()`, `canPair()`, and `restFor()` for initial generation and replacement validation.
- [src/lib/plans.ts](/Users/rabah/projects/anygym/src/lib/plans.ts): keep `estimateDayMinutes()` as the sole arithmetic implementation; model additional warmups as real input blocks.
- **New** `data/coach-facts.json`: stable IDs, approved short line, two detail sentences, applicability conditions, and review/source metadata.
- **New** `src/lib/coachFacts.ts` and `src/data/coachFacts.ts`: validate facts and deterministically select a reviewed fact matching actual structure.
- Reuse [src/ui/Sheet.tsx](/Users/rabah/projects/anygym/src/ui/Sheet.tsx), motion tokens, and existing info-button styling; prevent ⓘ taps from initiating drag/hold.

**3) Data model and Dexie changes**

- Current database version is **10**; dislikes already live in `Profile.dislikes = { soft?, never? }`.
- Extend that existing shape with optional per-canonical-exercise distinct-workout rejection memory and a persisted hide-question-asked flag.
- Bound stored workout IDs to the threshold needed; do not store an unbounded swipe-event history.
- Preserve `soft` as total rejection strength; it cannot establish distinct workouts and must not initialize the new three-workout counter.
- Stage workout-specific rejection evidence during preview; commit it with Start. Replace uses the existing session ID.
- Intake passes do not count as separate workouts; repeated lefts within one workout count once toward the hide question.
- [src/db/quick.ts](/Users/rabah/projects/anygym/src/db/quick.ts): extend `recordSwapAway()`, `recordNever()`, `undoNever()`, and `startBuilt()` transactionally; surface persistence failures.
- Canonicalize through `SWAP_DATA.sameAs()` so catalog IDs and plan aliases share preferences and prompt history.
- Add optional `Session.dayOverride` containing a normalized, session-only day snapshot when preview changes order/prescriptions/grouping.
- Keep original slot IDs in that snapshot; `Session.swaps` maps them to performed exercises, preserving existing progress semantics.
- **New** `src/lib/sessionDay.ts`: resolve override versus original trimmed day consistently for logging, Finish, and plan completion.
- Update `useWorkout()`, `FinishScreen`, and `src/db/workouts.ts`’s completion calculation to use that resolver.
- Optional unindexed fields need **no Dexie version bump**; default missing fields without rewriting historical sessions.
- Update [src/lib/backup.ts](/Users/rabah/projects/anygym/src/lib/backup.ts) validators and round-trip tests for both additions; retain existing profile merge/replace behavior.
- If 3.5e introduces a new store/version first, rebase on it; any additional store requires a new additive version and previous-version migration test.

**4) Tricky edge cases and handling**

- Rank by hard eligibility first, same-pattern tier second, reviewed close-pattern tier third; soft dislikes reorder within tiers.
- Never fall back to unsupported gear, hidden moves, unsafe experience levels, incompatible count units, or an exercise already elsewhere in the workout.
- Review fallback relations explicitly; `generatorRules.FALLBACK` includes horizontal push → vertical push, which can lose a chest slot’s purpose.
- Exhaustion means the complete compatible pool was examined; distinguish “no sure mapping” from a genuinely exhausted gym pool.
- Track tried options by stable slot identity, canonical exercise identity, and existing name-equivalence rules; replacement must not reset the counter.
- Offer Show me 6 once the third left lands, without repeatedly forcing the sheet open on later lefts.
- After replacing an isolation with a compound, recompute reps/rest and validate order; do not inherit an inappropriate isolation prescription.
- Split pairs when muscles conflict, the protected heaviest lift enters, or set counts differ; restore separate rest and recalculate duration.
- Hide with no replacement removes only the proposed slot, names it, updates time, and offers Undo; zero remaining moves disables Start with an actionable empty state.
- Undo restores the exact previous hidden state; it must not unhide an exercise already hidden before this action.
- Gym/day/time changes invalidate the preview’s eligibility context; revalidate before committing and never silently start a different deck.
- Existing active sessions return Resume unchanged; previews must not overwrite them or advance `planState`.
- Pending logs, tombstoned sets, and logged replacement sets retain the safeguards in `swapExercise()`/`undoSwap()`; no loads transfer across exercises.
- Offline missing images use the existing honest photo fallback; cached eligibility and reviewed facts remain available.

**5) Tests to write and what they assert**

- **New** `src/lib/__tests__/curation-3.5f.test.ts`: reducer transitions, stable slot counts, no repeats, third-left offer, six-option limits, exhaustion, and exact Undo.
- **New** `src/lib/__tests__/swap-3.5f.test.ts`: same-pattern precedence, reviewed fallback, canonical deduplication, gym support, never/easy-on/experience filters, and count-mode preservation.
- **New** `src/lib/__tests__/structure-3.5f.test.ts`: seeded properties across six presets × 15/30/45/60 × goals/experience.
- Assert compound/helper order, protected heaviest lift, compatible equal-set pairs, goal prescriptions, and estimates equal `estimateDayMinutes()`.
- Add a focused 30-minute chest fixture asserting flat → incline → isolation and a safe finisher when feasible; test barbell/dumbbell/bodyweight gear fallback separately.
- Assert feasible priority-muscle volume targets and explicit shortfall behavior; never require every muscle in a full-body session to receive 6–10 sets.
- **New** `src/lib/__tests__/coachFacts-3.5f.test.ts`: unique IDs, complete reviewed text, applicability, deterministic selection, and bundled fallback coverage.
- **New** `src/db/__tests__/curation-3.5f.test.ts`: distinct-session threshold, repeated same-session rejection, once-only prompt, alias equivalence, and failed-write retry.
- Extend `src/db/__tests__/codex-built-workout-commit.test.ts`: failure saving override/preferences rolls back session, trim, swaps, and gym budget; Retry reproduces the deck.
- Extend backup tests: new fields survive export/restore; old v10 records open unchanged; historical set IDs/loads remain identical.
- **New** `tests/curation-3.5f.spec.ts`: import `test`/`expect` from `./fixtures`; reuse `swipe()`, `longPress()`, and `counter()` from `tests/helpers/quick.ts`.
- Cover all four surfaces: Keep, Swap, hold, buttons, Show me 6, choice selection, exhaustion, hide/Undo, and cancel without session creation.
- Exercise slow below-threshold drags, fast flicks, vertical scrolling, pointer cancellation, rapid double taps, and ⓘ interaction.
- Test optional preview versus direct Start, unchanged Resume, intake Skip/Back/search, and Replace’s Always/restore behavior.
- Test reload after successful Start, failed Start/retry, offline after first load, and no swipe-driven curation during set logging.
- Run new specs in WebKit with `--project="iPhone SE" --project="iPhone 17 Pro Max"`; existing profiles are 375×667 and 440×956.
- Capture screenshots/video for each surface, six-option sheet, long names, exhaustion, and 130% text; assert reachable controls and zero horizontal overflow.
- Verify reduced-motion fades and preserve existing tap-count, pair-rest, warmup, swap, and 3.5c/3.5d regressions; run the full configured matrix before shipping.

**6) Risks and conflicts with built code**

- `PLAN.md` says SPEC wins: its four-card direction conflicts with SPEC 13.1’s three visible choices; SPEC 7.2 still specifies four alternatives.
- Resolve those documented limits before treating four-card faces or six-option browsing as universally approved UI rules.
- “Any session” conflicts with SPEC 22’s preservation of curated plans: show suggested structure and require Apply; keep originals and already-logged work intact.
- Best-gear-first conflicts with beginner machines-first and explicit training preferences; use gear ranking only after those constraints.
- Existing `nextSwap()` is same-pattern-only; current `swapChoices()` cuts to four and lacks Quick’s full preference filters.
- Current plan-backed `startBuilt()` persists trim/swaps, not changed deck grouping/order; `conceptMinutes()` also estimates the plan rather than those changed items.
- `safePairs()` handles two-member groups but does not check equal set counts; circuit validation needs separate attention.
- `quickStyles.buildCard()` can shorten isolation rests below 60 seconds; reconcile this with 3.5f and SPEC 22 rather than weakening protected rests.
- Automatic coach warmups are currently absent from the shared estimate; correct this at the estimator input boundary.
- Generator changes affect frozen-plan equality tests: regenerate through `scripts/freeze-plans.mts` and review resulting diffs without rewriting historical plan definitions.
- `data/coach-facts.json` does not exist yet, and the current demo gate uses map/allowlist eligibility; adopt 3.5e’s owner-approval implementation rather than duplicating it.