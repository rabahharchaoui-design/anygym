STATUS: HANDLED fix item 4.6b (1 major, 1 minor, both real)
Grok Build review of PLAN item 4.6a, range e71eb768890747975ba43bf2d7e3ee64a666a5a3..473baf35dcb481d0a3c68a17734410df1ac92e68, written Nov 19 16:16. A second opinion, not orders: SPEC.md wins.

I'll review PLAN item 4.6a against the spec and only the commits in that range. First I'm reading the project rules and the diff.

The range mixes 4.6a with other work. I'll read only the 4.6a code diffs and the spec rules those fixes have to meet.

# Grok review of PLAN item 4.6a

- MAJOR: `src/lib/gps/tracker.ts:150`. A slow walk at poor accuracy keeps the clock running but withholds the metres until you leave a wide resume circle (about 40 m at 20 m accuracy). That withheld stretch is never added if the walk ends, you pause, or GPS drops, so the saved distance and the time disagree. A straight 1 m/s walk with 20 m fixes, held to End at 45 s, saves about 8 m and 45 s. The same walk to 120 m with a 20 s GPS hole at the 25 s mark saves 65 m, shows a pace near 0.66 m/s, and draws a 37 s dashed gap that starts when the freeze began. Pause at 30 s, then Resume and walk on to 80 m, saves 57 m, and the pause line starts about 22 s before the tap. Smallest fix: while `still` is set and the clock is not stopped, commit the straight line from `lastRecorded` to `lastGood` as timed distance before End, pause, or resume, and on a gap bridge that line unless the clock is actually stopped. Do not treat "still on the spot" as wander unless `clockStopped` is true.

- MINOR: `src/lib/run/gpx.ts:15`. Two runs that start in the same minute still export as the same file, `AnyGym-run-YYYY-MM-DD-HHmm.gpx`. Start one at 7:05, end it, start another at 7:05, and saving both GPX files into Files replaces the first. Smallest fix: put seconds in the name, or the run id.
