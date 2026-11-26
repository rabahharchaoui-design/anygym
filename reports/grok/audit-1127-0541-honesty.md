STATUS: HANDLED Nov 27: all three points real, new item R4 (4) to (6) (triage 15)
Grok Build honesty audit, written Nov 27 05:59 at 4d800008. A second opinion, not orders: SPEC.md wins.

I'll audit only what's already built, starting with the spec, the plan, and the newest reports so I don't repeat known findings.

The newest honesty report is from last night. I'll read that, the latest Codex hunts, and the spec rules before looking at the code.

R3 and H2 landed after the last honesty pass. I'll check those fixes and look for numbers the app still shows without support.

I'll finish the honesty checks that were still open: whether the level-up "two weeks in a row" line is shown, and whether the Quick knees sentence ever reaches the screen.

# Grok honesty audit

- MAJOR `src/lib/coach/levelUp.ts:58` — Squat Monday for 10, 10, 10 and Friday for 12, 12, 12 at the same weight, range 8–12. Nothing fell under 8, so the week is not treated as a miss, and only Friday is checked for the top of the range. Today’s Level up card says “You hit all your reps on 1 lift last week” and “+10 lb: you hit 3 × 12 last week”, and Add weight raises the lift. Monday never reached 12. Smallest fix: require every session that week to be one weight and at the top of its range before a raise, and build the “you hit N × R” line from a scheme all of those sessions actually logged.
- MINOR `src/lib/coach/levelUp.ts:36` — The same card can describe this week’s scheme as two weeks of work. Log 3×12 at 200 lb one week, then 4×12 at 200 lb and tap Easy. The row reads “+15 lb: you hit 4 × 12 two weeks in a row, with reps to spare” (`src/screens/today/CoachList.tsx:22`). The earlier week was 3×12 and had no Easy mark. `sameTop` matches the pin only, so a lat pulldown at pin 100 + 50 lb and the next week at pin 100 + 25 lb also counts as the same. Smallest fix: say “two weeks in a row” only when the earlier session’s whole resistance (`comparableWeight`), set count, and range top match this week, and add “with reps to spare” only when that earlier session was Easy too.
- MAJOR `src/lib/recovery/trained.ts:40` — Log 2 barbell curls and 1 triceps pushdown. The arms group reaches 3 sets, so both biceps and triceps are stored as trained. Hit what’s fresh says “Skips biceps and triceps (trained today)” (`src/lib/quickCards.ts:195`) and drops triceps moves. A style card can say “Leaves out triceps (trained today)”. Triceps was the primary on one working set. Smallest fix: name a muscle as trained, and put it on those lines, only when that muscle itself was the primary on at least 3 working sets in the workout.
