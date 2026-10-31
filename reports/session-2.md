# Session 2 report (in progress)

## Cloud run, Oct 31 2026, 16:34 to 18:30 UTC

Shipped to master and live, one checkpoint per item:

| Item | What | Notes |
|---|---|---|
| 2.0e | Codex journal and editor fixes | Code was in gmini's WIP; cloud added the UI reproductions (tests/journal-editors-2.0e.spec.ts). Double tap 30/30 on three specs in Chromium; the WebKit flake was not reproducible here. |
| 2.0f | Codex bughunt 1031-1657 / 1727 fixes | Queued and built this run. All 8 groups with reproduction tests. Full matrix by default (1657 #5) left as G's call. |
| 2.1 | Catalog build | SHA f00c92c7, 138 exercises, photos in public/ex. Russian twist and single arm reverse pulldown set to none. |
| 2.2 | Muscle map | Dev route ?dev#/dev/muscles. Upstream "abductors" polygon is the inner thigh, so it draws adductors; hip abductors light the glutes as "Outer hips". |
| 2.3 | Exercise sheet | Demo plus one cue line in the workout, More opens the full sheet. Removed cue and Good for wording the source did not support. |
| 2.4 | Review screen | Settings, tap the version 5 times. About now credits the dataset. |
| 2.5 | Catalog audit | reports/audit-2.5.md. Plank (both plan entries) and narrow grip lat pulldown downgraded to none. |

Decisions made unattended:
- Exercise photos are cached the first time they show, not precached. Precaching 7.5 MB made the offline double tap test fail (the app was not offline ready right after the first load) and costs a first visit a lot of data. A demo works offline once seen. A later item could warm the cache for the active plan's exercises.
- Machine Leg Press stays exact: the plan note says "Narrow stance", matching the photos.

SIM CHECK PENDING (cloud, Chromium only) for 2.0e, 2.0f (landscape guard, bar change notice), 2.2, 2.3, 2.4. Playwright ran on the cloud Chromium mapping of the iPhone profiles, never WebKit.

Polish for the gate:
- Reduced motion: the small workout demo tile shows only the start photo.
- "Just you" weight cell looks clipped under the none exercise sheet on SE (check if it predates 2.3).
- 94 of 138 catalog exercises (ladder only) have no cues yet; Review says so.

Not done here: 2.6 merge gate (needs WebKit, the Simulator, the full matrix and the ux-critic).

## Cloud run, Oct 31 2026, 18:57 to 19:50 UTC

| Item | What | Notes |
|---|---|---|
| 2.0g | G's urgent bug: a check jumped to the next exercise | Root cause: Barbell Incline Bench Press is in a pair with Incline Plate Press, and every check in a pair auto switched to the partner after 900 ms with no rest. Now `advancesAfterLog` (planWorkout.ts) moves on only after the last planned working set; the pair partner is a tappable "Pair: X next" chip; the block rest runs inside pairs; an extra set after going back never moves on and cancels a pending "Nice. Next" return. tests/stay-2.0g.spec.ts on SE and 17 Pro Max. |
| 2.0h | Codex 1101 bughunt carry over | Backup carries edits held in the mutation fallback; restore makes them pending again. The other findings in the three 1101 reports were written against pre 2.0f code and are the 2.0f groups. |

Decisions made unattended:
- Pairs no longer go back to back automatically (G's 2.0g expectation overrides SPEC 13.1's automatic hop). The day list still lights the partner as next, and the chip is one tap. SPEC 22 already flags the incline pair as two chest presses back to back.
- Warm up blocks and stretches never move on by themselves.
- plans.spec.ts: waits for the day 1 rows before reading their order (it read them a frame early on a slow machine).

SIM CHECK PENDING (cloud, Chromium only) for 2.0g (the pair chip over the rest bar on SE).

Not done here: 2.6 merge gate (still needs WebKit, the Simulator, the full matrix and the ux-critic).

## Cloud run, Oct 31 2026, 21:16 to 22:10 UTC

Shipped and live (each merged to master, deploy green, live check green in Chromium):
- 2.2a Premium muscle map (G's Nov 1 brief, council rules applied). SIM CHECK PENDING (cloud, Chromium only).
  - Chosen: react-native-body-highlighter 3.2.0, commit 8ed39ac2ae9cb46fb79d77eedec7e5b029a75174, MIT, Copyright (c) 2022 ELABBASSI Hicham. Only its vector path data is used (src/lib/bodyArt/), inside our own React SVG. License in third_party/react-native-body-highlighter-LICENSE.txt, credit in Settings → About. The old react-body-highlighter polygons and license are removed. The art is vector data authored in that repo under its MIT license; no images, no AI generated anatomy.
  - Rejected (full table in reports/briefs/2.2a-muscle-map.md): js-rich-body-highlighter (raster bodies with no stated origin or artist, may be generated, heavy), react-muscle-highlighter (byte identical copy of the chosen art with the original copyright notice dropped), @emmorts/body-muscles (male only), MuscleMap (paths traced over OpenAI generated photos), Sasha's Body Map (no license). Research took about 20 minutes.
  - What changed: one large body at a time; Front | Back opens on the side with the primary muscles; Male | Female (separate drawings) saved on the phone and in Settings → Feel → Muscle map body; primary in the accent with a soft glow, secondary at 40%, the rest graphite; 240 ms 2D crossfade, instant with reduced motion; tap a muscle and a line above the body names it ("Upper chest · primary", "Quads · not used here"); a side with nothing lit offers "Show front"/"Show back". Exercise to muscle data unchanged (src/lib/muscles.ts logic untouched). Deltoid split by view: front views light front delts, back views rear delts.
  - Exercises for a tapped muscle: split to 2.2b (council rule d). The catalog has the data but the app has no exercise browser to open them in yet, so a list would be a dead end.
  - Screenshots: reports/shots/2.2a/ (all four views at iPhone SE and 17 Pro Max, plus critic shots).
  - Tests: Vitest 1472 then 1490 green; muscles-2.2a, tester-2.2a, exercise-sheet-2.3, review-2.4, smoke on iPhone SE, 17 Pro Max and 320 floor (Chromium) green.
  - ux-critic first pass 7/10 (target 8). Fixed: tap readout was below the fold (now pinned above the body, body capped to fit at 375 x 667), tap names now match the text line, an empty side explains itself, tapping outside clears, Settings row stacks below 360 px. Rejected: "make deadlift glutes and hamstrings primary and cap secondaries at 3" (that would edit source muscle data by taste; SPEC 0). Left as polish: secondary over large areas reads olive, the female triceps is a thin sliver, a one frame double body during the Male/Female crossfade, the male viewBox has spare space above and below. No second critic pass this run; gmini's gate pass should score it again on the Simulator.
- 2.0i Codex carry over: all 9 data findings from the Nov 1 bughunts reproduced with a failing test, then fixed in the shared layer (see PLAN note). Left: the 3 test gap findings; no true cross tab lock.
- Codex tests 1024-2037 merged: kept 7, dropped 1 (written against the Oct 24 Finish), bugs 0.

Decisions: 2.2b left unchecked (waits for an exercise browser). codex-active-workout tests at lines 62 and 188 and codex-se-edit-finish's offline test fail identically before and after this run's changes in cloud Chromium (ERR_INTERNET_DISCONNECTED console noise, layout); gmini should confirm in WebKit.

Not done here: 2.6 merge gate (needs WebKit, the Simulator, the full matrix and the ux-critic).

iPhone checks for G: open https://rabahharchaoui-design.github.io/anygym/?dev#/dev/muscles in Safari, pick a bench press, switch Front/Back and Male/Female, tap a muscle; then Settings → Feel → Muscle map body.
