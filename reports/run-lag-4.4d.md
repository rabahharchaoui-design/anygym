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
30 s at a light, the phone still reporting). Noise model: a smooth bias tied to the reported
accuracy (spread 0.35 x accuracy, periods 2 to 10 minutes), white jitter (0.05 x accuracy), 1%
outliers 2 to 3 x accuracy off, 3% repeated positions, and 4% delivery stalls of 1.5 to 4 s after
which the held fixes arrive together (late fixes). Each trace goes through the live run exactly as
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

What the table does NOT explain: why G's phone reported what it did. If his export shows fixes at
5 to 16 m arriving every second, none of (a), (b), (e) applies to his run and the cause is elsewhere
(the screen not redrawing, a stalled main thread), which this harness cannot see.

## Before: today's code, worst of 3 seeds per combination

| trace | distance error % | frozen s (cause) | pace first s | pace follow s | added standing m | accuracy rejects | still while moving |
|---|---|---|---|---|---|---|---|
| walk-1s-5m-surge | 4.4 | 5.0 (rejected:time-backwards) | 11.0 | 26.0 | - | 0/1803 | 0 |
| walk-1s-5m-cold-start | -12.6 | 92.0 (rejected:accuracy) | 101.0 | - | - | 270/1803 | 0 |
| walk-1s-5m-tunnel | 5.3 | 5.0 (rejected:time-backwards) | 11.0 | - | - | 0/1683 | 0 |
| walk-1s-5m-light | 5.5 | 8.0 (held:still) | 11.0 | 20.0 | 0.0 | 0/1803 | 21 |
| walk-1s-15m-surge | 21.2 | 30.0 (held:still) | 14.0 | 89.0 | - | 0/1803 | 265 |
| walk-1s-15m-cold-start | 1.1 | 91.0 (rejected:accuracy) | 101.0 | - | - | 270/1803 | 364 |
| walk-1s-15m-tunnel | 18.9 | 30.0 (held:still) | 41.0 | - | - | 0/1683 | 489 |
| walk-1s-15m-light | 18.0 | 37.0 (held:still) | 11.0 | 102.0 | 0.0 | 0/1803 | 405 |
| walk-1s-30m-surge | -66.1 | 335.0 (rejected:accuracy) | 255.0 | never | - | 1463/1803 | 189 |
| walk-1s-30m-cold-start | -86.9 | 313.0 (rejected:accuracy) | 455.0 | - | - | 1492/1803 | 155 |
| walk-1s-30m-tunnel | -67.2 | 286.0 (rejected:accuracy) | 385.0 | - | - | 1184/1683 | 266 |
| walk-1s-30m-light | -16.6 | 266.0 (rejected:accuracy) | never | never | 0.0 | 1340/1803 | 245 |
| walk-1s-50m-surge | -100.0 | 601.0 (rejected:accuracy) | never | never | - | 1803/1803 | 0 |
| walk-1s-50m-cold-start | -100.0 | 601.0 (rejected:accuracy) | never | - | - | 1803/1803 | 0 |
| walk-1s-50m-tunnel | -100.0 | 300.0 (rejected:accuracy) | never | - | - | 1683/1683 | 0 |
| walk-1s-50m-light | -100.0 | 299.0 (rejected:accuracy) | never | never | 0.0 | 1803/1803 | 0 |
| walk-5s-5m-surge | 2.0 | 10.0 (kept, no distance) | 11.0 | 21.0 | - | 0/363 | 0 |
| walk-5s-5m-cold-start | -16.1 | 100.0 (rejected:accuracy) | 111.0 | - | - | 56/363 | 0 |
| walk-5s-5m-tunnel | 3.4 | 11.0 (kept, no distance) | 16.0 | - | - | 0/339 | 0 |
| walk-5s-5m-light | 2.1 | 12.0 (kept, no distance) | 16.0 | 26.0 | 0.7 | 0/363 | 5 |
| walk-5s-15m-surge | 6.2 | 34.0 (held:still) | 31.0 | 41.0 | - | 0/363 | 47 |
| walk-5s-15m-cold-start | -16.1 | 99.0 (rejected:accuracy) | 111.0 | - | - | 55/363 | 47 |
| walk-5s-15m-tunnel | 9.6 | 32.0 (held:still) | 16.0 | - | - | 0/339 | 24 |
| walk-5s-15m-light | 4.2 | 32.0 (held:still) | 16.0 | 106.0 | 3.9 | 0/363 | 41 |
| walk-5s-30m-surge | -82.9 | 479.0 (rejected:accuracy) | 366.0 | never | - | 266/363 | 16 |
| walk-5s-30m-cold-start | -83.9 | 505.0 (rejected:accuracy) | 550.0 | - | - | 294/363 | 9 |
| walk-5s-30m-tunnel | -73.5 | 204.0 (rejected:accuracy) | 171.0 | - | - | 211/339 | 27 |
| walk-5s-30m-light | -88.2 | 299.0 (rejected:accuracy) | 456.0 | never | 0.0 | 299/363 | 25 |
| walk-5s-50m-surge | -100.0 | 601.0 (rejected:accuracy) | never | never | - | 363/363 | 0 |
| walk-5s-50m-cold-start | -100.0 | 601.0 (rejected:accuracy) | never | - | - | 363/363 | 0 |
| walk-5s-50m-tunnel | -100.0 | 300.0 (rejected:accuracy) | never | - | - | 339/339 | 0 |
| walk-5s-50m-light | -100.0 | 299.0 (rejected:accuracy) | never | never | 0.0 | 363/363 | 0 |
| jog-1s-5m-surge | 5.0 | 6.0 (rejected:speed) | 13.0 | 21.0 | - | 0/1803 | 0 |
| jog-1s-5m-cold-start | -14.2 | 91.0 (rejected:accuracy) | 101.0 | - | - | 270/1803 | 0 |
| jog-1s-5m-tunnel | 1.9 | 7.0 (rejected:time-backwards) | 11.0 | - | - | 0/1683 | 0 |
| jog-1s-5m-light | 0.9 | 6.0 (rejected:time-backwards) | 13.0 | 16.0 | 0.5 | 0/1803 | 7 |
| jog-1s-15m-surge | 9.0 | 5.0 (rejected:time-backwards) | 11.0 | 19.0 | - | 0/1803 | 0 |
| jog-1s-15m-cold-start | -9.4 | 91.0 (rejected:accuracy) | 102.0 | - | - | 270/1803 | 9 |
| jog-1s-15m-tunnel | 8.1 | 4.0 (kept, no distance) | 12.0 | - | - | 0/1683 | 0 |
| jog-1s-15m-light | 11.0 | 14.0 (held:still) | 11.0 | 32.0 | 0.0 | 0/1803 | 38 |
| jog-1s-30m-surge | -100.0 | 601.0 (rejected:accuracy) | never | never | - | 1586/1803 | 0 |
| jog-1s-30m-cold-start | -80.5 | 349.0 (rejected:accuracy) | 360.0 | - | - | 1448/1803 | 10 |
| jog-1s-30m-tunnel | -84.0 | 300.0 (rejected:accuracy) | 370.0 | - | - | 1371/1683 | 0 |
| jog-1s-30m-light | -87.3 | 299.0 (rejected:accuracy) | 468.0 | 209.0 | 0.0 | 1425/1803 | 31 |
| jog-1s-50m-surge | -100.0 | 601.0 (rejected:accuracy) | never | never | - | 1803/1803 | 0 |
| jog-1s-50m-cold-start | -100.0 | 601.0 (rejected:accuracy) | never | - | - | 1803/1803 | 0 |
| jog-1s-50m-tunnel | -100.0 | 300.0 (rejected:accuracy) | never | - | - | 1683/1683 | 0 |
| jog-1s-50m-light | -100.0 | 299.0 (rejected:accuracy) | never | never | 0.0 | 1803/1803 | 0 |
| jog-5s-5m-surge | -1.6 | 17.0 (kept, no distance) | 16.0 | 36.0 | - | 0/363 | 0 |
| jog-5s-5m-cold-start | -17.5 | 100.0 (rejected:accuracy) | 111.0 | - | - | 56/363 | 0 |
| jog-5s-5m-tunnel | -1.8 | 14.0 (kept, no distance) | 11.0 | - | - | 0/339 | 0 |
| jog-5s-5m-light | -1.6 | 14.0 (kept, no distance) | 19.0 | 21.0 | 0.8 | 0/363 | 1 |
| jog-5s-15m-surge | 4.1 | 19.0 (kept, no distance) | 16.0 | 51.0 | - | 0/363 | 4 |
| jog-5s-15m-cold-start | -16.9 | 100.0 (rejected:accuracy) | 111.0 | - | - | 56/363 | 0 |
| jog-5s-15m-tunnel | -3.2 | 14.0 (kept, no distance) | 16.0 | - | - | 0/339 | 1 |
| jog-5s-15m-light | -1.7 | 14.0 (kept, no distance) | 16.0 | 31.0 | 1.7 | 0/363 | 6 |
| jog-5s-30m-surge | -78.9 | 310.0 (rejected:accuracy) | 316.0 | never | - | 275/363 | 0 |
| jog-5s-30m-cold-start | -100.0 | 601.0 (rejected:accuracy) | never | - | - | 324/363 | 2 |
| jog-5s-30m-tunnel | -82.4 | 279.0 (rejected:accuracy) | 51.0 | - | - | 278/339 | 0 |
| jog-5s-30m-light | -100.0 | 299.0 (rejected:accuracy) | never | never | 0.0 | 308/363 | 0 |
| jog-5s-50m-surge | -100.0 | 601.0 (rejected:accuracy) | never | never | - | 363/363 | 0 |
| jog-5s-50m-cold-start | -100.0 | 601.0 (rejected:accuracy) | never | - | - | 363/363 | 0 |
| jog-5s-50m-tunnel | -100.0 | 300.0 (rejected:accuracy) | never | - | - | 339/339 | 0 |
| jog-5s-50m-light | -100.0 | 299.0 (rejected:accuracy) | never | never | 0.0 | 363/363 | 0 |
| run-1s-5m-surge | -1.0 | 7.0 (rejected:speed) | 11.0 | 20.0 | - | 0/1803 | 0 |
| run-1s-5m-cold-start | -15.2 | 91.0 (rejected:accuracy) | 103.0 | - | - | 270/1803 | 0 |
| run-1s-5m-tunnel | -1.1 | 6.0 (rejected:speed) | 11.0 | - | - | 0/1683 | 0 |
| run-1s-5m-light | -0.7 | 7.0 (rejected:speed) | 11.0 | 15.0 | 0.0 | 0/1803 | 10 |
| run-1s-15m-surge | 3.9 | 6.0 (rejected:speed) | 12.0 | 26.0 | - | 0/1803 | 0 |
| run-1s-15m-cold-start | -12.7 | 94.0 (rejected:accuracy) | 105.0 | - | - | 270/1803 | 0 |
| run-1s-15m-tunnel | 4.0 | 8.0 (rejected:speed) | 11.0 | - | - | 0/1683 | 0 |
| run-1s-15m-light | 4.3 | 9.0 (held:still) | 11.0 | 21.0 | 2.4 | 0/1803 | 20 |
| run-1s-30m-surge | -73.3 | 373.0 (rejected:accuracy) | 233.0 | never | - | 1504/1803 | 0 |
| run-1s-30m-cold-start | -92.4 | 499.0 (rejected:accuracy) | 509.0 | - | - | 1549/1803 | 0 |
| run-1s-30m-tunnel | -82.0 | 300.0 (rejected:accuracy) | 422.0 | - | - | 1369/1683 | 0 |
| run-1s-30m-light | -92.4 | 270.0 (rejected:accuracy) | 221.0 | never | 0.0 | 1517/1803 | 13 |
| run-1s-50m-surge | -100.0 | 601.0 (rejected:accuracy) | never | never | - | 1803/1803 | 0 |
| run-1s-50m-cold-start | -100.0 | 601.0 (rejected:accuracy) | never | - | - | 1803/1803 | 0 |
| run-1s-50m-tunnel | -100.0 | 300.0 (rejected:accuracy) | never | - | - | 1683/1683 | 0 |
| run-1s-50m-light | -100.0 | 299.0 (rejected:accuracy) | never | never | 0.0 | 1803/1803 | 0 |
| run-5s-5m-surge | -2.2 | 14.0 (kept, no distance) | 16.0 | 36.0 | - | 0/363 | 0 |
| run-5s-5m-cold-start | -17.2 | 100.0 (rejected:accuracy) | 111.0 | - | - | 55/363 | 0 |
| run-5s-5m-tunnel | -3.4 | 19.0 (kept, no distance) | 11.0 | - | - | 0/339 | 0 |
| run-5s-5m-light | -3.6 | 13.0 (kept, no distance) | 11.0 | 21.0 | 1.0 | 0/363 | 1 |
| run-5s-15m-surge | -2.2 | 19.0 (kept, no distance) | 16.0 | 26.0 | - | 0/363 | 0 |
| run-5s-15m-cold-start | -18.3 | 105.0 (rejected:accuracy) | 111.0 | - | - | 56/363 | 0 |
| run-5s-15m-tunnel | -2.7 | 14.0 (kept, no distance) | 16.0 | - | - | 0/339 | 0 |
| run-5s-15m-light | -3.0 | 14.0 (kept, no distance) | 16.0 | 31.0 | 1.7 | 0/363 | 6 |
| run-5s-30m-surge | -93.5 | 560.0 (rejected:accuracy) | 569.0 | never | - | 307/363 | 0 |
| run-5s-30m-cold-start | -93.5 | 405.0 (rejected:accuracy) | 461.0 | - | - | 329/363 | 0 |
| run-5s-30m-tunnel | -77.2 | 300.0 (rejected:accuracy) | 411.0 | - | - | 255/339 | 0 |
| run-5s-30m-light | -100.0 | 299.0 (rejected:accuracy) | never | never | 0.0 | 312/363 | 0 |
| run-5s-50m-surge | -100.0 | 601.0 (rejected:accuracy) | never | never | - | 363/363 | 0 |
| run-5s-50m-cold-start | -100.0 | 601.0 (rejected:accuracy) | never | - | - | 363/363 | 0 |
| run-5s-50m-tunnel | -100.0 | 300.0 (rejected:accuracy) | never | - | - | 339/339 | 0 |
| run-5s-50m-light | -100.0 | 299.0 (rejected:accuracy) | never | never | 0.0 | 363/363 | 0 |
