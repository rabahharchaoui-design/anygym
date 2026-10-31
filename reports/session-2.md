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
