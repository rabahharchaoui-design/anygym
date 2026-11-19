# Run lag diagnosis (PLAN 4.4d)

G's hand test, Nov 19, 6 PM: "the pace and distance was super slow and lagged" on a real outdoor run.

## What this is, and its limit

These numbers come from SIMULATED traces, not G's phone. The real cause on his phone is only proven
by his diagnostics export (PLAN 4.4d (2)); until then this table says what today's code does with
fixes that behave like our model of an iPhone, and which suspects that model can explain.

The traces (tests/fixtures/gps/traces.ts, seeded, deterministic): walk 1.4 m/s, easy jog 2.5 m/s,
run 3.5 m/s; one fix every 1 s or every 5 s; accuracy level 5, 15, 30 or 50 m; four scenarios of
10 minutes on a city block route: `surge` (30% faster from 300 to 420 s), `cold-start` (60 m
accuracy or worse for the first 90 s), `tunnel` (no fix for 40 s while moving), `light` (standing
30 s at a light, the phone still reporting), and `still` (a phone lying still for 300 s, measured
on the live screen just before End and as saved by End, the flush path of PLAN 4.6b). Noise model (checked before tuning, as the
orchestrator asked): the error is NOT drawn afresh per fix. It is a smooth bias tied to the
reported accuracy (spread 0.35 x accuracy a side, three slow waves with periods of 2 to 10 minutes,
so it is strongly correlated over tens of seconds and the reported accuracy overstates the step
to step error), plus a small white part (0.05 x accuracy), 1% outliers 2 to 3 x accuracy off that
still claim their accuracy, 3% repeated positions, and 4% delivery stalls of 1.5 to 4 s after which
the held fixes arrive together. The phone's own speed (coords.speed) is given, true speed plus
0.2 m/s spread, only at 25 m or better (a GPS lock); never in the 60 m cold start. A cold start
reports 60 m (within 5%) for 90 s. Why not first order Gauss Markov: at 1 s it has white like
increments of 0.07 x accuracy a side per second, rougher step to step than a phone; the smooth
bias keeps the long run radius and the slow drift, which is what moves a phone's dot. A white noise
stress row (independent error of accuracy / 1.5 a side on every fix) is reported below, not gating. Each trace goes through the live run exactly as
the app feeds it (lib/run liveStep, the phone's stamp through fixTime, the arrival time as `now`),
the screen is read every second (readLiveAt), and the run is ended after the last fix.

Measured per trace (worst of seeds 1, 2, 3 in the table):
- distance error: saved distance against the true path, percent.
- frozen: the longest stretch the shown distance stood still while the runner moved at 1.2 m/s or
  more (outside the tunnel and the light) although fixes arrived; in brackets what those fixes were.
  At 5 s cadence one wasted fix already makes 10 s.
- pace first: seconds from the first fix until a current pace shows.
- pace follow: seconds after a speed change until the shown pace is within 10% of the new one.
- added standing: meters added at the light from 10 s after stopping (the 8 s rule plus 2 s) to
  moving off.
- accuracy rejects: fixes dropped for accuracy, of all fixes (3 seeds).
- still while moving: good fixes held as "standing" while really moving 1.2 m/s or more (3 seeds).

## Verdict per suspect (today's code, fix-4.6b at 66bfc160)

(a) filter.ts drops every fix worse than 25 m: CONFIRMED, the largest effect by far.
- 30 m level: 81% of all fixes dropped; distance lost 66 to 100% (median -71%); frozen 266 to 601 s.
- 50 m level: 100% dropped; distance 0; no pace ever.
- cold start (60 m for 90 s) at EVERY speed and noise level: frozen 91 to 105 s from GO, pace first
  at 101 to 111 s, distance short by 9 to 18% over 10 minutes.
  This matches "super slow and lagged" exactly: an iPhone that reports 30 to 65 m in the first
  minutes or between buildings shows nothing moving for minutes.

(b) stillness (half the accuracy in 8 s) reads a walk at poor accuracy as standing: CONFIRMED for
walks at 15 m and up (and for jogs at the light).
- walk 1 s 15 m: frozen 30 to 37 s (held:still), 265 to 489 moving fixes per 3 runs held as
  standing, pace follows a speed change only after 89 to 102 s.
- walk 5 s 15 m: frozen 32 to 34 s, pace follow 41 to 106 s.
- jog 1 s 15 m light: frozen 14 s after the light.
  With the 25 m filter this only bites between 15 and 25 m; once (a) is fixed it would bite at
  every poor accuracy, so it must be fixed with (a).

(c) fix cadence (every 4 to 6 s): NOT a cause on its own. With every fix counted the distance
moves every 5 s and the error stays within -4 to +10%. It multiplies the other causes: one fix that
adds nothing (a repeated position, "kept, no distance") already freezes the number 10 to 19 s at
5 s cadence, and pace follows a change only after 21 to 51 s.

(d) the 30 s pace window with PACE_MIN_SEC 10 and PACE_MIN_M 10: PARTLY CONFIRMED. With good
accuracy pace first shows at 11 to 19 s (inside the 20 s rule), but it follows a speed change in 15
to 36 s (over 20 s at 5 s cadence and for the walk), because the full 30 s window must turn over.
It does not explain a frozen distance.

Found by the harness, not on the suspect list:
(e) late fixes: a fix that reaches the app more than 2 s after its stamp gets the arrival time
(live.ts fixTime, FIX_LAG_MS 2 s). After a delivery stall the held fixes then share one time or go
backwards, and are dropped as `time-backwards` (6 to 7% of fixes at 1 s cadence in this model) or
`speed` (2 to 5%): freezes of 5 to 8 s at 1 s cadence. Small, but real if the main thread stalls
(the map, a render). Its size depends on how often the phone stalls, which only G's export can say.
(f) jitter adds distance: summing raw fixes at 1 s cadence adds the white jitter to every step: walk
1 s 5 m +4.4 to +5.5%, walk 1 s 15 m +18 to +21%, jog 1 s 15 m +8 to +11%. This is the opposite of
G's report (too much distance, not too little), so it does not explain it, but it breaks the 3% rule.

(g) a still phone gains distance (coordinator's 4.6b measurement, now in the matrix): today's code
(fix-4.6b with "4.6b (3)" merged) adds 1 to 37 m to a phone lying still for 5 minutes at 5 m
accuracy, 4 to 138 m at 15 m, 5 to 26 m at 30 m (the End flush adds up to 5.5 m more than the live
screen showed), 0 at 50 m (every fix dropped). Mostly from single outliers: a fix 2 to 3 x the
accuracy away leaves the standing circle (both radii added) and the leg out and back counts; at
15 m the slow drift of the fix walks out of the circle. The 4.6b builder's 13.6 m average at 20 m
accuracy (worst 22.5 m over 40 seeds) is the same effect. This does not explain "slow".

What the table does NOT explain: why G's phone reported what it did. If his export shows fixes at
5 to 16 m arriving every second, none of (a), (b), (e) applies to his run and the cause is elsewhere
(the screen not redrawing, a stalled main thread), which this harness cannot see.



## After: what changed (src/lib/gps and src/lib/run only; the UI does no arithmetic)

- filter.ts: fixes up to 65 m are kept (POOR_ACCURACY_M; 25 m stays the "good GPS" line); the 8 m/s
  check allows for both fixes' accuracy. A missing accuracy is still dropped.
- estimate.ts (new): where the runner most likely is, a Kalman filter per axis weighted by each fix's
  accuracy. A wild fix is dropped (jump gate), a surprising one waits for the next fix (at 1 s
  fixes, and always while standing), a much surer fix (the GPS lock after a cold start) corrects the
  estimate without counting the glide as distance. The track and the distance are the estimate's.
- tracker.ts: distance on every accepted fix except a step shorter than the estimate's wobble
  (0.5 x its accuracy, at most 4 m), which waits for the next fix; End, Pause and a gap count it.
  Standing and moving again: the phone's own speed when it gives one (0.9 m/s and up is moving, under
  0.5 m/s for 3 s is standing); else positions, with the standing circle capped at 6 m (a walk is
  never inside it) and never by positions when the estimate is less sure than 15 m. A still phone
  that wanders off its spot is not "moving again" unless it also moved 4 m in the last 4 s. The 4.4c
  gap rules, the 4.4a clock, the 4.6a clock rule and the 4.6b withheld leg are unchanged.
- pace.ts: current pace is the mean of the phone's speed over the last 5 s when it gives one, else a
  15 s window of distance (was 30 s) with 6 s and 10 m minimum. "--" until then.
- live.ts: a fix stamped up to 10 s before it arrives keeps its stamp (was 2 s: (e) above).
- SPEC 12.2 and 12.3 say so.

## After: the pass rules by priority group (seeds 1, 2, 3; seeds 4, 5, 6 give the same group counts)

| group | combinations passing every rule on every seed, before | after |
|---|---|---|
| 1: 1 s fixes at 5 and 15 m, all scenarios | 3 of 30 | 23 of 30 |
| 2: 30 m at 1 s, 5 s fixes at 5 and 15 m | 0 of 45 | 7 of 45 (5 on seeds 4 to 6) |
| 3: 50 m, 30 m at 5 s | 6 of 45 (still phones at 50 m: every fix dropped) | 0 of 45 |

Group 1 still failing (the orchestrator asked for exact cases; tuning stopped after two rounds):
- every cold start but jog 15 m and run 15 m: distance 3.2 to 7.7% over 10 minutes. The 60 m
  stretch drifts with its fixes: the same traces with only the drift ("drift alone") already miss
  3% (walk 5 m 4.8%, walk 15 m 5.6%, jog 15 m 4.0%, run 15 m 4.0%). Exception: jog 5 m seed 2,
  7.7% with 0.3% drift alone, a filter failure (a wild first fix in the 60 m stretch).
- walk cold start at 5 and 15 m: frozen 7 to 11 s (steps waiting at 60 m), was 91 to 101 s.
- jog and run cold start at 15 m: 3.2 and 3.3% on seed 1 (drift alone 4.0%).
- walk 1 s 15 m tunnel: 3.5 and 4.4% (drift alone 2.5 and 4.1%: the straight line across 40 s of
  drifting fixes), frozen 7 s on seed 3.
Every other group 1 case (surge, light, tunnel at 5 m, still at 5 and 15 m, all jogs and runs but
the cold start) meets every rule on every seed. The full list with numbers is
tests/fixtures/gps/expected.ts, run as expected failures in replay-4.4d.test.ts.

Still phone, 1 s fixes, meters added after the first 10 s, End included (mean / worst of 3 seeds):
5 m 0.0 / 0.0 (before 12.5 / 31.8); 15 m 0.0 / 0.0 (before 0.8 / 4.8); 30 m 44.9 / 95.7 (before
14.6 / 27.6); 50 m 152.7 / 185.5 (before 0: every fix was dropped, so nothing at all was measured).
At 30 m the target "near zero" is NOT met: without the phone's speed and with positions not
trusted at that accuracy, slow drift is counted. Without the phone's speed (old unit fixture, 20 m,
40 seeds): mean 4.0 m, worst 41.8 m (before 12.0 / 18.5); with a speed of 0: nothing.

Lag (the estimator's delay, seeds 1/2/3):
5 m, 1 s: pace within 10% after 1.4->3.5 m/s: 5/6/6 s; shown distance behind truth at steady 2.5 m/s, no fix error (median): 0.6/0.6/1.2 s
5 m, 5 s: pace within 10% after 1.4->3.5 m/s: 11/6/11 s; shown distance behind truth at steady 2.5 m/s, no fix error (median): 5.2/5.2/5.3 s
15 m, 1 s: pace within 10% after 1.4->3.5 m/s: 6/6/6 s; shown distance behind truth at steady 2.5 m/s, no fix error (median): 0.8/0.8/0.7 s
15 m, 5 s: pace within 10% after 1.4->3.5 m/s: 11/6/6 s; shown distance behind truth at steady 2.5 m/s, no fix error (median): 4.8/5.6/4.8 s
30 m, 1 s: pace within 10% after 1.4->3.5 m/s: 18/5/11 s; shown distance behind truth at steady 2.5 m/s, no fix error (median): -0.3/-0.1/0.1 s
30 m, 5 s: pace within 10% after 1.4->3.5 m/s: 46/16/21 s; shown distance behind truth at steady 2.5 m/s, no fix error (median): 4.0/4.3/4.2 s

White noise stress (independent full spread error on every fix, 1 s, surge; not a pass rule):
distance +12 to +14% for runs, +21 to +25% jogs, +60 to +70% walks at 5 m; +39 to +41% runs, +76
to +78% jogs, +152 to +184% walks at 15 m. Frozen at most 7 s, pace follows in 4 to 8 s. A phone
does not report like this; if G's export shows it does, the estimator needs more smoothing there.

Worst cases before and after (worst of 3 seeds: distance error, frozen, pace first, pace follow):
- walk 1 s 30 m surge: -66.4%, 335 s, 255 s, never  ->  +4.7%, 20 s (standing), 11 s, 24 s
- jog 1 s 15 m cold start: -9.4%, 91 s, 102 s  ->  +3.2%, 5 s, 10 s
- walk 1 s 15 m light: +20.0%, 37 s, 11 s, 102 s  ->  +2.2%, 6 s, 2 s, 6 s
- walk 1 s 50 m surge: -100%, 601 s, never, never  ->  +12.4%, 64 s (fixes over 65 m dropped), 25 s, 47 s

The run diagnostics log (PLAN 4.4d (2)) keeps every fix with its fate; G's export replays as a test
(tests/fixtures/gps/load.ts) and settles which of these causes his phone really had.

## Before: today's code (fix-4.6b at 7ce8b1dd), worst of 3 seeds per combination

| trace | distance error % | frozen s (cause) | pace first s | pace follow s | added standing m (still: live / End) | accuracy rejects | still while moving |
|---|---|---|---|---|---|---|---|
| walk-1s-5m-surge | 4.4 | 5.0 (rejected:time-backwards) | 11.0 | 26.0 | - | 0/1803 | 0 |
| walk-1s-5m-cold-start | -12.6 | 92.0 (rejected:accuracy) | 101.0 | - | - | 270/1803 | 0 |
| walk-1s-5m-tunnel | 5.3 | 5.0 (rejected:time-backwards) | 11.0 | - | - | 0/1683 | 0 |
| walk-1s-5m-light | 5.5 | 8.0 (held:still) | 11.0 | 20.0 | 0.0 | 0/1803 | 21 |
| walk-1s-5m-still | 0.0 | 0.0 | never | - | 33.9 / 33.9 | 0/903 | 0 |
| walk-1s-15m-surge | 20.6 | 27.0 (held:still) | 14.0 | 111.0 | - | 0/1803 | 269 |
| walk-1s-15m-cold-start | 1.1 | 91.0 (rejected:accuracy) | 101.0 | - | - | 270/1803 | 346 |
| walk-1s-15m-tunnel | 19.9 | 30.0 (held:still) | 41.0 | - | - | 0/1683 | 458 |
| walk-1s-15m-light | 20.0 | 37.0 (held:still) | 11.0 | 102.0 | 0.0 | 0/1803 | 352 |
| walk-1s-15m-still | 0.0 | 0.0 | never | - | 11.8 / 11.8 | 0/903 | 0 |
| walk-1s-30m-surge | -66.4 | 335.0 (rejected:accuracy) | 255.0 | never | - | 1463/1803 | 185 |
| walk-1s-30m-cold-start | -85.9 | 313.0 (rejected:accuracy) | 455.0 | - | - | 1492/1803 | 177 |
| walk-1s-30m-tunnel | -65.2 | 286.0 (rejected:accuracy) | 387.0 | - | - | 1184/1683 | 269 |
| walk-1s-30m-light | -13.8 | 266.0 (rejected:accuracy) | never | never | 0.0 | 1340/1803 | 233 |
| walk-1s-30m-still | 0.0 | 0.0 | never | - | 25.6 / 27.6 | 477/903 | 0 |
| walk-1s-50m-surge | -100.0 | 601.0 (rejected:accuracy) | never | never | - | 1803/1803 | 0 |
| walk-1s-50m-cold-start | -100.0 | 601.0 (rejected:accuracy) | never | - | - | 1803/1803 | 0 |
| walk-1s-50m-tunnel | -100.0 | 300.0 (rejected:accuracy) | never | - | - | 1683/1683 | 0 |
| walk-1s-50m-light | -100.0 | 299.0 (rejected:accuracy) | never | never | 0.0 | 1803/1803 | 0 |
| walk-1s-50m-still | 0.0 | 0.0 | never | - | 0.0 / 0.0 | 903/903 | 0 |
| walk-5s-5m-surge | 2.0 | 10.0 (kept, no distance) | 11.0 | 21.0 | - | 0/363 | 0 |
| walk-5s-5m-cold-start | -16.1 | 100.0 (rejected:accuracy) | 111.0 | - | - | 56/363 | 0 |
| walk-5s-5m-tunnel | 3.4 | 11.0 (kept, no distance) | 16.0 | - | - | 0/339 | 0 |
| walk-5s-5m-light | 2.1 | 12.0 (kept, no distance) | 16.0 | 26.0 | 0.7 | 0/363 | 5 |
| walk-5s-5m-still | 0.0 | 0.0 | never | - | 28.6 / 28.6 | 0/183 | 0 |
| walk-5s-15m-surge | 13.9 | 34.0 (held:still) | 31.0 | 46.0 | - | 0/363 | 45 |
| walk-5s-15m-cold-start | -16.1 | 99.0 (rejected:accuracy) | 111.0 | - | - | 55/363 | 48 |
| walk-5s-15m-tunnel | 8.6 | 32.0 (held:still) | 16.0 | - | - | 0/339 | 24 |
| walk-5s-15m-light | 4.4 | 39.0 (held:still) | 16.0 | 106.0 | 3.4 | 0/363 | 46 |
| walk-5s-15m-still | 0.0 | 0.0 | never | - | 138.0 / 138.0 | 0/183 | 0 |
| walk-5s-30m-surge | -83.3 | 479.0 (rejected:accuracy) | 366.0 | never | - | 266/363 | 12 |
| walk-5s-30m-cold-start | -84.1 | 505.0 (rejected:accuracy) | 550.0 | - | - | 294/363 | 7 |
| walk-5s-30m-tunnel | -72.3 | 204.0 (rejected:accuracy) | 171.0 | - | - | 211/339 | 24 |
| walk-5s-30m-light | -88.0 | 299.0 (rejected:accuracy) | 461.0 | never | 0.0 | 299/363 | 28 |
| walk-5s-30m-still | 0.0 | 0.0 | never | - | 6.4 / 7.8 | 137/183 | 0 |
| walk-5s-50m-surge | -100.0 | 601.0 (rejected:accuracy) | never | never | - | 363/363 | 0 |
| walk-5s-50m-cold-start | -100.0 | 601.0 (rejected:accuracy) | never | - | - | 363/363 | 0 |
| walk-5s-50m-tunnel | -100.0 | 300.0 (rejected:accuracy) | never | - | - | 339/339 | 0 |
| walk-5s-50m-light | -100.0 | 299.0 (rejected:accuracy) | never | never | 0.0 | 363/363 | 0 |
| walk-5s-50m-still | 0.0 | 0.0 | never | - | 0.0 / 0.0 | 183/183 | 0 |
| jog-1s-5m-surge | 5.0 | 6.0 (rejected:speed) | 13.0 | 21.0 | - | 0/1803 | 0 |
| jog-1s-5m-cold-start | -14.2 | 91.0 (rejected:accuracy) | 101.0 | - | - | 270/1803 | 0 |
| jog-1s-5m-tunnel | 1.9 | 7.0 (rejected:time-backwards) | 11.0 | - | - | 0/1683 | 0 |
| jog-1s-5m-light | 0.9 | 6.0 (rejected:time-backwards) | 13.0 | 16.0 | 0.5 | 0/1803 | 7 |
| jog-1s-5m-still | 0.0 | 0.0 | never | - | 3.6 / 3.6 | 0/903 | 0 |
| jog-1s-15m-surge | 9.5 | 12.0 (held:still) | 11.0 | 26.0 | - | 0/1803 | 10 |
| jog-1s-15m-cold-start | -9.4 | 91.0 (rejected:accuracy) | 102.0 | - | - | 270/1803 | 0 |
| jog-1s-15m-tunnel | 7.8 | 4.0 (kept, no distance) | 12.0 | - | - | 0/1683 | 0 |
| jog-1s-15m-light | 11.7 | 11.0 (held:still) | 11.0 | 32.0 | 0.0 | 0/1803 | 30 |
| jog-1s-15m-still | 0.0 | 0.0 | never | - | 11.1 / 11.1 | 0/903 | 0 |
| jog-1s-30m-surge | -100.0 | 601.0 (rejected:accuracy) | never | never | - | 1586/1803 | 0 |
| jog-1s-30m-cold-start | -81.1 | 349.0 (rejected:accuracy) | 360.0 | - | - | 1448/1803 | 10 |
| jog-1s-30m-tunnel | -83.9 | 300.0 (rejected:accuracy) | 370.0 | - | - | 1371/1683 | 3 |
| jog-1s-30m-light | -87.4 | 299.0 (rejected:accuracy) | 468.0 | 226.0 | 0.0 | 1425/1803 | 0 |
| jog-1s-30m-still | 0.0 | 0.0 | never | - | 19.2 / 19.3 | 790/903 | 0 |
| jog-1s-50m-surge | -100.0 | 601.0 (rejected:accuracy) | never | never | - | 1803/1803 | 0 |
| jog-1s-50m-cold-start | -100.0 | 601.0 (rejected:accuracy) | never | - | - | 1803/1803 | 0 |
| jog-1s-50m-tunnel | -100.0 | 300.0 (rejected:accuracy) | never | - | - | 1683/1683 | 0 |
| jog-1s-50m-light | -100.0 | 299.0 (rejected:accuracy) | never | never | 0.0 | 1803/1803 | 0 |
| jog-1s-50m-still | 0.0 | 0.0 | never | - | 0.0 / 0.0 | 903/903 | 0 |
| jog-5s-5m-surge | -1.6 | 17.0 (kept, no distance) | 16.0 | 36.0 | - | 0/363 | 0 |
| jog-5s-5m-cold-start | -17.5 | 100.0 (rejected:accuracy) | 111.0 | - | - | 56/363 | 0 |
| jog-5s-5m-tunnel | -1.8 | 14.0 (kept, no distance) | 11.0 | - | - | 0/339 | 0 |
| jog-5s-5m-light | -1.6 | 14.0 (kept, no distance) | 19.0 | 21.0 | 0.8 | 0/363 | 1 |
| jog-5s-5m-still | 0.0 | 0.0 | never | - | 27.1 / 27.1 | 0/183 | 0 |
| jog-5s-15m-surge | 4.1 | 19.0 (kept, no distance) | 16.0 | 51.0 | - | 0/363 | 4 |
| jog-5s-15m-cold-start | -16.7 | 100.0 (rejected:accuracy) | 111.0 | - | - | 56/363 | 0 |
| jog-5s-15m-tunnel | -3.2 | 14.0 (kept, no distance) | 16.0 | - | - | 0/339 | 1 |
| jog-5s-15m-light | -2.4 | 21.0 (held:still) | 16.0 | 31.0 | 1.7 | 0/363 | 10 |
| jog-5s-15m-still | 0.0 | 0.0 | never | - | 98.9 / 98.9 | 0/183 | 0 |
| jog-5s-30m-surge | -79.2 | 310.0 (rejected:accuracy) | 316.0 | never | - | 275/363 | 1 |
| jog-5s-30m-cold-start | -100.0 | 601.0 (rejected:accuracy) | never | - | - | 324/363 | 2 |
| jog-5s-30m-tunnel | -82.0 | 279.0 (rejected:accuracy) | 51.0 | - | - | 278/339 | 0 |
| jog-5s-30m-light | -100.0 | 299.0 (rejected:accuracy) | never | never | 0.0 | 308/363 | 0 |
| jog-5s-30m-still | 0.0 | 0.0 | never | - | 5.2 / 6.5 | 139/183 | 0 |
| jog-5s-50m-surge | -100.0 | 601.0 (rejected:accuracy) | never | never | - | 363/363 | 0 |
| jog-5s-50m-cold-start | -100.0 | 601.0 (rejected:accuracy) | never | - | - | 363/363 | 0 |
| jog-5s-50m-tunnel | -100.0 | 300.0 (rejected:accuracy) | never | - | - | 339/339 | 0 |
| jog-5s-50m-light | -100.0 | 299.0 (rejected:accuracy) | never | never | 0.0 | 363/363 | 0 |
| jog-5s-50m-still | 0.0 | 0.0 | never | - | 0.0 / 0.0 | 183/183 | 0 |
| run-1s-5m-surge | -1.0 | 7.0 (rejected:speed) | 11.0 | 20.0 | - | 0/1803 | 0 |
| run-1s-5m-cold-start | -15.2 | 91.0 (rejected:accuracy) | 103.0 | - | - | 270/1803 | 0 |
| run-1s-5m-tunnel | -1.1 | 6.0 (rejected:speed) | 11.0 | - | - | 0/1683 | 0 |
| run-1s-5m-light | -0.7 | 7.0 (rejected:speed) | 11.0 | 15.0 | 0.0 | 0/1803 | 10 |
| run-1s-5m-still | 0.0 | 0.0 | never | - | 36.6 / 36.6 | 0/903 | 0 |
| run-1s-15m-surge | 3.7 | 6.0 (rejected:speed) | 12.0 | 23.0 | - | 0/1803 | 0 |
| run-1s-15m-cold-start | -12.7 | 94.0 (rejected:accuracy) | 105.0 | - | - | 270/1803 | 0 |
| run-1s-15m-tunnel | 4.0 | 8.0 (rejected:speed) | 11.0 | - | - | 0/1683 | 0 |
| run-1s-15m-light | 4.3 | 9.0 (held:still) | 11.0 | 21.0 | 2.4 | 0/1803 | 20 |
| run-1s-15m-still | 0.0 | 0.0 | never | - | 20.5 / 20.5 | 0/903 | 0 |
| run-1s-30m-surge | -73.3 | 373.0 (rejected:accuracy) | 233.0 | never | - | 1504/1803 | 0 |
| run-1s-30m-cold-start | -92.4 | 499.0 (rejected:accuracy) | 509.0 | - | - | 1549/1803 | 0 |
| run-1s-30m-tunnel | -82.2 | 300.0 (rejected:accuracy) | 422.0 | - | - | 1369/1683 | 0 |
| run-1s-30m-light | -91.3 | 270.0 (rejected:accuracy) | 221.0 | never | 0.0 | 1517/1803 | 0 |
| run-1s-30m-still | 0.0 | 0.0 | never | - | 15.7 / 18.6 | 769/903 | 0 |
| run-1s-50m-surge | -100.0 | 601.0 (rejected:accuracy) | never | never | - | 1803/1803 | 0 |
| run-1s-50m-cold-start | -100.0 | 601.0 (rejected:accuracy) | never | - | - | 1803/1803 | 0 |
| run-1s-50m-tunnel | -100.0 | 300.0 (rejected:accuracy) | never | - | - | 1683/1683 | 0 |
| run-1s-50m-light | -100.0 | 299.0 (rejected:accuracy) | never | never | 0.0 | 1803/1803 | 0 |
| run-1s-50m-still | 0.0 | 0.0 | never | - | 0.0 / 0.0 | 903/903 | 0 |
| run-5s-5m-surge | -2.2 | 14.0 (kept, no distance) | 16.0 | 36.0 | - | 0/363 | 0 |
| run-5s-5m-cold-start | -17.2 | 100.0 (rejected:accuracy) | 111.0 | - | - | 55/363 | 0 |
| run-5s-5m-tunnel | -3.4 | 19.0 (kept, no distance) | 11.0 | - | - | 0/339 | 0 |
| run-5s-5m-light | -3.6 | 13.0 (kept, no distance) | 11.0 | 21.0 | 1.0 | 0/363 | 1 |
| run-5s-5m-still | 0.0 | 0.0 | never | - | 1.3 / 1.3 | 0/183 | 0 |
| run-5s-15m-surge | -2.2 | 19.0 (kept, no distance) | 16.0 | 26.0 | - | 0/363 | 0 |
| run-5s-15m-cold-start | -18.3 | 105.0 (rejected:accuracy) | 111.0 | - | - | 56/363 | 0 |
| run-5s-15m-tunnel | -2.7 | 14.0 (kept, no distance) | 16.0 | - | - | 0/339 | 0 |
| run-5s-15m-light | -3.3 | 14.0 (kept, no distance) | 16.0 | 36.0 | 1.8 | 0/363 | 6 |
| run-5s-15m-still | 0.0 | 0.0 | never | - | 5.3 / 5.3 | 0/183 | 0 |
| run-5s-30m-surge | -93.4 | 560.0 (rejected:accuracy) | 569.0 | never | - | 307/363 | 0 |
| run-5s-30m-cold-start | -93.4 | 405.0 (rejected:accuracy) | 461.0 | - | - | 329/363 | 0 |
| run-5s-30m-tunnel | -77.0 | 300.0 (rejected:accuracy) | 411.0 | - | - | 255/339 | 0 |
| run-5s-30m-light | -100.0 | 299.0 (rejected:accuracy) | never | never | 0.0 | 312/363 | 0 |
| run-5s-30m-still | 0.0 | 0.0 | never | - | 6.4 / 9.4 | 127/183 | 0 |
| run-5s-50m-surge | -100.0 | 601.0 (rejected:accuracy) | never | never | - | 363/363 | 0 |
| run-5s-50m-cold-start | -100.0 | 601.0 (rejected:accuracy) | never | - | - | 363/363 | 0 |
| run-5s-50m-tunnel | -100.0 | 300.0 (rejected:accuracy) | never | - | - | 339/339 | 0 |
| run-5s-50m-light | -100.0 | 299.0 (rejected:accuracy) | never | never | 0.0 | 363/363 | 0 |
| run-5s-50m-still | 0.0 | 0.0 | never | - | 0.0 / 0.0 | 183/183 | 0 |

## After: fix-4.4d, worst of 3 seeds per combination

| trace | distance error % | frozen s (cause) | pace first s | pace follow s | added standing m (still: live / End) | accuracy rejects | still while moving |
|---|---|---|---|---|---|---|---|
| walk-1s-5m-surge | 2.0 | 4.0 (held:short) | 2.0 | 5.0 | - | 0/1803 | 0 |
| walk-1s-5m-cold-start | -4.4 | 9.0 (held:short) | 15.0 | - | - | 0/1803 | 0 |
| walk-1s-5m-tunnel | -0.9 | 4.0 (held:short) | 2.0 | - | - | 0/1683 | 0 |
| walk-1s-5m-light | 2.1 | 4.0 (held:short) | 5.0 | 9.0 | 0.0 | 0/1803 | 0 |
| walk-1s-5m-still | 0.0 | 0.0 | never | - | 0.0 / 0.0 | 0/903 | 0 |
| walk-1s-15m-surge | 2.2 | 6.0 (held:short) | 3.0 | 6.0 | - | 0/1803 | 0 |
| walk-1s-15m-cold-start | 6.6 | 11.0 (held:short) | 14.0 | - | - | 0/1803 | 0 |
| walk-1s-15m-tunnel | 4.4 | 7.0 (held:short) | 2.0 | - | - | 0/1683 | 0 |
| walk-1s-15m-light | 2.2 | 6.0 (held:short) | 2.0 | 6.0 | 0.0 | 0/1803 | 0 |
| walk-1s-15m-still | 0.0 | 0.0 | never | - | 0.0 / 0.0 | 0/903 | 0 |
| walk-1s-30m-surge | 4.7 | 20.0 (held:still) | 11.0 | 24.0 | - | 0/1803 | 29 |
| walk-1s-30m-cold-start | 10.9 | 8.0 (held:short) | 13.0 | - | - | 0/1803 | 0 |
| walk-1s-30m-tunnel | 6.7 | 32.0 (held:still) | 11.0 | - | - | 0/1683 | 19 |
| walk-1s-30m-light | 8.4 | 33.0 (held:still) | 9.0 | 120.0 | 0.0 | 0/1803 | 89 |
| walk-1s-30m-still | 0.0 | 0.0 | never | - | 53.3 / 53.3 | 0/903 | 0 |
| walk-1s-50m-surge | 12.4 | 64.0 (rejected:accuracy) | 25.0 | 47.0 | - | 139/1803 | 0 |
| walk-1s-50m-cold-start | 13.2 | 73.0 (rejected:accuracy) | 17.0 | - | - | 72/1803 | 0 |
| walk-1s-50m-tunnel | 11.1 | 60.0 (rejected:accuracy) | 13.0 | - | - | 76/1683 | 0 |
| walk-1s-50m-light | 17.0 | 83.0 (rejected:accuracy) | 13.0 | 99.0 | 10.0 | 214/1803 | 0 |
| walk-1s-50m-still | 0.0 | 0.0 | 281.0 | - | 156.7 / 158.6 | 0/903 | 0 |
| walk-5s-5m-surge | 1.6 | 10.0 (held:short) | 6.0 | 26.0 | - | 0/363 | 0 |
| walk-5s-5m-cold-start | 21.2 | 14.0 (held:short) | 11.0 | - | - | 0/363 | 0 |
| walk-5s-5m-tunnel | 3.7 | 11.0 (held:short) | 6.0 | - | - | 0/339 | 0 |
| walk-5s-5m-light | 1.9 | 12.0 (held:short) | 6.0 | 11.0 | 0.0 | 0/363 | 0 |
| walk-5s-5m-still | 0.0 | 0.0 | never | - | 0.0 / 0.0 | 0/183 | 0 |
| walk-5s-15m-surge | 18.3 | 9.0 (held:short) | 6.0 | 11.0 | - | 0/363 | 0 |
| walk-5s-15m-cold-start | 22.9 | 14.0 (held:short) | 16.0 | - | - | 0/363 | 0 |
| walk-5s-15m-tunnel | 10.3 | 12.0 (held:short) | 6.0 | - | - | 0/339 | 0 |
| walk-5s-15m-light | 8.7 | 14.0 (held:short) | 6.0 | 11.0 | 6.1 | 0/363 | 0 |
| walk-5s-15m-still | 0.0 | 0.0 | never | - | 79.5 / 79.5 | 0/183 | 0 |
| walk-5s-30m-surge | 36.1 | 11.0 (held:short) | 11.0 | 71.0 | - | 0/363 | 0 |
| walk-5s-30m-cold-start | 25.9 | 14.0 (held:short) | 16.0 | - | - | 0/363 | 0 |
| walk-5s-30m-tunnel | 27.7 | 10.0 (kept, no distance) | 16.0 | - | - | 0/339 | 0 |
| walk-5s-30m-light | 47.5 | 14.0 (held:short) | 11.0 | 16.0 | 80.1 | 0/363 | 0 |
| walk-5s-30m-still | 0.0 | 0.0 | 96.0 | - | 252.9 / 252.9 | 0/183 | 0 |
| walk-5s-50m-surge | 35.1 | 84.0 (rejected:accuracy) | 36.0 | 76.0 | - | 21/363 | 0 |
| walk-5s-50m-cold-start | 35.0 | 109.0 (rejected:accuracy) | 16.0 | - | - | 21/363 | 0 |
| walk-5s-50m-tunnel | 7.8 | 83.0 (rejected:accuracy) | 18.0 | - | - | 51/339 | 0 |
| walk-5s-50m-light | 38.9 | 85.0 (rejected:accuracy) | 86.0 | 66.0 | 9.8 | 34/363 | 0 |
| walk-5s-50m-still | 0.0 | 0.0 | 136.0 | - | 215.3 / 215.3 | 4/183 | 0 |
| jog-1s-5m-surge | 2.5 | 4.0 (held:short) | 2.0 | 7.0 | - | 0/1803 | 0 |
| jog-1s-5m-cold-start | 7.7 | 6.0 (held:short) | 9.0 | - | - | 0/1803 | 0 |
| jog-1s-5m-tunnel | 0.5 | 3.0 (kept, no distance) | 4.0 | - | - | 0/1683 | 0 |
| jog-1s-5m-light | 0.2 | 4.0 (held:short) | 2.0 | 6.0 | 0.0 | 0/1803 | 0 |
| jog-1s-5m-still | 0.0 | 0.0 | never | - | 0.0 / 0.0 | 0/903 | 0 |
| jog-1s-15m-surge | 1.9 | 5.0 (held:short) | 2.0 | 6.0 | - | 0/1803 | 0 |
| jog-1s-15m-cold-start | 3.2 | 5.0 (held:short) | 10.0 | - | - | 0/1803 | 0 |
| jog-1s-15m-tunnel | 1.6 | 5.0 (held:short) | 5.0 | - | - | 0/1683 | 0 |
| jog-1s-15m-light | 2.8 | 5.0 (rejected:speed) | 2.0 | 6.0 | 0.0 | 0/1803 | 0 |
| jog-1s-15m-still | 0.0 | 0.0 | never | - | 0.0 / 0.0 | 0/903 | 0 |
| jog-1s-30m-surge | 2.7 | 4.0 (held:short) | 8.0 | 14.0 | - | 0/1803 | 0 |
| jog-1s-30m-cold-start | 3.0 | 5.0 (held:short) | 10.0 | - | - | 0/1803 | 0 |
| jog-1s-30m-tunnel | 3.6 | 5.0 (held:short) | 9.0 | - | - | 0/1683 | 0 |
| jog-1s-30m-light | 5.6 | 14.0 (rejected:jump) | 8.0 | 34.0 | 9.2 | 0/1803 | 6 |
| jog-1s-30m-still | 0.0 | 0.0 | never | - | 63.0 / 63.0 | 0/903 | 0 |
| jog-1s-50m-surge | 5.0 | 83.0 (rejected:accuracy) | 9.0 | 16.0 | - | 159/1803 | 0 |
| jog-1s-50m-cold-start | 6.4 | 75.0 (rejected:accuracy) | 12.0 | - | - | 184/1803 | 0 |
| jog-1s-50m-tunnel | -7.2 | 78.0 (rejected:accuracy) | 8.0 | - | - | 77/1683 | 0 |
| jog-1s-50m-light | -9.8 | 82.0 (rejected:accuracy) | 81.0 | 17.0 | 18.3 | 209/1803 | 0 |
| jog-1s-50m-still | 0.0 | 0.0 | 55.0 | - | 184.4 / 185.5 | 61/903 | 0 |
| jog-5s-5m-surge | -1.6 | 9.0 (held:short) | 6.0 | 21.0 | - | 0/363 | 0 |
| jog-5s-5m-cold-start | 2.2 | 10.0 (held:short) | 11.0 | - | - | 0/363 | 0 |
| jog-5s-5m-tunnel | -1.7 | 9.0 (held:short) | 6.0 | - | - | 0/339 | 0 |
| jog-5s-5m-light | -1.6 | 10.0 (kept, no distance) | 6.0 | 16.0 | 0.0 | 0/363 | 0 |
| jog-5s-5m-still | 0.0 | 0.0 | never | - | 0.0 / 0.0 | 0/183 | 0 |
| jog-5s-15m-surge | 5.9 | 14.0 (held:short) | 6.0 | 6.0 | - | 0/363 | 0 |
| jog-5s-15m-cold-start | 4.8 | 9.0 (held:short) | 11.0 | - | - | 0/363 | 0 |
| jog-5s-15m-tunnel | 11.3 | 14.0 (rejected:speed) | 6.0 | - | - | 0/339 | 0 |
| jog-5s-15m-light | 3.5 | 10.0 (held:short) | 6.0 | 11.0 | 7.6 | 0/363 | 0 |
| jog-5s-15m-still | 0.0 | 0.0 | never | - | 0.0 / 0.0 | 0/183 | 0 |
| jog-5s-30m-surge | 23.2 | 11.0 (held:short) | 11.0 | 26.0 | - | 0/363 | 0 |
| jog-5s-30m-cold-start | 7.6 | 9.0 (rejected:speed) | 11.0 | - | - | 0/363 | 0 |
| jog-5s-30m-tunnel | -1.1 | 9.0 (held:short) | 11.0 | - | - | 0/339 | 0 |
| jog-5s-30m-light | 8.7 | 9.0 (held:short) | 11.0 | 26.0 | 11.4 | 0/363 | 0 |
| jog-5s-30m-still | 0.0 | 0.0 | 176.0 | - | 205.8 / 206.6 | 0/183 | 0 |
| jog-5s-50m-surge | 17.0 | 14.0 (held:short) | 11.0 | 41.0 | - | 0/363 | 0 |
| jog-5s-50m-cold-start | 12.3 | 54.0 (rejected:accuracy) | 11.0 | - | - | 10/363 | 0 |
| jog-5s-50m-tunnel | 9.5 | 59.0 (rejected:accuracy) | 11.0 | - | - | 11/339 | 0 |
| jog-5s-50m-light | 11.0 | 39.0 (rejected:accuracy) | 11.0 | 21.0 | 13.7 | 10/363 | 0 |
| jog-5s-50m-still | 0.0 | 0.0 | 36.0 | - | 311.4 / 312.5 | 21/183 | 0 |
| run-1s-5m-surge | 0.5 | 2.0 (rejected:jump) | 2.0 | 6.0 | - | 0/1803 | 0 |
| run-1s-5m-cold-start | 3.2 | 5.0 (held:short) | 8.0 | - | - | 0/1803 | 0 |
| run-1s-5m-tunnel | -1.1 | 4.0 (rejected:jump) | 2.0 | - | - | 0/1683 | 0 |
| run-1s-5m-light | 1.1 | 2.0 (held:short) | 2.0 | 6.0 | 0.0 | 0/1803 | 0 |
| run-1s-5m-still | 0.0 | 0.0 | never | - | 0.0 / 0.0 | 0/903 | 0 |
| run-1s-15m-surge | 2.1 | 4.0 (held:short) | 2.0 | 5.0 | - | 0/1803 | 0 |
| run-1s-15m-cold-start | 3.3 | 5.0 (held:short) | 9.0 | - | - | 0/1803 | 0 |
| run-1s-15m-tunnel | -0.9 | 5.0 (held:short) | 2.0 | - | - | 0/1683 | 0 |
| run-1s-15m-light | 2.8 | 4.0 (held:short) | 2.0 | 8.0 | 0.0 | 0/1803 | 0 |
| run-1s-15m-still | 0.0 | 0.0 | never | - | 0.0 / 0.0 | 0/903 | 0 |
| run-1s-30m-surge | 2.7 | 4.0 (held:short) | 9.0 | 11.0 | - | 0/1803 | 0 |
| run-1s-30m-cold-start | 2.5 | 4.0 (held:short) | 10.0 | - | - | 0/1803 | 0 |
| run-1s-30m-tunnel | 4.4 | 4.0 (held:short) | 8.0 | - | - | 0/1683 | 0 |
| run-1s-30m-light | 4.2 | 19.0 (rejected:jump) | 7.0 | 35.0 | 13.1 | 0/1803 | 8 |
| run-1s-30m-still | 0.0 | 0.0 | 139.0 | - | 83.6 / 95.7 | 0/903 | 0 |
| run-1s-50m-surge | -11.5 | 135.0 (rejected:accuracy) | 58.0 | 135.0 | - | 243/1803 | 0 |
| run-1s-50m-cold-start | 2.3 | 69.0 (rejected:accuracy) | 7.0 | - | - | 167/1803 | 0 |
| run-1s-50m-tunnel | -0.5 | 47.0 (rejected:accuracy) | 10.0 | - | - | 136/1683 | 0 |
| run-1s-50m-light | 2.6 | 41.0 (rejected:accuracy) | 7.0 | 19.0 | 24.6 | 98/1803 | 0 |
| run-1s-50m-still | 0.0 | 0.0 | 160.0 | - | 179.6 / 182.5 | 98/903 | 0 |
| run-5s-5m-surge | -2.1 | 9.0 (held:short) | 9.0 | 11.0 | - | 0/363 | 0 |
| run-5s-5m-cold-start | -1.3 | 9.0 (held:short) | 11.0 | - | - | 0/363 | 0 |
| run-5s-5m-tunnel | -3.3 | 19.0 (held:short) | 6.0 | - | - | 0/339 | 0 |
| run-5s-5m-light | -3.5 | 13.0 (held:short) | 6.0 | 16.0 | 0.0 | 0/363 | 0 |
| run-5s-5m-still | 0.0 | 0.0 | never | - | 0.0 / 0.0 | 0/183 | 0 |
| run-5s-15m-surge | 2.7 | 14.0 (held:short) | 8.0 | 11.0 | - | 0/363 | 0 |
| run-5s-15m-cold-start | 5.4 | 10.0 (held:short) | 11.0 | - | - | 0/363 | 0 |
| run-5s-15m-tunnel | -1.1 | 9.0 (held:short) | 6.0 | - | - | 0/339 | 0 |
| run-5s-15m-light | 5.5 | 9.0 (held:short) | 6.0 | 11.0 | 44.6 | 0/363 | 0 |
| run-5s-15m-still | 0.0 | 0.0 | never | - | 14.3 / 14.3 | 0/183 | 0 |
| run-5s-30m-surge | -0.7 | 12.0 (held:short) | 11.0 | 21.0 | - | 0/363 | 0 |
| run-5s-30m-cold-start | 11.7 | 9.0 (held:short) | 11.0 | - | - | 0/363 | 0 |
| run-5s-30m-tunnel | 3.8 | 10.0 (rejected:speed) | 11.0 | - | - | 0/339 | 0 |
| run-5s-30m-light | 15.8 | 9.0 (held:short) | 11.0 | 21.0 | 16.9 | 0/363 | 0 |
| run-5s-30m-still | 0.0 | 0.0 | 36.0 | - | 294.3 / 296.4 | 0/183 | 0 |
| run-5s-50m-surge | 7.1 | 64.0 (rejected:accuracy) | 11.0 | 21.0 | - | 18/363 | 0 |
| run-5s-50m-cold-start | 17.8 | 35.0 (rejected:accuracy) | 11.0 | - | - | 7/363 | 0 |
| run-5s-50m-tunnel | -12.0 | 74.0 (rejected:accuracy) | 51.0 | - | - | 37/339 | 0 |
| run-5s-50m-light | 4.5 | 79.0 (rejected:accuracy) | 11.0 | 26.0 | 18.2 | 41/363 | 0 |
| run-5s-50m-still | 0.0 | 0.0 | 31.0 | - | 339.3 / 342.8 | 15/183 | 0 |
