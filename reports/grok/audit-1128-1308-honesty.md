STATUS: NEW
Grok Build honesty audit, written Nov 28 13:20 at ea406820. A second opinion, not orders: SPEC.md wins.

I'll audit AnyGym for numbers, muscles, demos, and coach lines the app cannot back up. First I'll read the spec, the plan, and the newest reports so I don't repeat findings already listed.

The newest honesty pass is from November 27. I'll read that, the latest Codex hunts, and the honesty rules before looking at the code.

The November 27 honesty findings are already listed and marked handled. I'll look at surfaces those reports do not cover, starting with finish stats, coach lines, and demos.

The one-set “you trained” coach line is the open lead. I’ll confirm it is on Today and that newer reports do not already list it, then write the audit.

# Grok honesty audit

- MAJOR src/db/coachData.ts:281 — Log one working set of barbell back squat yesterday and open Today on a plan day that also works quads, with no other coach card. Today says “You trained quads yesterday, and today works it again. Go a little lighter if it feels tired.” (`src/lib/coach/today.ts:140`, shown by `CoachLine` in `src/screens/TodayScreen.tsx:287`). SPEC 20.3 and PLAN R4 let a sentence call a muscle trained only after 3 certain primary working sets. The schedule card already uses that count. One set is enough for this line. Smallest fix: add a muscle to yesterday in `recoveryRegions` only after 3 certain primary working sets; otherwise show no line.
