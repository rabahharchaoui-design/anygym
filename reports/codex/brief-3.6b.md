Codex brief for PLAN item 3.6b, written Nov 11 00:29 at commit cac4473e. SPEC.md wins if they disagree; code may have moved since.

Read-only brief for [PLAN.md:105](/Users/rabah/projects/anygym/PLAN.md:105), item **3.6b**. No files changed; no tests run.
Existing work to reuse: `recordSets()`, `workoutWins()`, `PRBadge`, `Odometer`, and `FinishScreen`.

**1) Applicable SPEC and acceptance checks**

- **SPEC 0, 2, 5.4–5.5:** use saved facts; preserve transactions and original loads; all weight arithmetic belongs in `src/lib/load.ts`.
- **SPEC 6:** preserve history boundaries: machines and Smith per gym; free weights across gyms; no displayed estimated 1RM.
- **SPEC 8, 21.1:** finish retains duration, sets, total lifted, exercise results, and real personal records.
- **SPEC 10, 13.1–13.5:** black/lime identity, plain words, offline operation, immediate taps, safe areas, accessible controls, 130% text.
- **SPEC 21.2, 23.3:** restrained micro interactions, drawn checks, “New best,” finish count-ups; celebrations settle within 900 ms.
- **SPEC 23:** use shared UI components and motion tokens; follow the three local design skills it names.
- **SPEC 23.4:** recordings and before/after screenshots on SE and 17 Pro Max; item 3.6b raises the required critic score to **9+**.
- **SPEC 12.8–12.9, 16, 17:** inform reusable event types for future run records, city stamps, XP, levels, and badges.
- Acceptance: SMALL stays inside the set row and never prevents logging, editing, deleting, or advancing within a pair.
- Acceptance: MEDIUM shows the actual exercise, saved result, and supported improvement with a brief lime particle entrance.
- Acceptance: BIG occurs only after a saved finish; first workout and eligible main-lift heaviest records are wired now.
- Acceptance: select at most one BIG per workout; other qualifying moments appear as MEDIUM without a sequence of full-screen interruptions.
- Acceptance: any tap skips BIG and lands on its finish content; reduced motion preserves the words with a calm fade.
- Acceptance: no heavy animation dependency, console errors, duplicate writes, or replay loops.

**2) Files to create/change and concrete responsibilities**

- New paths/functions below are proposals; existing integration names are taken from this checkout.
- Create `src/ui/celebrate/types.ts`: discriminated `CelebrationMoment` and `CelebrationSelection` types with stable IDs, factual copy, hero value, and destination.
- Include future kinds for run record, city, level, badge, and XP; implement only gym event production now.
- Create `src/ui/celebrate/select.ts`: pure `selectCelebrations()` returning one optional BIG and ordered MEDIUM moments.
- Proposed gym precedence: first workout, then main-lift heaviest; among heaviest candidates use greatest gain over pre-workout history.
- Break equal gains by saved workout/set order, then stable ID; encode this otherwise unspecified policy in tests.
- Create `src/ui/celebrate/Celebration.tsx`: shared MEDIUM card and BIG presentation, completion/skip handling, and destination registration.
- Create `src/ui/celebrate/Particles.tsx`: bounded, deterministic particle elements animated with transform/opacity; decorations never receive taps.
- Create `src/ui/celebrate/Celebration.module.css`: token colors, safe-area layout, fixed-size hero region, particle clipping, reduced-motion fade.
- Create `src/ui/celebrate/SetCheck.tsx`: shared check glyph/draw behavior, preserving the current pending-to-logged animation timing.
- Create `src/ui/celebrate/useWorkoutCelebration.ts`: presentation lifecycle, one claim per session, transition readiness, cancellation, and live reduced-motion handling.
- Create `src/db/celebrations.ts`: `workoutCelebrations()` builds gym moments; `claimWorkoutCelebration()` atomically prevents repeat presentation.
- Change [src/lib/records.ts](/Users/rabah/projects/anygym/src/lib/records.ts): retain structured facts for every winning category while preserving existing `SetRecord.kind`, text, and ranking.
- Today `recordSets()` keeps only the largest-gain category; expose heaviest evidence even when volume wins its display label.
- Include current set and prior benchmark loads/reps; never recover numeric data by parsing `text` or `beat.text`.
- Change [src/db/history.ts](/Users/rabah/projects/anygym/src/db/history.ts): expose grouped celebration facts through the existing `recordGroups()`/`workoutWins()` path.
- Preserve group identity across exercise, load kind, Smith/free-bar distinction, and source gym; `setId` remains the record’s stable identity.
- Reuse `profileFor()` from `src/data/order.ts` and `isHeavy()` from `src/lib/order.ts` for the proposed “main lift” eligibility rule.
- Unknown exercise classification earns MEDIUM at most; do not infer main lifts from display names.
- Change `src/lib/load.ts` only if a numeric improvement helper is needed; reuse `comparableWeight()`, `heavierThan()`, `formatWeight()`, and `formatAmount()`.
- Change [src/ui/PRBadge.tsx](/Users/rabah/projects/anygym/src/ui/PRBadge.tsx) and its CSS: delegate SMALL effects to the shared engine; preserve its popover and 48 pt target.
- Change `src/screens/workout/SetTable.tsx` and its CSS: replace local check behavior with the shared SMALL primitive without moving columns.
- Keep `useWorkout()`’s existing `afterPaint()` application of PR results; decoration must remain outside the logging critical path.
- Change `WorkoutScreen.tsx`, `finishNow()`: pass a presentation entry marker only after `finishWorkout()` returns `saved: true`.
- Change [src/screens/workout/FinishScreen.tsx](/Users/rabah/projects/anygym/src/screens/workout/FinishScreen.tsx): integrate selection/presentation; keep `done()`, Change next day, and Today’s Undo intact.
- Change `Finish.module.css`: replace duplicate burst/lead effects with shared celebration styles; retain the compact SE summary.
- Extend `src/ui/motion.ts` and matching `src/styles/tokens.css` only for genuinely missing shared tokens.
- Reuse `Odometer`; add an optional settle/immediate mechanism if skipping cannot currently force its visible digits to the final value.
- Extend `src/screens/dev/UiDevScreen.tsx` with synthetic SMALL/MEDIUM/BIG examples for repeatable designer review.

**3) Data model and Dexie**

- Current database is **v10**; this item does not require another table or index.
- Keep celebration candidates derived from saved sessions/sets; do not persist PR copies as authoritative training data.
- Store presentation suppression in existing `db.kv`, under a dedicated prefix such as `anygym-celebration:<sessionId>`.
- Suggested value: versioned JSON containing the claimed BIG ID or null and the IDs whose entrances were consumed.
- `claimWorkoutCelebration()` uses one read/write transaction over sessions, sets, gyms, and kv; recheck that the session is ended and non-imported.
- Do not write inside a `useLive()` query: kv writes can retrigger queries and replay effects.
- Claim before animation starts; failed claims fall back to static factual cards and never prevent Done.
- Keep the marker through `reopenWorkoutWithPending()` so Finish → Undo → Finish cannot produce another BIG for that session.
- This is phone-local presentation state, excluded from backup; no changes to `TABLE_NAMES` or backup format.
- Change `src/db/backup.ts`, `restoreReplace()`, to clear the new prefix: it currently preserves unrelated kv rows.
- No `Session`, `WorkoutSet`, or schema migration changes are necessary with this approach.

**4) Tricky edge cases and handling**

- First workout: require a non-imported finished session with `workSetCount() > 0`; empty and warmup-only finishes get no BIG.
- Existing imported working history suppresses “first workout”; do not compare `importSeq`-based timestamps as real calendar dates.
- Keep completion counts separate from PR eligibility: `workSetCount()` includes drops, whereas record calculations require `kind === 'work'`.
- A first-ever lift has no PR benchmark: retain `recordSets()`’s honest empty result; first-workout celebration is a separate event.
- One set can win volume and heaviest simultaneously; eligibility must use all structured wins, not just `SetRecord.kind`.
- Compare improvements with history before the session, not merely the preceding set today; later records must not inflate the displayed gain.
- Preserve dumbbell “each,” bodyweight added-load wording, mixed-unit conversion tolerance, Smith identity, and mid-workout gym stamps.
- Warmups, drops, uncertain loads, unresolved legacy bars, and missing loads never become PR celebration candidates.
- Delete/edit/Undo may remove a live record; keep SMALL driven by committed database results, never the optimistic check.
- Historical `/done` visits render static results; only a validated finish entry marker permits automatic presentation.
- StrictMode effect replay must reuse the same pending claim promise; its first cleanup must not consume the event without the second effect receiving it.
- Start BIG after navigation settles; `FinishScreen` already uses `holdTransition()`, `transitionRunning()`, and snapshot-sensitive entrance suppression.
- Consume the skip tap so it cannot also press underlying Done or Change; finish immediately at the factual destination.
- On unmount, session change, or reduced-motion activation, cancel timers/animations and remove listeners; no deferred overlay may appear later.

**5) Tests to write and assertions**

- Create `src/ui/celebrate/__tests__/select.test.ts`: no candidates produces no effects; ordinary PRs are MEDIUM; first workout/main heaviest qualify for BIG.
- Assert one BIG maximum, documented precedence, stable ties, duplicate removal, and losing BIG candidates becoming MEDIUM.
- Extend `src/lib/__tests__/records-2.2e.test.ts`: a volume-labelled set still exposes its simultaneous heaviest achievement.
- Assert later same-session improvements use the pre-session benchmark and existing `biggestWin()` behavior stays compatible.
- Add lb/kg, equivalent mixed-unit loads, dumbbell each, added bodyweight, ties, and zero-prior-weight cases.
- If adding arithmetic, extend `src/lib/__tests__/load.test.ts`; assert exact delta conversion/formatting and preserve 100% load coverage.
- Create `src/db/__tests__/celebrations-3.6b.test.ts` using `fake-indexeddb` and injectable `AnyGymDB`.
- Assert first-workout detection across empty, warmup-only, imported, prior finished, active, and missing sessions.
- Assert uncertain data, timed sets, ambiguous bars, and new gym machine history cannot fabricate PR moments.
- Assert two concurrent claims produce one owner; reopen/refinish and DB reopen cannot claim another BIG.
- Assert failed claim writes leave session, sets, plan state, and pending-workout recovery data untouched.
- Extend backup tests: presentation rows are absent from exports and removed by `restoreReplace()`.
- Create `tests/celebrate-3.6b.spec.ts`, importing `test`/`expect` from `tests/fixtures.ts`.
- Use `seedFinished()`, `dbPut()`, `checkCurrent()`, and `navIdle()` from `tests/workout-helpers.ts`.
- SMALL flow: log a real PR; verify “New best,” correct detail popover, unchanged row bounds, and immediate next-row usability.
- Failed Log flow: optimistic check may draw, but no PR celebration appears before successful commit.
- MEDIUM flow: finish a rep-only PR; verify exact saved result, no BIG, and reachable Done.
- BIG flow: finish a main-lift heaviest plus other records; verify exactly one overlay and all remaining factual cards.
- First-workout flow: fresh data → log → finish gives BIG; empty/warmup-only and imported-history variants do not.
- Skip flow: tap backdrop, text, or hero; overlay disappears without navigation, visible number settles, and a subsequent Done works.
- Replay flow: reload, navigate away/back, and Finish → Done → Undo → Finish; assert no second BIG.
- Reduced-motion flow: emulate before loading and during BIG; assert unchanged words, final digits, no particles or movement.
- Layout flow: long names, large values, 130% text, and simulated safe areas; use `checkLayout()`, `fullyShown()`, and control checks.
- Offline/restart flow: finish offline, restart after presentation begins, and verify saved data plus usable static summary without replay.
- Run focused UI tests with `--project="iPhone SE" --project="iPhone 17 Pro Max"`; mark core layout/interaction cases `@matrix`.
- Record videos and screenshots under `reports/videos/3.6b/` and `reports/shots/3.6b/`; include iPhone 15 for the item’s stated visual check.
- Measure animation-frame gaps using the approach in `tests/foundation-2.2e.spec.ts`; video alone does not establish 60 fps.
- Re-run affected records, finish/Undo, foundation, and 3.8b tests; then typecheck, build, and required suite checks.

**6) Risks and conflicts with built code**

- `recordsFor()` and `recordSets()` serve different summaries; avoid creating a third PR algorithm or dropping volume-only records.
- `FinishScreen` currently filters every record belonging to its lead exercise; replace this with event-level deduplication so distinct wins survive.
- Existing PR ring, check animation, finish burst, win glow, and count-ups can overlap; shared orchestration must replace duplicate effects.
- PR CSS animates box-shadow; the new particle/ring implementation should use static decoration with transform/opacity animation.
- `Odometer` staggers digits by character count; a long hero value can exceed the 900 ms budget without a bounded celebration timing mode.
- SPEC 23.2 and `src/ui/haptics.ts` describe an iOS switch technique; PLAN 3.6b explicitly rejects promised iPhone vibration. Flag this discrepancy and make celebrations visual without expanding the global haptics scope.
- `src/lib/tone.ts` has no silent-state/music policy; optional celebration sound should remain off in this item.
- Run is currently an empty-state screen; XP, city stamps, and achievement levels are future producers, not gym integration dependencies.
- Coach “Level up” means a training-load recommendation; do not automatically treat it as the future achievement-level BIG event.
- Existing finish saving/recovery is intricate: keep presentation outside `finishLocked()` and never delay or roll back a saved workout for animation.