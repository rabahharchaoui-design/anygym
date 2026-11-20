STATUS: HANDLED fix item 4.6c (2 major, both real)
Grok Build honesty audit, written Nov 19 17:01 at 88eb3749. A second opinion, not orders: SPEC.md wins.

I'll audit AnyGym for numbers, muscles, demos, and coach lines the app shows without backing them up. First I'll read the spec and the newest reports so I don't repeat findings already listed.

The last honesty audit and the newest Codex notes are in. Next I’ll check built surfaces those reports don’t already cover: coach lines, muscle labels, demos, PRs, and numbers.

I’ll confirm the two remaining honesty holes against the current source and the newest reports, then write only findings that are still real.

The coach line and the summary pace still look like open holes. I’ll pin the exact lines and the concrete cases before writing the audit.

# Grok honesty audit

- MAJOR `src/screens/today/useCoach.ts:58` — Overhead Press yesterday and Overhead Press on today’s plan, with no other coach card, makes Today say “You trained front and side delts yesterday, and today works it again. Go a little lighter if it feels tired.” The press is front delts (`Standing_Military_Press`). Side delts were not in that workout. A lateral-raise day (`Side_Lateral_Raise`, label “side delts”) matches the same drawing region and gets the same sentence, and Thigh Abductor (map text “Outer hips”) is called “glutes.” `recoveryRegions` (`src/db/coachData.ts:246`) matches the coarse region, and `nameOf` is `regionWord` (`src/db/coachData.ts:68`), so `recoveryLine` (`src/lib/coach/today.ts:140`) prints “front and side delts” or “glutes.” Worked lately already uses the exercise’s own words. Smallest fix: name this line with those own primary labels, and treat two days as the same muscle only when the labels match.
- MAJOR `src/screens/run/RunSummary.tsx:61` — Run 100 s, lose GPS for 40 s (the app bridges 120 m), then run 100 s. Finish shows about 0.72 km, moving time 3:35, and average pace 5:33/km (`src/lib/run/__tests__/live-4.3.test.ts:218`). Distance divided by that moving time is about 4:59/km. The 120 m straight line is in the distance and out of the pace, and the first 15 s of the gap are in the moving time and out of the pace (`rowPace` in `src/lib/run/summary.ts:41`). The dashed note explains the 15 s and says nothing about those meters. The same three numbers are on the run in History (`src/screens/history/RunDetail.tsx:57`). Smallest fix: on both screens, say that average pace leaves out the dashed stretch’s distance.
