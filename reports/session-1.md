# Session 1 report: foundation and the logger

Branch `s1-foundation`, tag `pre-s1` (Oct 23, 2026) to the merge gate (Oct 25, 2026). Every item shipped to master as a checkpoint and went live at https://rabahharchaoui-design.github.io/anygym/ the same hour; this report covers the final gate.

## What shipped

- 1.1 to 1.4: Vite + React + TypeScript shell, PWA with offline precache, GitHub Pages deploy, Dexie schema (now v9, every change additive with a migration test), gym profiles with SPEC defaults, and the weight math in `src/lib/load.ts` at 100% coverage.
- 1.5, 1.6, 1.7a, 1.7b: the plate diagram with a realistic SVG bar, exact math line, Type it solver, every other load picker with SPEC 13.6 plain labels, the first use weight prompts, and the ⓘ glossary (26 approved drawings, 8 words only).
- 1.7, 1.7c, 1.9, 1.10, 1.10f: the follow the plan workout flow (day list, set table with LAST TIME, one tap ✓, rest bar, finish screen with records), the progression engine (every SPEC 6 rule tested), both curated plans as startable plans ("Classic 5 Day Split" and "Six Week Volume Builder") with no personal names in the app.
- 1.7e, 1.7g: the premium design system in `src/ui/` (glass bars, large titles, push and pop with edge swipe back, floating tab bar with the lime pill, sheet stack with Back support, odometer numbers, haptics with a setting), 130% text support.
- 1.8, 1.11, 1.11a: backup and restore with a strict validator, import of the anygym-import-v1 history file with a review screen (215 of 215 sets from G's file, 0 invented loads), and Report a problem plus crash reports through the `anygym-api` Cloudflare Worker with phone alerts.
- 1.10a to 1.10e, 1.7f, 1.7h, 1.7i, 1.7j: the Codex bug hunt fix items. Saving is journaled, deletes and undo survive a kill, pending picks keep their unit, records and progression compare across units, and the full screen fix for the Home Screen app.
- 1.12: the test harness: 7 device projects (3 iPhones in WebKit, 3 Android sizes in Chromium, a 320 wide floor), automatic console error and unhandled rejection trap, monkey, kill and restore, 2 year history fixture, layout, contrast and accessible name audits, double tap races.
- The gate itself: three ux-critic rounds and four builder rounds fixed the set type sheet, picker search and duplicate names, finish screen copy and choices, coach mark anchor, day list Start pill, opaque bars and toasts, warm up weight isolation (a warm up pick no longer rewrites working sets), and a wrong muscle chip.

## Numbers at the gate

| Check | Result |
|---|---|
| Vitest | 1110 passed (75 files), coverage about 96% lines, load.ts 100% |
| Playwright iPhone SE + iPhone 15 | 827 passed, 0 failed |
| Playwright iPhone 17 Pro Max | 414 passed, 0 failed |
| Playwright full matrix (`PW_FULL_MATRIX=1`), Pixel 7, Galaxy compact, Small Android, 320 floor | 1642 passed; the 10 failures seen were 3 stale test assertions (fixed), 2 load flakes (pass alone), 1 cosmetic 2 px bubble (fixed) |
| Gate specs after the last fix, all 7 projects | 322 passed |
| Console errors | none in any run |
| Live check | see the final line of this report |

## Screenshots and videos

- Per item: `reports/shots/<item>/` (1.1 through 1.7j, gate-s1). Simulator shots (real Mobile Safari) in `reports/shots/gate-s1/sim/`, `reports/shots/gate-s1/sim-final/`, `reports/shots/1.7e/sim/`, `reports/shots/1.10b/`.
- Critic rounds: `reports/critic/session-1/` (rounds 1 to 3 of 1.7e) and `reports/critic/session-1/gate/`, `gate2/`, `gate3/` (the gate reviews with videos and frame strips).
- Videos: `reports/videos/1.7c-*.webm`, `reports/videos/1.7e-*.webm`, `reports/videos/1.7e-sim-max.mp4`.

## Items marked [!]

None.

## Known gaps carried forward

- Home Screen (standalone) mode cannot be automated in the simulator; G confirmed the full screen fix on his phone after 1.10b. The share sheet for Back up and the haptic tick still need a phone check.
- ux-critic POLISH left open (all small): the "Nice. Next" chip lifetime, picker ranking by muscle, History rows with duration and total, plan viewer day chips, "Demo coming soon" is a dead end until Session 2 brings demos, the finish transition shows the Done button before its label for about 300 ms, tab crossfade overlaps text for about 150 ms, a warm up row still shows the working row number in one header case, "Beat last time" fills only set 1 with the +1 rep target.
- Codex findings that arrived during the gate are queued as item 1.7k (first item of the remaining queue): durable unresolved Undo, stricter restore validation of plates and ranges, editors targeting rows by draft id, allowlisted diagnostic messages, Edit Save under the finishing lock, kettlebell availability, legacy Smith identity.
- Test coverage gaps noted by Codex: kill tests do not stop exactly at transaction boundaries; monkey swipes are mouse drags (Playwright WebKit has no touch move); real touch panning inside sheets needs a device; the default per item run uses the curated `@matrix` subset on the four Android and floor projects and the full matrix runs at the gate.
- The Worker host `anygym-api.rabahharchaoui.workers.dev` carries the account name; it is never shown in the UI.
- Codex reviews were skipped for 1.7j and the second gate round when Codex hit its usage limit.

## iPhone hand test (5 minutes)

1. Open AnyGym from the Home Screen. The tab bar should reach the bottom edge under the home indicator with no black band. 20 s.
2. Tap Plans, open Classic 5 Day Split, swipe from the left edge to go back. Tap Use this plan if it is not already yours. 30 s.
3. Today: tap Start. Tap the Start pill or the Barbell Back Squat row. The rows are prefilled; tap the check on set 1. The rest bar should start, and you should feel a small tap. 30 s.
4. Tap the weight on set 2: the plate sheet opens with the bar already loaded. Tap a 25, read the math line, tap Done. The row and the rows below should update. 30 s.
5. Tap the set number on set 3: a Set type sheet opens; pick Warm up. The row shows a Warm up chip, its weight resets to Pick, and it does not count toward the lift or Total lifted. 20 s.
6. Tap the minimize chevron top left. Today shows one card with Resume; the other tabs show the resume bar. Tap Resume. 20 s.
7. Tap Finish. Read "Workout saved · N sets" and the two Next time choices; pick repeat Day 1. Tap Undo on Today within 5 seconds: the workout reopens exactly where it was. Finish again. 40 s.
8. History: your workout is listed; tap it to see every set. Imported workouts sit under "Imported · no dates". 20 s.
9. Settings: toggle Units to kg and open a barbell lift; the sheet shows kg plates. Switch back to lb. 30 s.
10. Settings → Back up: the share sheet should open with anygym-backup and today's date. Save it to Files. Settings → Restore, pick that file, choose Merge: nothing changes. 40 s.
11. Settings → Help → Report a problem: type "test from G", Send. You should see "Sent. Thanks, this goes straight to the builder." and get a phone push. 20 s.
12. Turn the phone sideways: a "Turn your phone upright" card shows; turn it back and nothing is lost. 10 s.

## Final runs

Filled in at the end of the gate below.
