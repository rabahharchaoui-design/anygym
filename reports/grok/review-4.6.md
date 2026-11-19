STATUS: NEW
Grok Build review of PLAN item 4.6, range e15e1158185a4b06bf93c81d7dc0a4425d7069e8..e1ceb10ac155f09ac83e5b3d2578f1e08ca9794c, written Nov 19 10:37. A second opinion, not orders: SPEC.md wins.

I'll review PLAN item 4.6 against the spec and only the commits in that range. First I'll read the project rules and the diff.

The range is the finish screen, share card, GPX, and history. I'll read the spec for those and the changed source next.

# Grok review of PLAN item 4.6

- MAJOR `src/screens/history/RunDetail.tsx:42` — A kept run under 50 m that still has GPS points is described as “the phone had no GPS for it.” Example: a 40 m run with a real track, kept from the finish screen (that screen correctly says “Too short to measure” / “Under 50 m was recorded”), then opened from History. The detail tells the user the phone never found a position. Smallest fix: branch on `runVerdict` and use `VERDICT_WORDS` (`too-short` vs `no-gps`).

- MAJOR `src/screens/HistoryScreen.tsx:26` — A failed runs read is treated as an empty run list. `useFinishedRuns` sets `ready` and `error` and leaves `data` empty; `runsRead.data?.runs ?? []` becomes `[]`, and the only `LoadError` is for workouts (`list.retry` does not restart the runs query). Example: workouts load and the runs query hits a Dexie error (live queries stop after one failure). History shows the workouts, no run rows, no “Run records and heatmap” link, and no Try again, so saved runs look deleted. If there are no workouts either, the screen says “No workouts yet.” The same miss on the finish screen: `src/screens/run/RunFacts.tsx:28` returns nothing while the runs query has not succeeded, so a failed read drops the PR badges and the ghost line with no error. Smallest fix: if `runsRead.error`, show “Could not load runs” and call `runsRead.retry`; do not use the empty state or hide runs in that case. On the finish screen, show that same error instead of rendering nothing.

- MINOR `src/lib/run/records.ts:80` — The “faster” line rounds the raw gap, while every clock on screen floors. Example: previous best 300.8 s (shown 5:00) and this run 299.2 s (shown 4:59). The card says “2 s faster” even though the two floored times differ by 1 second. Smallest fix: set the plus from `Math.floor(prev) - Math.floor(mine)` and skip the line when that is under 1.

- MINOR `src/screens/run/RunShare.tsx:67` — The share sheet is modal (the page behind it is inert) and the preview is a canvas whose accessible name is only “Share card preview.” VoiceOver never hears the distance, time, pace, city, or “Start and end hidden.” Smallest fix: set `aria-label` from those `poster` fields.

- MINOR `src/lib/run/gpx.ts:13` — Every run on the same local day exports as the same file name (`AnyGym-run-YYYY-MM-DD.gpx`). Example: export a morning run and an evening run and save both into Files; the second save replaces the first. Smallest fix: put the start time in the name as well.

- MINOR `src/db/runs.ts:54` — History loads every finished run in full, including every GPS point, and keeps those arrays for the whole visit. The list only needs the verdict (`points.length`), distance, and time. Example: a few months of runs (a point every couple of seconds) makes opening History parse and hold tens of megabytes on the main thread, which is enough to hitch or jetsam a small iPhone. Smallest fix: for the list, copy off `points.length` and drop `points` and `gaps` before the screen holds the rows; load one run with `getRun` on the detail screen.
