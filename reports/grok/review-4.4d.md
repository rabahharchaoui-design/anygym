STATUS: NEW
Grok Build review of PLAN item 4.4d, range 55ac5e0a9658c632f3a425d7464f6c73fcb06764..e1e5aead2dbf53549d4bbb8d179a9bef2bf97a50, written Nov 21 00:55. A second opinion, not orders: SPEC.md wins.

I'll review PLAN item 4.4d from the spec and the commit range only, without changing the repo.

The item is the run-lag fix. Next I’ll read the spec rules it has to meet and the exact diff in that commit range.

The range mixes the GPS lag fix with diagnostics and a few other commits. I’ll read the tracking code against the spec next.

The reload guard looks tight. I’ll check how far the smoothed position sits from the phone’s last fix, and whether a resume can add or drop distance.

# Grok review of PLAN item 4.4d

- MAJOR src/hooks/runEngine.ts:273 A reload comes back paused and starts the GPS watch with no replay guard, and Resume does not arm one either. The first fix after Resume is taken as the start of a new piece, including the phone's cached fix from before the kill. If that fix is the old spot and the runner has moved, the next real fixes are faster than 8 m/s and are dropped until the 15 s gap rule, and that gap adds no distance. On a simulated jog that had moved 300 m while closed, the first three new fixes were dropped, the gap was 20 s and 0 m, and the jogging in that window was missing from the saved run. The 2 m guard at src/hooks/runEngine.ts:58 never runs on this path. It runs only on a later watch restart, and only if nothing has arrived yet, and 2 m is smaller than the gap between the smoothed dot and the last raw fix on the item's own traces (jog, 60 s: 2 of 6 seeds at 15 m accuracy, 5 of 6 at 30 m, all 6 at 50 m, up to 10.3 m). Smallest fix: persist the last raw lat/lng on the snapshot and drop the first callback after Resume when it matches that point. Do not use a flat 2 m radius.
- MAJOR src/lib/run/live.ts:90 A held fix puts the map dot on the raw phone position, while the route is the filtered estimate. On a `short` hold the estimate is already in `lastGood`, and the map recenters on `here`. On a simulated cold-start jog (15 m noise, 1 s fixes, seed 1) 31 of those holds in the first 3 minutes put the dot more than 8 m off the end of the drawn line, one of them 25 m off. A walk at 30 m did the same on 24 holds, up to 13 m, so the dot leaps around while the distance stays filtered. Smallest fix: for a `short` hold, set `here` from `added.lastGood`.
- MINOR src/lib/gps/tracker.ts:260 A drift relocation while fixes are still arriving is stored as a GPS gap (0 m over 10 s on a simulated 30 m walk). The finish screen and run detail then show "Dashed: GPS was lost or the run was paused there" (src/lib/run/summary.ts:28). The same sentence appears for a 1 s correction when a cold start locks on (src/lib/gps/tracker.ts:213). Smallest fix: do not use kind `gap` for those breaks, and show that sentence only for a real gap or a hand pause.
