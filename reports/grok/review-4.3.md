STATUS: NEW
Grok Build review of PLAN item 4.3, range 08a009e794704b31fb6923d24afab3e33f140cd3..2cfba459a3914e49ee00fc8a1491be771490bc8c, written Nov 17 16:21. A second opinion, not orders: SPEC.md wins.

I'll review PLAN item 4.3 against the spec and only the commits in that range. First I'm reading the project rules and the diff.

The range is the live-run engine, screens, and tests. I'll read SPEC 12 and the new run code next.

# Grok review of PLAN item 4.3

- BLOCKER: `src/screens/settings/SettingsScreen.tsx:143` — Restore is refused only when a workout is open. Hide the live run (the bar is not shown on Settings), then Replace a backup: `restoreReplace` deletes the `runs` row. The in-memory engine is still going. If nothing has changed since the last save, `save()` does not write it back, so `getActiveRun()` is empty and a waiting app update can reload the page. The run is gone (distance, route, and the paused resume). The same hole is `src/db/backup.ts:125`. Smallest fix: treat an active run like an active workout in both gates ("Finish your run first") and ignore a late `saveLiveRun` for a row this restore removed.

- MAJOR: `src/screens/run/LiveRun.tsx:53` — The wake-lock warning and the "could not be saved" warning are one-line toasts. `src/ui/Toast.module.css:58` ellipsizes that line. On a 390-point-wide phone the visible part of "This phone will not keep the screen on by itself. Set Auto-Lock to Never while you run." ends before "Set Auto-Lock", and the toast is gone in 3 seconds. That sentence is the only Auto-Lock instruction, and it is the path when the phone refuses the wake lock. "The run could not be saved. Hold End to try again." is cut the same way. Smallest fix: put both on the wrapping status line and leave them up until the condition clears.

- MAJOR: `src/hooks/runEngine.ts:65` — A failed save only sets `dirty` and retries in silence. `saveFailed` is set only if End itself fails. Fill the phone's storage, run for half an hour, and the screen still looks normal. Kill the app and the resume is the last successful write, often the empty row from Start. Smallest fix: keep a persistent "Not saved on this phone" note after any failed write, and treat `runEngine.get().live` as an active run in `src/pwa.ts` so an update cannot reload over an unsaved run.

- MAJOR: `src/hooks/runWake.ts:29` — The screen lock is stored and never given a `release` listener. iOS drops it while the page stays visible (Low Power Mode, or the system taking the lock). `released` becomes true, `wake` stays `"on"`, and nothing calls `request` again until the app is hidden and shown. The screen sleeps, GPS pauses, and a gap is recorded with no note. Smallest fix: on `release`, if the run still wants the lock and the document is visible, request it again and surface a refusal on the status line.

- MAJOR: `src/screens/run/LiveMap.tsx:32` — Lock swaps the buttons for Hold to unlock and hides Recentre, but the map stays interactive. Lock on the map page, and a pocket touch in the first 10 seconds (or in the 10 seconds after a wake) pans the map. Recentre is not there until you hold to unlock, so the dot is off the route you are looking at. Smallest fix: while `locked`, disable map dragging and put a touch catcher over the map, under the unlock control.

- MAJOR: `src/screens/run/LiveRun.tsx:24` — After the first good fix, a `watchPosition` error sets `gps` to `'unavailable'` and the note stays blank (`'denied'` and `'waiting'` are the only GPS lines). Current pace is the last rolling window (`src/screens/run/LiveStats.tsx:36`) and nothing ages it out, because the screen has no clock. Lose GPS in a tunnel for two minutes while pace is the big number and it keeps reading the old pace, for example 5:12, while distance and moving time are frozen. The watch is not started again until the app is backgrounded. Smallest fix: if GPS is unavailable or the last fix is older than the pace window, show "GPS signal lost", print pace as "--", and call `startWatch()` again after a non-denied error.

- MINOR: `src/screens/run/Live.module.css:274` — Each page dot is a 36 by 48 point target. SPEC 13.3 asks for 48 points. On a moving phone the Numbers and Map dots are easy to miss, and they are the control that does not depend on a sideways swipe. Smallest fix: make `.dotHit` at least 48 by 48 points.
