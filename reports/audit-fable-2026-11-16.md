# AnyGym whole build audit (PLAN 3.6c), 2026-11-16

Branch s3-plans at 57851123, the current ./dist served with vite preview, driven through Playwright WebKit as iPhone 15 Pro and the 320 wide iPhone SE profile. Scratch scripts, notes and repro tests are in /tmp/audit-3.6c/.

## Verdict

1. Logging, plate math, unit handling in totals, double tap guards, reload mid workout and the migrations held up: I found no way to lose or duplicate a set in one tab.
2. One BLOCKER: a healthy backup from a phone that uses a coach tuned copy of "Your plan" is refused as "damaged" on a new phone. Reproduced end to end in the built app.
3. The "Next" weight has three real faults at the edges that matter most to a traveler: a weight rounded to the new rack and then stepped up again, a "≈" line that quotes the raised weight, and a 20 to 50 lb jump when the gym has no small plates.
4. Offline is not true for form demos: exercise photos are never warmed, so the first workout with no signal has no pictures.
5. Not audited (cut for time): midnight and time zone edges in the UI, the import review screen, Quick workout, the muscle map, real 375 x 667 SE layout, the update prompt. Focus curation quality was left to reports/critic-3.6g2.md as briefed.

Each finding says "reproduced" (in the built app, or by a throwaway test or script) or "code read" (the exact path was read, not run).

## Findings, worst first

### A1 BLOCKER: a backup with a coach tuned "Your plan" cannot be restored on a new phone
- Where: `src/lib/backup.ts:229-246` (`planStateOk`), reached from Settings → Restore (`src/screens/SettingsScreen.tsx:139`, `parseBackup`).
- Steps (reproduced in the built app, scripts s12 to s15): intake with "Flexible, whenever I can" → Plans → Your plan → Coach tips → Apply all → Use this plan → Settings → Back up. On a fresh phone: Settings → Restore, pick the file. Result: "This backup is damaged. Nothing was changed." The same file opens fine on the phone that made it. A throwaway unit test shows the same (`/tmp/audit-3.6c/repro/tuned.test.ts`).
- Why: `planState.planId` is the tuned id (`mine-xxxx~coach-rest.freq`); the check looks the plan up through `planById`, which only knows the base plan after it is loaded into memory. On a new phone it is unknown, and line 242 then rejects the stored `pendingDayIndices`. SPEC 9.1 and 9.2, and "saved data is sacred": the one moment a backup exists for is the one where it fails.
- Smallest fix: in `planStateOk`, resolve a tuned id through its base id against the plans inside the file (`parseTunedId(planId).baseId`), or do not apply the pending rule to a plan the phone cannot resolve yet. Add a serialize → parse test that runs in a fresh module copy, because every existing restore test hands the object straight to `restoreReplace` and skips `parseBackup`.

### A2 MAJOR: last time's weight is rounded to this rack, then stepped up again
- Where: `src/lib/progression.ts:167` (`nearestLoadable`) then `:201` (`stepUp`). Exercise screen, "Beat last time" line and the prefilled rows.
- Input (reproduced by script, `/tmp/audit-3.6c/prog.ts`): dumbbells 9 kg each × 12, 12 in a gym with 1 kg steps; the active gym's rack goes in 2.5 kg steps. Shown: "Time to go up", 12.5 kg each (+39%). Right: 10 kg. With reps 10, 9 it shows "Beat last time: 11 reps at 10 kg each" although 10 kg was never lifted, and nothing says the weight changed.
- Why: SPEC 6 rules 2 and 4. This is the traveler case the app is built for: every gym switch between racks with different steps goes through these lines.
- Smallest fix: when the rounded base is already heavier than last time, that is the step up (do not call `stepUp` again); for "beat the reps" round down, and say the weight changed.

### A3 MAJOR: the "≈" line quotes the raised weight as if it were last time's
- Where: `src/lib/progression.ts:232-235`. Exercise screen.
- Steps (reproduced in the built app, script s10): a past workout with Dumbbell Bicep Curl 10 kg each × 15 on all 4 sets, active gym in lb. Shown: "Beat last time: 10 reps at 25 lb each · ≈ 25 lb, last time 10 kg". 10 kg is 22 lb; 25 lb is the stepped up weight. By script: 60 lb each × 12, 12 into a kg gym shows "≈ 30 kg, last time 60 lb" (60 lb is 27.2 kg), and after two sessions under the range "≈ 25 kg, last time 60 lb" with "Reset and build back up" lost.
- Why: SPEC 6 rule 7 and SPEC 0 rule 1: the sentence states an equivalence that is false, and hides the real reason.
- Smallest fix: write the "≈" text from the converted, rounded weight before rules 2 and 3 run, and keep the rule's own reason after it ("≈ 20 lb, last time 10 kg. All sets hit 15. Time to go up").

### A4 MAJOR: no form demos offline until each photo has been seen online
- Where: `vite.config.ts:134-153` (`globIgnores: ['**/ex/**']`, runtime CacheFirst only); nothing in `src/` warms the cache.
- Steps (reproduced, script s16): finish the intake online, reload once so the service worker controls the page, go offline, Start. The only cache is the precache (62 entries); every day list thumbnail and the exercise hero have no picture. It degrades cleanly (compact header, no error), tips and muscles still show.
- Why: SPEC 0 rule 4, "Everything works offline after first load", and the pitch ("shows exact form"). A hotel gym basement on day one is exactly this.
- Smallest fix: when a plan is chosen or the gym changes (and on launch when idle and online), fetch the two photos of every exercise in the active plan into the `exercise-photos` cache. About 60 small files for a 4 day plan.

### A5 MAJOR: applying a coach tip or rebuilding the plan cuts the plan off from its own workouts
- Where: `src/db/schedule.ts:28` (`e.planId === plan.id`) and `src/db/planState.ts:177-183` (`planDayOf`, `state.planId !== plan.id`). Today and the finish screen.
- Steps (reproduced in the built app, scripts s9 and s13): finish Day 1 at 5 of 21 sets. Today says "Next up: Day 1" and "Coach: Day 1 again. You did 5 of 21 sets last time, so it stays up next". Then Plans → Your plan → Coach tips → Apply all → Use this plan. Today now says "Next up: Day 2 · Lower A" with no reason shown, while the saved state still has `nextDayIndex: 0` and the part done marker.
- Second half (code read; the intake redo is reachable mid workout, script s18): start a day, then change the plan build (redo the intake to the reveal, or Use this plan on a tuned copy) and Finish. `planDayOf` returns undefined, so the day gets no tick and stays up next. Sets are safe; the plan position for that workout is lost.
- Why: SPEC 22 ("Applying creates a tuned copy ... nothing is lost") and the 3.6f rule that a kept day is judged without its own workout.
- Smallest fix: compare by plan family in both places (base id of a tuned copy; any two generated ids, as `schedule.ts:51` already does for the week strip) and map the day by position.

### A6 MAJOR: a barbell "Next" can jump 20 to 50 lb when the gym has no small plates
- Where: `src/lib/load/steps.ts:52-56` (`stepUp`) with `src/lib/load/increments.ts:39-42` (`plateIncrement`); also the Level up card through `walkUp` in `src/lib/load/coach.ts`.
- Input (reproduced by script, `/tmp/audit-3.6c/step.ts`): lb gym, 45 lb bar, plates 45, 25 and 10 on; last time 135 with every set at the top. Shown: 155 lb. With only 45 and 25: 185 lb (+37%). Right: 145 lb (45 + 2 × (25 + 25)), which the gym can load.
- Why: SPEC 6 rule 2 (smallest increment) and SPEC 15 (never unsafe jumps). The step is `max(5, 2 × smallest plate)` and it is returned when loadable without looking for a lighter total in between. Only gyms with the small plates switched off are affected (a home rack).
- Smallest fix: solve for `value + 5 lb / 2.5 kg` and return the exact total or the nearest loadable above.

### A7 MAJOR: a backup does not carry the coach's data, and Replace deletes it
- Where: `src/lib/backup.ts:48` (`TABLE_NAMES`) against `src/db/schema.ts:115-118`; `src/db/backup.ts:153` clears `coachLifts`, `coachChanges`, `coachCards`, `efforts`. Code read.
- Steps: accept a Level up, tap Easy / Good / Hard after lifts, Back up, then Restore → Replace with that same file (or restore on a new phone). The accepted targets and every effort tap are gone; the code comment says the coach "rebuilds from the restored workouts", but an accepted target and an effort tap are user input that no workout holds.
- Why: SPEC 9.1 "Export everything".
- Smallest fix: add the four coach tables to the backup (optional in the file, so older backups still open), or at least do not clear them on Replace when the file has none.

### A8 MAJOR: Merge duplicates imported history
- Where: `src/db/backup.ts:198-210` (sessions matched by id only); `src/db/importHistory.ts:38` gives every imported session a new id. Code read.
- Steps: on a new phone run Import history with the history file, then Restore → Merge the old phone's backup (which holds the same import). Every imported workout and its sets exist twice, History lists them twice, and "last time" lookups fill with copies. I found no "delete a workout" in the screens, so only Replace removes them.
- Why: SPEC 9.2; Import itself already refuses a second copy by `importHash`.
- Smallest fix: in `restoreMerge`, skip an imported session whose `importHash` is already on the phone.

### A9 MAJOR: "Missed 3 workouts" counts last week with this week's days
- Where: `src/lib/coach/missed.ts:24-36`, fed by `weekdaysOf` (`src/db/coachData.ts:256`), which returns only this week's pick for the "Changes week to week" schedule. Function reproduced by script (`/tmp/audit-3.6c/missed.ts`), wiring code read.
- Input: last workout Thu Nov 12, now Wed Nov 18, this week's pick Fri, Sat, Sun (all still ahead). Shown: "Missed 3 workouts". Right: none; last week's days are not stored.
- Why: SPEC 0 rule 1.
- Smallest fix: for the weekly style, count only days from the start of this week.

### A10 MAJOR: a plate machine earns a false record after the "one side or both" answer changes
- Where: `src/lib/records.ts:155-200` and `src/db/history.ts:302`; neither applies `sameHorns`, which progression (`:156`), `loadAt` and the coach (`src/db/coachData.ts:144`) do. Reproduced by script (`/tmp/audit-3.6c/horns.ts`).
- Input: earlier, answered "one side": 45 on the horn × 10 (stored total 45). The answer changes to "both sides"; today the same plates × 10 are stored as 90. Shown: "90 lb × 10, your best yet", "+45 lb". The other direction hides real records.
- Why: SPEC 0 rule 1, SPEC 21.1. Narrow path, but it is a false personal record.
- Smallest fix: when grouping earlier sets for records, leave out plate machine sets whose `hornsOf` differs from today's.

### A11 POLISH: the finish screen's "Time" has no upper limit
- Where: `src/screens/workout/FinishScreen.tsx:83`, `src/screens/history/HistoryDetail.tsx:39`. Code read.
- Steps: start at 7 PM, close the app without Finish, Resume and Finish at 8 AM. Shown: "780 min", and the same in History for good.
- Fix: hide the Time tile above a sane limit (about 4 hours), as imported workouts already do.

### A12 POLISH: unsure imported sets count in History's total and look like sure ones
- Where: `src/screens/history/HistoryDetail.tsx:40` and `:73-79`. Code read.
- What: a set marked `uncertain` is summed into "… lb lifted" and printed with no mark, while records skip it.
- Fix: leave unsure sets out of the total and mark the row.

### A13 POLISH: a workout that crosses midnight makes the next day read "Done for today"
- Where: `src/db/schedule.ts:55` and `src/db/coachData.ts:245` test `endedAt >= midnight`; History, the week strip and the 48 hour rule use `startedAt`. Code read.
- Steps: fixed schedule Tue and Wed, start Tue 11:30 PM, finish Wed 12:20 AM. Wednesday shows "Done for today".
- Fix: use `startedAt` in both places.

### A14 POLISH: one tap on lb / kg in Settings resets the gym's weights, with no Undo
- Where: `src/db/equipment.ts:89-110` (`setGymUnit`), `src/screens/SettingsScreen.tsx:162-170`. Reset reproduced (script s17: range 5 to 50 lb became 2 to 24 kg at once); the rest code read.
- What: the tap replaces the plate list, bars, stack step and dumbbell range with defaults and clears every bar and starting weight answer. Tapping back does not bring them back. A Home or No equipment gym with a hand set dumbbell range gets `dumbbellRange: null` (its preset has none) while dumbbells stay switched on; I did not run what the picker then shows.
- Why: SPEC 13.1 (undo instead of confirm). Nothing is guessed afterwards, the questions are asked again.
- Fix: an "Units changed · Undo" toast that puts the previous gym record back; keep a custom range's presence for Home gyms.

### A15 POLISH: the coach's own warm up sets are in no time estimate
- Where: `src/lib/plans.ts:326` (`estimateDayMinutes`) reads only the plan day; warm ups are added in `src/screens/workout/useExerciseRows.ts:64`. Seen in the app (script s10: three warm up rows on the first lift of a "~45 min" day); size in minutes not measured.
- Fix: add the warm up rows inside the one estimator (SPEC 7.4 "+ warmups").

### A16 POLISH: the finish line "3 sets · 30 lb each × 12" reads as three sets of 12
- Where: `src/screens/workout/FinishScreen.tsx:222-231`. Reproduced (script s9: the sets were 12, 8, 8).
- What: by design it is the count, then the best set, but nothing says "best".
- Fix: "3 sets · best 30 lb each × 12".

### A17 POLISH: changing reps on a row does not carry to the rows below
- Where: set table, exercise screen. Reproduced (script s6): set 1 changed from 8 to 12, rows 2 and 3 stayed 8, so three taps logged 12, 8, 8. A weight change does carry down (SPEC 20.2). SPEC does not require it for reps; it costs taps on every first session.
- Fix: carry a reps change to the unlogged rows below when they still hold the old default.

### A18 POLISH: tests kept as expected failures, and code Session 4 will lean on
- `src/db/__tests__/codex-backup-arriving-correction.test.ts:28` and `codex-cross-tab-submission-evidence.test.ts:47, 85` are `it.fails` (two tab and same instant cases, each with a written reason); `codex-submission-undo-atomicity.test.ts:53` is `it.skip` for a hook that no longer exists and can be deleted.
- No migration test opens a database at exactly v6 (the v7 `kv` store); every other step has one.
- 56 screen files still import `src/db` (listed in `scripts/boundary-allow.json`). `src/screens/workout/rowLog.ts` (405 lines) writes `journal`, `kv` and reads `submissions` directly: it is saving logic living in a screen folder, and the run tracker will want the same pattern. Move it to `src/db/` before 4.3.
- `src/lib/extraSets.ts`, `drafts.ts`, `rest.ts` and `durable.ts` import the database although MAP.md calls `src/lib` pure.
- Over 400 lines: `lib/drafts.ts` 563, `lib/setTable.ts` 514, `db/mutations.ts` 455, `screens/SettingsScreen.tsx` 433, `lib/swap.ts` 425.
- `recordsFor` and `workoutRecords` in `src/lib/records.ts` have callers only in tests; knip lists 227 unused exports (`reports/deadcode-2026-11.md`).

## Not verified (do not turn into fix items without a check)

- A backup holding a plan with an owner approved candidate exercise is also refused as "damaged" on another phone (`src/lib/backupChecks.ts:138`). A throwaway test fails as described (`/tmp/audit-3.6c/repro/gate.test.ts`, `gate2.test.ts`), but I did not walk it in the app, and it needs the owner Review screen. Same family as A1; fix together.
- A gym can be deleted while a deleted set waiting for Undo still names it (`src/db/gymList.ts:74-79`), after which backups fail the reference check. Reported by a code read I did not repeat.
- The reveal sentence "Nothing here for pull ups, leg extensions and leg curls: that takes gear you don't have." appeared for a hotel gym with Arms as the focus. I am not sure what it refers to.
- The stack picker opens at "Steps of 5 · Change" and never asks "5, 10 or other?" on first use (SPEC 5.3 table). No number is guessed; I did not check whether this was a decision.

## Checked and found sound

Barbell total and stored load on a kg bar (20 + 2 × (20 + 20 + 2.5 + 1.25) = 107.5); total lifted with dumbbell pairs and across units; lb to kg conversion of last time when nothing steps (30 lb → 14 kg); the heaviest dumbbell cap ("Heaviest here is 50 lb: add reps"); no record claimed on a first session; a double tap logs one set; a reload keeps a picked weight; the landscape card; Replace is one transaction and validates before deleting; merging the same backup twice adds nothing; all 11 schema versions only add.

## The 5 changes that would most raise how the app feels

1. Warm the active plan's photos for offline (A4): the first hotel gym session shows form.
2. Make "Next" honest across racks (A2, A3, A6): the number a traveler sees in a new gym is the one a coach would say.
3. Fix restore for tuned plans and carry the coach's data (A1, A7): a new phone opens exactly where the old one stopped.
4. Keep a plan and its workouts together through tips and rebuilds (A5): Today never changes its mind without saying why.
5. Carry reps down the rows and name the best set on the finish screen (A17, A16): fewer taps, and a summary that reads true at a glance.
