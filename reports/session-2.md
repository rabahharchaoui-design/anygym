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

## Cloud run, Nov 1 2026, 23:37 to about 01:30 UTC

Shipped and live:
- 2.2b Exercise screen fills the screen (G's Nov 1 3:22 AM item, added to PLAN after 2.2a; the old 2.2b "Exercises for a tapped muscle" is renumbered 2.2c). SIM CHECK PENDING (cloud, Chromium only).
  - Demo hero on top (26svh, capped on SE so the set table and every ✓ stay in the first screen), slow crossfade between the two demo photos, reduced motion shows the start photo still. Name and "Set 1 of 4 · 8 to 12 reps" on a dark fade at its foot; on scroll the hero folds into a compact title bar with ⋯ (CSS scroll timeline; older Safari keeps a plain sticky hero).
  - Tap the hero: new full screen demo viewer (close with ✕, tap, swipe down, Escape or Back). The info sheet's "1 / 2" counter and dots are gone.
  - Below the table: front and back muscle maps side by side with "Primary · secondaries", numbered form tips from the catalog cues (variant caveat as a quiet note), Watch out and Good for inline.
  - Removed: orange "Pick a weight" line, cue line with More. A tap on a ✓ that cannot log opens the weight picker with "Pick a weight first". First time line shortened and hidden once a weight is picked. Weight cells with words ("Just you") no longer clip.
  - No demo and nothing sure: compact header plus one quiet line "Form guide coming soon. We only show form we're sure of." Nothing invented (SPEC 0).
  - Tests: Vitest 1493 green; exercise-screen-2.2b (new), exercise-sheet-2.3, workout, stay-2.0g, smoke, doubletap, critic-1.7e green on iPhone SE, 15, 17 Pro Max (Chromium). workout.spec:232 retitled to the 2.2b rule (rows and ✓ in the first screen, page may scroll below, rest bar never covers a row).
  - ux-critic: 6, then 7, then 7/10 (target 8 not reached in 3 rounds). Left for gmini's gate: the full screen viewer is a letterboxed photo with a fade, not a shared element grow and no steps under it; timed stretches show both a timer and a ✓ of equal weight; "+ lb" header and the Last time column of dashes for new users (SPEC 13.6 wording kept on purpose); muscle line wraps at 375 and Front/Back labels sit tight under the sticky bar; More sheet "Remove / Delete its sets first" dead end; empty bar in the picker drawn as a close up looks cropped (2.0d behavior). Rejected: inventing steps for stretches, frame dots in the viewer (G asked to remove them), dropping calves from the squat (source data).
  - The coach mark keeps its 48 px slot after it is dismissed so a fast second ✓ tap never lands on a moved row; a small gap remains visible.
  - Screenshots: reports/shots/2.2b/, critic shots reports/critic/2.2b/.

## Gate run on gmini, Nov 1 2026, from 15:15 JST

First truth checks of the cloud's Chromium only work:
- 2.2c Exercises for a tapped muscle built and committed (the readout's "N exercises" link, sheet of catalog exercises with that primary muscle, own photos, plan exercises first, honest empty line). Codex: the muscle pick is tap only on the drawing, so VoiceOver cannot reach the list; fixed at the gate.
- Real iOS Simulator (reports/shots/gate-s2/sim/): Today, Settings, the muscle map, the plate sheet and the glossary are clean on the SE and the 17 Pro Max; the Review screen's sticky Approve / Wrong demo / Wrong muscles / Fix cues stack covers the body map on both (fixed at the gate). The exercise screen, exercise sheet and weight sheet cannot be reached by URL in the simulator (no seeded session), so they stay Playwright WebKit checks.
- First clean WebKit run (iPhone SE and iPhone 15): 999 passed, about 30 distinct failures per project, all around the 2.2b exercise screen: offline demo photos log a WebKit resource error, 600 to 700 px of horizontal overflow on the exercise view, the hero image covering its own title in the one screen audit, the coach mark 254 px away from the first check, Male and Female segments 44 pt tall, the removed "How to do" button, tests asserting the pre 2.2b "main never scrolls" rule. All sent to the builder as one gate round.
- Gate round 1 (ad7aedf): all 12 findings fixed; a bigger bug surfaced: the service worker's photo cache rule used an unexpanded `${BASE}` so no demo photo was ever cached; fixed, and offline the app draws only photos the cache holds (no broken image, no console error). Coach mark back on the first ✓ over the column header; hero name area tappable and named "How to do …"; 48 pt segments everywhere; Review card no longer spills under its buttons; accessible native muscle picker for VoiceOver and keyboard; the open reps stepper never hides under the rest bar. Tests moved to the 2.2b first screen rule through one helper (tests/workout-helpers.ts). iPhone SE + iPhone 15: 1065 passed, 0 failed.
- Gate round 2 (0e09bb7): the other five projects had 3 failures on the two shortest screens; no hero under 600 pt tall (compact header with a 56 pt demo tile), 24% hero up to 660 pt. Small Android + 320 floor subset: 254 passed, 0 failed.
- G queued 2.2d (workout screen polish, top priority) before the gate at 3:59 PM; the full matrix, the ux-critic and the merge follow 2.2d.
- 2.2d Workout screen polish (G's top priority): built on gmini (4829d3f): no dead space, swipe left to delete with Undo, Remove set in the set sheet, rest timer Off per exercise, Plan saved toast with Undo, memoized rows and lazy extras (✓ paints in 22 to 48 ms at 4x throttle), shared hero transition, spring push and pop. ux-critic round 1: 7/10 on SE and Pro Max, blockers: the open exercise transition flickers (title vanishes, icon tile flies into a photo, edge slivers), set counts disagree after Remove set (exercise, day list, Finish), delete and Undo jump instead of collapsing, two rest rows in the ⋯ menu and a jumping sheet, push and pop at 365 to 390 ms. Codex: Undo after removing the last pending row lands on slot 0, removing a row shifts per set targets, a recovered Undo leaves the planned row removed. All in round 2.
- 2.2d rounds 2 to 4 (307ef44, f005f45, c500ac5): ux-critic 7 → 8.5/8 → 9/9 on SE and Pro Max (reports/critic/session-2/2.2d, 2.2d-r2, 2.2d-r3). Open exercise 270 to 295 ms and back under 310 ms with no dropped frames, ✓ paints under 65 ms, numbers right in every frame of a delete. Codex: Undo slot padding, targets kept on remove, durable removed row marks restored exactly once by every Undo path. Full suite green on all 7 projects on the branch (iPhone SE + 15: 1091 passed; the other five: 1054 passed). Left for later: finish screen empty space on SE and the "Next up: Day 1 again" wording, Replace in the ⋯ menu (Session 3). Checkpoint merge follows in the next run (the time budget ended).
- Checkpoint 2.2d (master 8ba3cc6, Nov 2 18:05 JST): 2.2d, 2.2c, gate rounds 1 and 2, 2.0j and the Codex test batch 1101-1542 (kept 8) are live. Master runs: iPhone SE + 15 1098 passed, the other five 1083 passed; two load flakes passed 3 of 3 alone (matrix workout fit on iPhone 15: the navigation arrival guard still covered the title when the audit ran; dumbbell wheel swipe on 17 Pro Max). Deploy green, live check green, phone alerts sent.
- 2.0k Codex carry over (c8e0980): held operations under the session lock with stored covered ids and random ids, IndexedDB drafts authoritative after a localStorage failure, Finish without it discards only the listed failed Logs, duplicate Log checks the saved revision, Remove exercise is one Undo that outlasts the toast, Loaded with never invents a weight, 48 pt pause control, pinned Close and Back in the exercise sheets, visible Pick a muscle. Codex review (next day): three findings, fixed in 2.2e round 2.
- 2.2e Premium foundation (6fc6c83, 83bfcb6): springs and one page transition for every navigation, SlidingToggle, ChoiceCard, BottomCTA, unified Undo toast, PRBadge, AppMarkLoader, dev showcase ?dev#/dev/ui with visual snapshots; PR badge only when a set beats the exercise's best (load.ts and records.ts, never on a first session, ties never count), finish leads with the real win. ux-critic round 1: SE 7.5, Pro Max 7 (tab bar blink, CTA jump, tiny untappable badge, three record wordings, white launch flash, 95 to 119 ms stalls on the PR check and bar pick), all fixed in round 2 with the Codex findings (PR history per load kind, badge freshness under StrictMode). Skipped for G: a real brand mark for the loader (it is a two stroke A), a first finish line.
- 2.2e rounds 2 and 3 (83bfcb6, e5d6026): ux-critic 7.5/7 → 8.5/8 → 9/9 (reports/critic/session-2/2.2e, 2.2e-r2, 2.2e-r3). Press 20 to 45 ms; push, pop and tab switch one 220 ms system with the icon flying in the pill; PR check and bar pick frames under 31 ms; the finish push is one page snapshot that arrives complete; PR chip 48 pt tappable with "New best: beat 185 lb × 6 from earlier today". Codex 2.2e (PR history per load kind, badge freshness) and Codex 2.0k (cross tab draft authority, predecessor ids instead of time, SPEC 4.4 order restored) fixed in round 2. Polish left: first Plans visit after launch drops one 90 ms frame on Pro Max, the PR popover can run off the SE's left edge, the loader mark, a first finish line.
- Checkpoint 2.2e (master, Nov 3 18:07 JST): 2.0k and 2.2e merged after the full matrix passed on the branch (iPhone SE + 15 1133 passed, the other five 1137 passed, two load flakes 6 of 6 alone; the 2.2e spec then fixed and green on all 7 projects). Deploy green (run 41608359981), live check green, phone alerts sent at 18:08 JST.
- 2.2f Secret guard (beadcdf, plus the scanner fix): scripts/secret-scan.mjs runs inside npm run build over tracked files and dist (keys, tokens, private keys, passwords, bearer strings, ntfy topics, database URLs, unquoted env values, random token literals; no .map or sourceMappingURL), 30 tests with fake secrets built at run time; CSP meta filled at build (self, the Worker origin from the reporting config, hashed first paint style, no inline script or eval; style-src-attr unsafe-inline is needed by WebKit view transitions; frame-ancestors cannot live in a meta tag); a Playwright walk of every screen asserts zero violations; PROMPT.md gained the hard rule. Codex found the scanner matching its own source once tracked (the build was red for 5 minutes on the branch, never on master) and 4 real gaps, all fixed with tests. Decision noted for G: Playwright's own screenshot style injection triggers a WebKit CSP console line, which tests/fixtures.ts hides by exact message; app violations are caught by the CSP spec's securitypolicyviolation listener.
- Checkpoint 2.2f (master ec99a4d, Nov 3 19:11 JST): secret guard and CSP live; deploy green (run 41616873662), live check green, phone alert sent. Branch runs before the merge: iPhone SE + 15 1141 passed (network guard test then adapted to the CSP), the other five 1150 passed (matrix and report cors tests then adapted to Chromium's CSP wording and loopback rule, verified on Pixel 7, Small Android and SE). Next: 2.0l Codex carry over, then the 2.6 gate.
- 2.0l Codex carry over (4529977): all 8 points with tests; Codex review skipped (usage limit). Gate full run on the branch after it: iPhone SE + 15 1143 passed; the 10 failures were trace file ENOENT collisions with the critic's concurrent run and passed on rerun (68 passed).
- Gate ux-critic round 1 (reports/critic/session-2/gate/): SE 7.5, Pro Max 8, Small Android and 320 hold. Blockers: the set wording order differs across screens (set table reps first, finish and PR weight first, History and import reps first), toasts land on list rows and follow the user across screens, pushed top bars read through once scrolled in headless WebKit. 15 polish items listed in the report.
- Feedback intake: `npx wrangler d1 execute anygym-feedback --remote` returns "Authentication error [code: 10000]" since Nov 3 evening (it worked Nov 1 to 3 afternoon, always 0 open rows). The wrangler login on gmini needs a fresh `npx wrangler login` from G; the intake check is skipped until then.
