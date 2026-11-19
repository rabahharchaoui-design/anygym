STATUS: NEW
Grok Build review of PLAN item 4.4a, range 684c26ef94b1526249440d716d1df7285bc8ab75..e15e1158185a4b06bf93c81d7dc0a4425d7069e8, written Nov 19 09:57. A second opinion, not orders: SPEC.md wins.

I'll review PLAN item 4.4a from the spec and the commit range only, without changing the repo.

The queue marks 4.4a done. Next I’ll read the spec sections it touches and the exact commit range.

The range mixes 4.4a code with later notes. I’ll read the run-clock and countdown changes against the spec.

# Grok review of PLAN item 4.4a

- MAJOR `src/lib/gps/tracker.ts:121`: A GPS dropout still adds its first 15 seconds to moving time. On a 20 minute Time run, GPS dies with 10 seconds left: the face keeps counting, and `LiveRun.tsx:193` shows "Goal reached" in the tunnel. Those 15 seconds are stored on the run. The summary then shows them under Moving time while the line at `RunSummary.tsx:82` says the dashed stretch is not counted as moving time. Average pace leaves them out, so the pace and the time on that screen do not describe the same run. SPEC 12.2 says time in a gap is not moving time. Smallest fix: once the wait passes the gap threshold, stop the face at the last counted second and credit 0 in `holdGap`. One step back at "GPS lost" is the honest correction. Keep ticking only between fixes that are still inside the gap threshold.

- MAJOR `src/lib/gps/tracker.ts:147`: That same 15 second credit is a split step with no distance and `gap: true`, so `splits.ts:61` marks the whole open mile or kilometer as a gap. A bad fix that is not counted as distance (the case `tracker.test.ts:85` locks in) still does this. Finish the kilometer and the summary shows "GPS gap" and no time, with the note that part of the split has no time. The voice still speaks a time, and that time includes the extra 15 seconds. Smallest fix: keep those seconds on `heldMs` only. Do not mark the split as a gap and do not add them to the split's time.

- MAJOR `src/lib/run/snapshot.ts:142`: Locking the phone and coming back after iOS discards the Home Screen app steps the clock back. The face is ahead of the last fix by up to 15 seconds, the save writes only the engine's `movingMs`, and restore calls `pauseRun(tracker)` with no time, so those seconds are dropped. A clock that read 12:08 comes back paused at 12:02. Smallest fix: store the save time on the snapshot and restore with `pauseRun(tracker, savedAt)` so the seconds already on the face are kept and the time after the save is not. Do this on the 5 second save and on `pagehide`. Do not add that credit to the live tracker or the next fix will count it again.

- MAJOR `src/screens/run/Countdown.tsx:48`: The haptic ticks are called from the countdown effect and from later timers. `haptics.ts:37` only plays the iPhone tick inside a tap, and the Start tap has already finished before the effect runs, so 3, 2, 1, and GO are silent on the phone. Smallest fix: fire the first tick synchronously in the Start tap, and for 2, 1, and GO use a tick that works from a timer. If iOS cannot do that, say so in the test-now line the same way the music limit was stated.

- MINOR `src/lib/gps/tracker.ts:132`: Stopping can step the clock back by two seconds. A fix may be up to 2 seconds older than the clock (`live.ts:109`) and still be trusted. Auto pause then freezes the time at that older stamp, and `liveClock.ts:69` only hides a one second drop. You stop at a light, 1:40 becomes 1:38, and it stays there until you move. Smallest fix: on the step that starts an auto pause, credit time up to the same `now` the face is using, and hold any leftover drop of one second the way `faceSec` already does.

- MINOR `src/screens/run/LiveRun.tsx:32`: With "GPS lost · time on hold" on screen, the pace number is still the last pace. `readTracker` only clears the current pace when the run is paused or standing, and the live reading keeps it. Smallest fix: while `inGap` is true, show the empty pace (the same "--" the screen uses when pace is null).
