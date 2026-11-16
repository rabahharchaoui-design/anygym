Score: 5/10

# ux-critic on PLAN 3.6g2 (schedule and focus flow), Nov 16

Method: dist served on 4186 and driven with Playwright WebKit as an iPhone 15 Pro. I seeded the reveal for 140 cases (7 pick sets × 2 to 6 days × 30/45/60/75 min, full gym preset), then ran 21 targeted cases (hotel, home, outdoors, grip, legs, weekly, fixed, 7 picks, fit-button taps), accepted 10 plans to read the stored days, and walked the whole intake by taps (new lifter, fixed Mon/Wed/Fri, 45 min, Lats/Side shoulders/Biceps) through Today, Plans and the plan screen. I also took a quick reveal look on iPhone SE and 360x640: no horizontal scroll and no clipping. No console errors apart from a CSP stylesheet notice. Data and screenshots are in /tmp/critic-3.6g2/ (sweep.json, taps.json, days.json, walk-i15-*.png).
Not verified because the run was interrupted: "Done for today" after a finished fixed day, the stretch rows in the live workout ("80 sec each side", "Side 1 of 2"), the stretch count in the workout preview, and the motion videos. Those parts of rule 6 are UNVERIFIED, not passed.

## The six rules

| # | Rule | Result | Evidence |
|---|---|---|---|
| 1 | Strict rank, #1 gets at least +3 | FAIL | Order holds except where a higher pick is marked plenty or capped. #1 falls under +3 in 31 of 140 sweep cases while it has exercises: Lats only, 6 days 45/60 min: "Lats 14 sets +2 extra". Lats only, 6 days 75: "Lats 15 sets no extra · Its days are full". 5 picks, 4 days 30: "Lats 5 sets no extra · Its days are full". Side shoulders #1 of 6 picks, 3 days 30: "Side shoulders 2 sets no extra". |
| 2 | Under 16 never plenty or no extra without a reason | PARTLY | "plenty" now appears only at 20 or more (Back 24, Quads 20). Every no-extra row under 16 has a reason, but the reason is often untrue: 6 days 75 min, "Lats 15 sets no extra · Its days are full", yet the headline says "about 70 min" (5 free minutes a day) and 5 days 75 gives Lats 20. Legs, 4 days 60: "Glutes 4 sets no extra · Its days are full". |
| 3 | More buys more | FAIL | 95 drops across 140 cases. Lats only: 5 days 75 = 20, then 6 days 75 = 15. Lats + Side shoulders: Side shoulders 5 days 75 = 14, then 6 days 75 = 6. Lats/Side/Biceps: 6 days 60 = Side 10 and Biceps 18, then 6 days 75 = 6 and 12. Upper chest + Mobility: Upper chest 2 days 60 = 8, then 2 days 75 = 4; 3 days 60 = 16, then 3 days 75 = 12. Stretch minutes only ever went up (pass for Mobility). |
| 4 | Under 12 is said, with the step and real numbers | FAIL | It works when a step exists, and promises matched after tapping ("Make it 60 min: Lats 12 to 14 and Side shoulders 9 to 11" gave 14 and 11; "Make it 5 days: Lats 8 to 16, Side shoulders 8 to 10 and Biceps 11 to 15" gave exactly that). But many cases have no step at all and only say "Side shoulders and Biceps stay under 12 sets: extra work stops at 12 sets a week." (3 picks, 4 days 60, while 5 days was available). The step is also often a huge jump: "Make it 5 days and 75 min" from 3×45 for a brand new lifter, "Make it 4 days and 60 min" from 3 days × 20 min, "Make it 60 min" from 30 min. |
| 5 | Spread | FAIL | Biceps only, 3 days 60, Day A: "EZ-Bar Curl x2 ; Dumbbell Bicep Curl x4" back to back, plus a barbell curl (3 curls). Day C: "Barbell Bicep Curl x2 ; Dumbbell Bicep Curl x2" back to back. Back, Shoulders, Arms at 3 days 45, Day B: "[Reverse Flyes + Triceps Pushdown - Rope] x2 ; [Machine Seated Reverse Fly + Cable Tricep Pushdown] x2", the same pair twice. Walk plan Day 1: "Pair: Barbell Bicep Curl + Straight-Arm Pulldown", then "Pair: Dumbbell Lateral Raise + EZ-Bar Curl", then "Seated Side Lateral Raise", with only one leg move on a "Full body" day. Lats only, 5 days 75, Pull day: Chin-Up, Leverage Iso Row, Lat Machine Wide Grip Pulldown, Straight-Arm Pulldown: four lat moves. |
| 6 | Small truths | PARTLY | Hotel duplicate sentence: FIXED. Hotel lats claim: WRONG (see B2). Plans card vs reveal headline: these agree, but the plan screen headline ("Built from your answers: 3 days a week, full body.") drops the extra-work line. I saw no "and more" in any day card. Stored stretch durations are 50, 60 or 80 s per side. Done for today, the on-screen stretch words and the preview count: UNVERIFIED. |

## Old findings (reports/critic-3.6g.md)

| Old finding | Now |
|---|---|
| A single pick gets nothing more from more time | PARTLY: Lats only, 4 days now gives 60 min 16 and 75 min 18. But 2 and 3 days give 60 = 75 = 16, and 6 days gives less than 5 days (14 to 15 vs 16 to 20) |
| Rank broken (#1 no extra while lower picks +3) | PARTLY: order now holds; #1 still gets +0 or +2 at 6 days and 30 min |
| Same number, three words (12 = +4 / no room / plenty) | FIXED for plenty (20 or more). The new "stays under 12 sets: extra work stops at 12 sets a week" is a fresh contradiction |
| More minutes can give less | STILL THERE (95 cases) |
| 3-day plans 4 to 11 sets with no fit line | PARTLY: fit lines now name steps, but the steps are 2-day or combined jumps |
| 4 days 45, 2 vs 3 picks fit-line inconsistency | FIXED (both now get a step) |
| Hotel same sentence twice | FIXED |
| Hotel "Lats needs equipment" doubtful | STILL THERE, now "Lats has no exercise of its own with this equipment" with a cable station and dumbbells |
| Home headline "about 38 min" vs days 43/43/27 | STILL THERE |
| Home "Nothing here for pull ups, side raises and more" | STILL THERE |
| 20 min "Add minutes" with no value | PARTLY: the button now says its value, but that value is "Make it 4 days and 60 min" (×4 the weekly time) |
| Lats piled on one "full body" day | PARTLY: 3 lat moves per day now, but Day B gets 0 extra and the curl and raise doubles are new |
| Plans card vs headline story | FIXED (card = reveal); the plan screen still lacks it |
| Legs 4 days 60: Glutes 4 sets | STILL THERE ("Glutes 4 sets no extra · Its days are full") |
| Grip/Forearms/Obliques "no exercises yet" in a full gym | STILL THERE (honest, and the Grip tile says "None yet") |
| Stretches "2 sets × 80 sec" | UNVERIFIED on screen (the stored data is per-side seconds) |
| Amber "That is 1 day. You said 3." after the first chip | STILL THERE (walk-i15-10-one-day.png) |
| "Pick 3, or Skip to stay flexible" | STILL THERE |
| "and more" on day cards | Not seen (FIXED as far as tested) |

## Ranked list

1. BLOCKER · Your plan, fit line. "Side shoulders and Biceps stay under 12 sets: extra work stops at 12 sets a week." The 12 here is the total extra budget, but a normal person reads it as the muscle's own count, which contradicts "Lats 14 sets" in the row just below. It appears in about half the cases, with no button even when 5 days or 75 min would help. Fix: name the step ("Make it 5 days: Side shoulders 8 to 10"). If none exists, say "You picked 3 areas; we cap extra at 12 sets a week in total so you can recover", and never write a per-muscle "12".
2. BLOCKER · Hotel reveal. "Lats has no exercise of its own with this equipment" with dumbbells, a bench and a cable station. That is wrong data: the full gym plan itself uses the cable Straight-Arm Pulldown, and Single Arm Dumbbell Row is in the catalog. Fix: match lat exercises to the hotel equipment (cable pulldown or straight-arm, one-arm dumbbell row).
3. BLOCKER · 6 days at 75 min. "Built to add muscle: 6 days, about 70 min" with "Lats 15 sets no extra · Its days are full". The only pick gets nothing, at the most time possible, and the reason is false because 5 minutes a day are left. 5 days 75 gives Lats 20. Fix: at 6 days, put the extra on the two pull days, and never say "days are full" while the day is under its minutes.
4. BLOCKER · More time gives less (95 cases). Examples: Side shoulders 14 to 6 (5 to 6 days at 75), Upper chest 8 to 4 (2 days 60 to 75), Biceps 18 to 12 (6 days 60 to 75). Fix: build the bigger plan, then clamp each pick to at least its value in the smaller plan.
5. BLOCKER · #1 under +3. "Lats 14 sets +2 extra" at 6 days 45/60, and "Lats 5 sets no extra" at 4 days 30 with 5 picks. Fix: the #1 pick gets +3 before any other pick gets anything, and at 30 min drop lower picks rather than starve #1.
6. BLOCKER · Fit button jumps. "Make it 5 days and 75 min" from 3×45 for a "Brand new" lifter (×2.8 weekly time) still leaves "Side shoulders 6 to 8 and Biceps 8 to 10" under 12. "Make it 4 days and 60 min" from 3×20. Fix: offer the smallest single step (one day or +15 min) with its numbers; never offer a combined step to a new lifter, and never offer a step that leaves the picks under 12.
7. BLOCKER · Day content (Spread). Near-identical curls back to back ("EZ-Bar Curl x2 ; Dumbbell Bicep Curl x4"), the same reverse fly + pushdown pair twice in a row, two lateral raises on one 45 min day, four lat moves on one Pull day, and a "Full body" day with one leg move. Fix: at most one move of the same pattern per day, and spread the extra sets onto the other days that train it (Day B gets 0 today).
8. BLOCKER · Home reveal. "about 38 min" when the days read ~43, ~43 and ~27 on a 45 min choice, plus "Nothing here for pull ups, side raises and more", gear the person never asked about. Fix: give a headline equal to the day average and balance the days, and name only what touches their picks.
9. BLOCKER · Legs 4 days 60. "Glutes 4 sets no extra · Its days are full" in a full gym with Hip Thrust on both lower days. Fix: put glute extra on Lower A/B or give a true reason.
10. POLISH · Focus step. With 3 picks there is no rank control, yet rank decides "Most extra work: Lats". Fix: show "Your order: Lats, Side shoulders, Biceps · Change" from 2 picks.
11. POLISH · Plan screen headline. "Built from your answers: 3 days a week, full body." does not mention the focus, the minutes or Mon/Wed/Fri, which the Plans card and the reveal do. Fix: use the reveal headline.
12. POLISH · Schedule step. "That is 1 day. You said 3." appears after the first chip. Fix: show it only when Continue is tapped with the wrong count.
13. POLISH · Headline grammar. "extra back, shoulders and arm work" and "extra abs and glute work". Fix: use the row names ("Arms", "Glutes").
14. POLISH · Summary words. "Most extra work: Quads, Hamstrings and Calves" when all three are +2. Fix: say "Same extra for each: +2".
15. POLISH · Plans tab. The Your plan card sits below the fold under four place tiles, and its headline is cut ("3 days a week, full body" wraps under the tab bar). Fix: put Your plan first.
