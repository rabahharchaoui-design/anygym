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
