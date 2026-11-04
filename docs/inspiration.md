# Inspiration study (PLAN 3.0): Hevy and Bevel patterns for Sessions 3 to 7

Patterns only. No asset, name, icon, layout or copy text from any app is reused. SPEC.md and PLAN.md win over this file. Everything marked "Proposal" is for G to accept or reject; this file changes no requirement.

## 1. Method note

Research date: 2026-11-05. Writer: Claude (orchestrator side). No personal data used; nothing read from ~/anygym-private or ~/.config.

Sources used (all public). Claims below cite them as [S#]. Anything not cited is my own inference and says so.

| ID | Source | What it gave |
|---|---|---|
| S1 | https://screensdesign.com/showcase/hevy-workout-tracker-gym-log | Timestamped Hevy teardown: onboarding, soft paywall, tips, set check, critique |
| S2 | https://apps.apple.com/us/app/hevy-gym-tracker-workout-log/id1458862350 | Hevy listing, version notes (3.2.x), review themes |
| S3 | https://apps.apple.com/us/app/bevel-ai-health-coach/id6456176249 | Bevel listing, version notes (3.2.x), review themes |
| S4 | https://screensdesign.com/showcase/bevel-health-performance | Timestamped Bevel teardown: dashboard, learn more, cards, bulk add critique |
| S5 | https://feedback.bevel.health/feature-requests/p/improve-onboarding-to-bevel | Bevel's own feedback board, 73 votes, onboarding clarity |
| S6 | https://neura.health/insight/bevel-health-app-in-depth-review | Bevel review (author is a competitor, discloses it) |
| S7 | https://justuseapp.com/en/app/6456176249/bevel-ai-health-coach/reviews | Aggregated Bevel App Store review themes (NLP summary, 14.6K reviews) |
| S8 | https://gainframe.app/blog/hevy-app-review/ | Hevy review (author is a competing app); free-tier limits |
| S9 | https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577 | Strong listing, review themes (contrast) |
| S10 | https://apps.apple.com/us/app/fitbod-workout-fitness-plans/id1041517543 | Fitbod listing, review themes (contrast) |
| S11 | https://help.hevyapp.com/hc/en-us/articles/38385724273047-Hevy-Trainer-Explained-How-It-Builds-Your-Workout-Program and https://www.hevyapp.com/features/workout-plan-generator/ | Hevy Trainer: exclude list, auto weight adjustments |
| S12 | https://www.sensai.fit/blog/hevy-vs-strong-vs-fitbod (and similar 2026 comparison blogs) | Logging speed ranking; affiliate style, weak evidence |
| S13 | Search results for workout app design write ups (Mobbin style queries), e.g. https://mechanics-playbook-next.pages.dev/case-studies/gymverse/ and App Store listings of small apps | Mini rest bar, auto start timers, weekly streak with rest week |
| L1 | G's local notes, private, not in git: .design-ref/inspiration/hevy-research.md, competitors-research.md, hevy-ui-sheet-1/2 jpg, hevy-intake-*.png | G's own screenshots of Hevy on his phone, Nov 1. Cited by file name only. |

What was not accessible or is weak:
- Mobbin itself returned nothing through search (login wall). I used write ups and listings that describe the same pattern types instead [S13].
- App Store screenshots are image only on the fetched pages; I could not see them. For visual evidence I relied on timestamped teardowns (S1, S4) and G's own screenshots (L1), which I viewed.
- Reddit threads: searches returned no actual Reddit posts for Hevy or Bevel in 2025 or 2026. Review evidence is therefore App Store and aggregator level (S2, S3, S7), Bevel's feedback board (S5), and competitor authored reviews (S6, S8). Competitor authored and affiliate pages are flagged where used. Treat them as anecdote, not prevalence.
- Page content was summarised by a fetch tool. Counts (ratings, prices, revenue) differ between pages (S1 shows two different revenue figures); I use no revenue figures. Ratings quoted are about 4.8 to 4.9 for all apps, which tells us little.
- I could not verify Hevy "Gym Profiles" beyond the App Store release note in S2; the help pages I reached did not mention it.
- Behaviour that a static screenshot cannot prove (timing, haptics) is marked inference.

## 2. The 20 patterns

Format: Pattern (one line) / Seen / Why it works / AnyGym / Risk.
Status words: covered (already in SPEC 21 or elsewhere), extends, new.

### P01 Last time, tap to copy
- Pattern: each set row shows what the user did in that set last session; tap copies it into the row.
- Seen: Hevy set table [S2 "last session's numbers shown for each exercise"; S8 "same exercise, your last performance and today's result connected"]; Strong [S9].
- Why: removes memory and typing; the comparison happens where the decision is made.
- AnyGym: SPEC 21.1 set table, SPEC 20.2. Already built (SetTable, copyLast). Keep as is; also show it as "no history yet" honestly for new exercises, never a placeholder number.
- Risk: when the gym or bar changes, last time may not be loadable; show it but round on tap (SPEC 5, load.ts).

### P02 Prefilled rows, one check per set, rewarding check
- Pattern: rows arrive filled with the target; logging is one tap, and the tap feels good (check draws in, row tints, light haptic).
- Seen: Hevy check animation at 03:45 [S1]; "two taps per set" style apps [S13]; Strong ranked fastest at logging [S12, weak]. The target prefill itself is AnyGym's own (SPEC 20.2), not something Hevy does.
- Why: logging cost is the main reason people abandon trackers (inference).
- AnyGym: SPEC 20.2, 21.1, 23.3, tap budgets 20.4. Covered.
- Risk: a one tap check can record a number the user did not do. Keep the Undo toast and never auto-complete a set.

### P03 Slim rest bar that survives scrolling and app switches
- Pattern: a mini timer bar pinned at the bottom, starting on check, so the user never loses track of rest when scrolling to the next set.
- Seen: a design write up calls the mini timer bar added mid development "the single most impactful UX decision" [S13]; Strong ships rest timer and Live Activity [S9]; Hevy auto rest timers [S2].
- Why: rest is the main idle time in a session; the bar turns it into a glanceable countdown.
- AnyGym: SPEC 21.1 (already). Extend: deadline based countdown (survives suspend), plus a Web Push "rest done" nudge only if SPEC 18 push is live.
- Risk: iOS Safari suspends the page; a web app cannot match a native Live Activity. State this honestly in Settings help, not in marketing.

### P04 Rest timer can be Off per exercise (pairs and circuits)
- Pattern: per exercise rest has an Off option, so paired moves do not start a countdown between them.
- Seen: L1 hevy-research.md item 2 (G's notes on Hevy); not verified in a public source.
- Why: a countdown in the middle of a pair is noise.
- AnyGym: SPEC 21.1 says per exercise editable; add explicit Off and make pairs default to rest only after the second move. Owner: PLAN 3.4 (pairs) or a small fix item.
- Risk: users forget Off is on and skip rest on heavy lifts; show a quiet "No rest timer" line on that exercise.

### P05 One time tip at the moment of need
- Pattern: a short pop up explains a non obvious input exactly when first used (Hevy explains dumbbell weight entry).
- Seen: Hevy 01:46 [S1]; Fitbod first time tooltips [L1 competitors-research.md].
- Why: teaches without a tour; users who never read onboarding still learn.
- AnyGym: SPEC 13.1 (one coach mark per feature). Extends: add a registry of tips keyed by trigger, shown once, never stacked; tests assert max one at a time.
- Risk: tips shown at the wrong time are worse than none; tie each to a user action, not a screen load.

### P06 Small honest feedback states: inline valid, branded wait, saved
- Pattern: green check the instant a field is valid [S1 00:19]; the logo animates instead of a generic spinner [S1 00:22]; saving a plan needs an explicit confirmation, which Hevy lacks [S1 11:07, S1 critique].
- Why: confidence that the app heard you. The missing save confirmation is a reviewer level flaw, not a nice to have.
- AnyGym: SPEC 13 and 23.3 (skeletons, undo toasts). New detail: "Saved" toast with Undo on plan save, import commit, gym edit; mark draws in under 400 ms only when a load really takes time.
- Risk: fake loading animation that hides instant data; do not animate when the work took under 150 ms.

### P07 Exercise page: Summary, History, How to, with honest empties
- Pattern: tabs on one exercise: demo plus records block, past sessions, form cues. Empty states say "No data yet" and "No exercise history, it will appear when you log it".
- Seen: Hevy exercise pages in L1 hevy-ui-sheet-2 (Summary / History / How to, "No data yet", metric chips Best Time, Total Time, Most Reps); S1 custom exercise flow 01:28 to 03:15.
- Why: the exercise is where people ask "am I getting better?"; empties that explain avoid a dead end.
- AnyGym: SPEC 21.1 (tabs How to, History, Charts, Records), PLAN 7.1. Covered, still to build. The metric chips should follow the exercise type (time for planks, reps for bodyweight), as the screenshots show.
- Risk: charts with 1 or 2 points mislead; show a chart only from 3 sessions, else a plain list.

### P08 Records are easy to find
- Pattern: personal records are a named block per exercise and a list reachable from Profile or History, not buried.
- Seen: Fitbod reviewers say PRs are hard to find and want a section [S10]; Hevy exercise page shows a Personal Records block [L1 sheet 2]; Hevy lists PR tracking [S2].
- Why: records are the cheapest motivation we have and cost no new data.
- AnyGym: SPEC 21.1 finish screen PRs, PLAN 7.1 Records tab. Extends: one "All records" list (by exercise, recent first) from History.
- Risk: warm ups, drops and failed sets must never create a PR (SPEC 21.1); mixed units must compare correctly in load.ts.

### P09 Plans picked by place, level and goal
- Pattern: a grid of "routines by place" (home, travel, dumbbells only, gym, bodyweight...) plus a program list with filter chips Level, Goal, Equipment; each program card shows name, level and "3 routines".
- Seen: L1 hevy-ui-sheet-1 (Explore: programs list with Filters, Level, Goal, Equipment; Routines grid by place).
- Why: matches how people think ("I am in a hotel"), which is AnyGym's wedge.
- AnyGym: PLAN 3.1 curated plans, SPEC 7, SPEC 19 presets (Hotel gym, Home...). Use our own art and names, filter chips, and a "Fits your gym" badge computed from catalog equipment, never from a tag typed by hand.
- Risk: a plan that says it fits a gym but contains one missing machine. Compute fit; show "2 swaps needed".

### P10 Generator with reversible excludes and explained auto adjustments
- Pattern: a program built from experience, goal and equipment; the user can exclude exercises and bring them back from a list; weights adjust automatically after performance, with reminders when progress stalls.
- Seen: Hevy Trainer [S11]; Fitbod swap, exclude, edit mid workout [S10]; Hevy 3.1.x added Program Variety and Injury Management settings and reps only progression [S2].
- Why: control without a blank page. Reversibility makes users willing to exclude.
- AnyGym: SPEC 14 (go easy on, never want), SPEC 15, PLAN 3.5 and 3.8. Extends: "Never show" list in Settings → My profile with one tap restore; every auto change carries its one line why (SPEC 15 already requires).
- Risk: Hevy's injury setting is a medical looking promise. Keep SPEC 15 wording: stored on the phone, never medical advice.

### P11 Gym profiles carry their own history
- Pattern: gyms are first class; equipment sets the workout (Fitbod) and, in Hevy 3.2.4, stats and feeds are per gym [S2, S10].
- Why: a hotel bench is not your home bench; mixing them makes last time wrong.
- AnyGym: SPEC 3 and 19, PLAN 3.9. Extends: last time and records can filter "this gym / all gyms" (see gap 1).
- Risk: splitting history makes charts sparse; default to all gyms for records, this gym for loadable weights.

### P12 Intake: one question per screen, big cards, Continue stays disabled until a pick
- Pattern: one clear question, large option cards with an icon and radio, back button always, grey Continue until answered.
- Seen: L1 hevy-intake-1 to 9 png (gender, birthday, weight, height, goal with 3 options, experience, two promo screens, ready).
- Why: lowest cognitive load; progress feels fast.
- AnyGym: SPEC 14 (covered, more options than Hevy's three goals). Keep Skip on personal screens; Hevy has no visible progress; we add it (SPEC 21.3).
- Risk: promo screens in the middle of the funnel (Hevy has two, L1) add taps with no input; skip that.

### P13 Show value before asking for anything; account comes later and softly
- Pattern: Bevel's long 34 step onboarding "shows how the app will help" early [S4 01:19, 04:51], then a soft paywall. Hevy forces sign up before any feature and puts a paywall right after setup [S1 00:39]; the teardown suggests a guest mode.
- Why: investment and early value help conversion, but forced sign up blocks exploration (S1 critique).
- AnyGym: SPEC 14 plan reveal as the value moment; SPEC 18 account only after the first finished workout. Covered and stricter than both apps. Keep: no paywall at all.
- Risk: our own intake is long too (13 screens). Keep every screen skippable and time it (SPEC 13 asks about 2 minutes).

### P14 At a glance summary with "Learn more" overlays
- Pattern: calm cards with one number and one word; detail and explanation in an overlay, not on the card.
- Seen: Bevel dashboard summary and "Learn More" overlays [S4 05:11, 05:14]. Reviewers like the clean design [S7, S3]; a competitor review says the number of scores can feel crowded [S6].
- Why: keeps the home screen quiet; honest about what a number means.
- AnyGym: SPEC 21.2, InfoButton and InfoSheet already exist. Rule for Sessions 5 to 7: every score or coach line has a Learn more sheet; a card shows at most one number.
- Risk: precision theatre; scores "can look more precise than they are" [S6]. Only show numbers computed from logged data, with the basis stated.

### P15 A friendly first day instead of a blank dashboard
- Pattern: new users see something useful, not empty rings.
- Seen: Bevel dashboard starts completely blank; the teardown calls it demotivating and suggests a guided first day [S4 05:11]. Bevel's own board has users nearly giving up [S5].
- Why: first minute retention.
- AnyGym: SPEC 21.2 (already). Do it without sample data: today's plan, a ring at 0 of N, one tip. "No bad data": never pre fill fake history.
- Risk: temptation to show demo charts. Use an honest empty state with one action.

### P16 Reorderable, hideable home cards
- Pattern: edit mode on home; drag handles, hide cards.
- Seen: Bevel editable home cards [S4 14:01]; Bevel version notes mention redesigned sections and a Timeline [S3].
- Why: different users care about different things (lifter vs runner); a Run tab user wants a run card first.
- AnyGym: SPEC 21.2, PLAN 7.1. Covered. Order stored as a preference; tests for reorder, hide, reload (Codex brief 3.0 handoff).
- Risk: hidden card hides the only way to something (e.g. Resume). Active workout Resume is never hideable.

### P17 Muscle load and freshness map, from logged sets only
- Pattern: body map shaded by recent work; "Muscular Load" and "Muscle Freshness" appear in Bevel's 3.2.x Fitness redesign [S3]; Fitbod builds days from a recovery map [S10, L1].
- Why: one picture shows balance; it also explains why today's plan looks like it does.
- AnyGym: SPEC 21.1 finish map, 21.2 body map, competitors-research gap 4 (Fresh muscles card), PLAN 3.8, 7.1. Extends: label "Based on your logged sets", count only qualifying working sets, unknown mappings contribute nothing.
- Risk: calling it recovery is a physiology claim we cannot back. Name it freshness by days since trained; no percentages.

### P18 Calendar with weekly streaks that allow rest
- Pattern: home calendar shows planned and done days; weekly streaks can forgive a rest week, daily streaks punish rest days.
- Seen: fitness app case study (calendar as backbone of streak tracking) and a weekly streak with rest week [S13]; Bevel Training Calendar and calendar syncing for plans [S3]; Hevy profile calendar [L1].
- Why: a streak should reward consistency, not punish a deload.
- AnyGym: SPEC 17 (weekly streak, no daily), PLAN 5.1, 7.1. Extends: a planned deload or travel week does not break the streak (see gap 4).
- Risk: streak anxiety; never show a "lost" animation.

### P19 Explain the metrics, and let users say what they did before
- Pattern: Bevel's most voted onboarding request: explain what each metric means; and one user is flagged as overtraining because the app lacks earlier history [S5]. Reviewers also say it needs custom exercises and set types [S7].
- Why: a number you do not understand or trust is churn.
- AnyGym: SPEC 14 step 4 (experience) and SPEC 15 (coach, test set, welcome back). Extends: one optional intake question about the last 4 weeks of training so the first Level up card and fatigue hints are not wrong. Import (PLAN 3.2) feeds the same.
- Risk: lengthens the funnel; keep it one skippable chip row.

### P20 Add many exercises at once
- Pattern: multi select picker, "Add 4".
- Seen: Bevel building a workout one exercise at a time is tap heavy; the teardown suggests bulk add [S4 20:55 to 21:38].
- Why: removes the most repeated chore in plan building.
- AnyGym: SPEC 21.2 (already built per Codex brief). Keep and use the same picker for swaps (PLAN 3.4) and generator tweaks (3.5).
- Risk: batch add order; keep tap order, offer reorder, and let SPEC 22 ordering suggest a better sequence without forcing it.

## 2b. Contrast in brief: Strong and Fitbod

- Strong: praised for the simplest, fastest logging, plate and warm up calculators, smooth unit conversion when traveling [S9]. Complaints: rigid exercise database (cannot rename, convert or unhide; weighted plank style mixed types), plate calculator limited to common bar weights (a 25 lb smith bar cannot be entered), subscription cost, sync and sign in bugs [S9]. Lessons for AnyGym: per gym bar weights (SPEC 3, already designed), exercise types that can mix weight and time (inference: catalog load types in SPEC 4), and offline first so sign in bugs cannot block logging.
- Fitbod: praised for choosing the workout so the user does not plan, deep customisation, demos [S10]. Complaints: cannot leave the workout screen without ending it, PRs hard to find, promo text in shares, felt dated at first [S10]. Lessons: gaps 5, 6, 8 above.
- Speed rankings in comparison blogs put Strong first for logging speed and Hevy first for free features [S12]; these pages are affiliate style, so I use them only as a loose signal that AnyGym's 6 tap budget (SPEC 20.4) is the right fight.

## 3. Mapping: pattern to SPEC 21

| Pattern | SPEC 21 item | Status |
|---|---|---|
| P01 last time copy | 21.1 set table | covered |
| P02 prefill and check feel | 21.1 check feedback, SPEC 20 | covered |
| P03 slim rest bar | 21.1 rest timer | covered; extends (deadline, background nudge) |
| P04 rest Off per exercise | 21.1 rest timer per exercise | extends |
| P05 one time tip | 21.1 dumbbell tip, 13.1 coach marks | extends (registry) |
| P06 feedback states | none directly (13, 23.3) | new |
| P07 exercise tabs, honest empties | 21.1 detail tabs | covered; extends (type aware chips) |
| P08 records findable | 21.1 finish PRs | extends |
| P09 plans by place, level, goal | none (PLAN 3.1 only) | new |
| P10 generator with reversible excludes | none (SPEC 14, 15) | new |
| P11 per gym history | none (SPEC 19) | new |
| P12 intake cards | 21.3 avoid long onboarding; SPEC 14 | covered |
| P13 value first, soft account | 21.3 avoid paywalls; SPEC 18 | extends |
| P14 glance plus learn more | 21.2 rings and Learn more | covered |
| P15 friendly first day | 21.2 never blank | covered |
| P16 editable cards | 21.2 home cards | covered |
| P17 muscle load or freshness | 21.1 finish map, 21.2 map | extends |
| P18 calendar and weekly streak | 21.1 profile calendar; 17 | extends |
| P19 explain metrics, prior history | 21.2 Learn more | extends |
| P20 multi select add | 21.2 fix | covered |

Count: covered 9 (P01, P02, P03, P07, P12, P14, P15, P16, P20), extends 7 (P04, P05, P08, P13, P17, P18, P19), new 4 (P06, P09, P10, P11). P03 and P07 are covered with small extensions noted in their entries.

## 4. What SPEC 21 missed (proposals for G; SPEC is G's to change)

1. Per gym history filter: last time and records "this gym / all gyms", default all for records, this gym for loadable weights (P11, SPEC 19).
2. Rest timer Off per exercise, and pairs rest only after the second move (P04, SPEC 21.1).
3. A "Never show" exercise list in Settings → My profile with one tap restore, shown in generator results as "excluded: 3" (P10, SPEC 14 step 11).
4. Weekly streak that a planned deload or travel week does not break (P18, SPEC 17).
5. Leave the workout screen freely: Fitbod reviewers complain they cannot visit other screens without ending the workout [S10]. Propose a "workout in progress" bar on every tab; SPEC 20 is silent.
6. Share card for a lifting workout with no promo text and a privacy choice (Fitbod reviewers dislike promotional text in shares [S10]; SPEC 12 has a trim only for runs).
7. Optional "what have you done in the last 4 weeks" intake chip row so the coach and any fatigue hint never mislabel a returning user (P19, based on [S5]).
8. Bodyweight exercises and total lifted: a Hevy reviewer notes bodyweight squats add nothing to volume [S2]. Proposal: total lifted counts only known load; show "bodyweight" reps separately, and add bodyweight to the math only if the user entered it (load.ts, no bad data).
9. A single "All records" list and a "Saved" toast with Undo on every plan or gym save (P06, P08).
10. Date editing of past workouts with a year jump control; a Hevy reviewer asks for a year dropdown [S2]. Relevant to PLAN 3.2 import corrections.

## 5. Do not copy

- Paywalls, "Unlock Pro" screens, lifetime offers, testimonials and award badges on a paywall [S1]. AnyGym v1 has none (SPEC 21.3).
- Free tier limits (4 routines, 7 custom exercises, 3 months of stats) [S8]. We ship no limits.
- Forced sign up before use [S1]. SPEC 18 stays optional.
- Social feed, follow athletes, suggested athletes, head to head comparison [S1, L1], leaderboard noise beyond the opt in SPEC 18 and PLAN 6.3.
- Hevy's 3D looping exercise animations and its exercise images are a licensed or proprietary pack [S1, L1]. Our demos come from our own catalog (PLAN pre launch item), never screenshots.
- Hevy and Bevel icons, logo animation art, illustrations, onboarding copy, the "Hey, I built this" founder note [L1 sheet 1], and any color or layout lifted whole. Ideas only.
- Bevel's AI chat, credit packs, Biological Age, Health Records, glucose, blood pressure, blood oxygen [S3]. Out of scope, and several are medical looking claims.
- Apple Health, Apple Watch, HRV, complications, Live Activity, lock screen timers, HealthKit export [S2, S3, S9]. A web app cannot do these. Do not promise or imply them. Substitute: persisted timers, optional Web Push, CSV style export (SPEC 9).
- Recovery or readiness scores. Bevel's own reviewers say scores can look more precise than they are and need 2 to 6 weeks to calibrate [S6]. We have no sensor data; "freshness" from logged sets only (P17).
- Dense logging screens for beginners [S1 critique]; keep SPEC 13 sizes and one primary action.
- Mid funnel promo screens (L1 hevy-intake-7, 8).
- Metric overload on home [S6, S5]; at most one coach card (SPEC 15).

## 6. Where to look next (handoff)

| Pattern | Owning PLAN item |
|---|---|
| P01, P02, P03, P04 | built in Sessions 1 and 2; P04 small fix or 3.4 |
| P05, P06 | cross cutting; 7.4 polish, plus 3.3 for inline valid |
| P07, P08, P16, P18, P19 | 7.1 (Today, History), 5.1 |
| P09 | 3.1 |
| P10 | 3.4, 3.5, 3.8 |
| P11 | 3.9, 7.1 |
| P12, P13 | 3.3, 6.1 |
| P14, P15, P17 | 3.8, 5.1, 7.1 |
| P20 | built; reuse in 3.4 |
