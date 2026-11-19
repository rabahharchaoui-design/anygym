STATUS: HANDLED fix item 4.6a
Grok Build review of PLAN item 4.4b, range e1ceb10ac155f09ac83e5b3d2578f1e08ca9794c..e71eb768890747975ba43bf2d7e3ee64a666a5a3, written Nov 19 10:57. A second opinion, not orders: SPEC.md wins.

I'll review PLAN item 4.4b from the spec and the builder's diff only, without changing the repo.

The spec and the 4.4b line are in. Next I’ll read only that commit range and the code around it.

The range also includes later commits. I’ll isolate the 4.4b code and read the final behavior against the spec.

The first slice looks coherent. I’ll read the run engine, GPS, and map changes next, where the math and save bugs would show up.

# Grok review of PLAN item 4.4b

- MAJOR `src/lib/gps/tracker.ts:132` A walk in ordinary city GPS is saved as a much shorter run. Auto pause is on by default. At 20 m accuracy (still under the 25 m cutoff) a steady 1 m/s walk for 5 minutes keeps about 300 m but only 55 s of moving time with no noise, and about 62 s across the same wander the new tests use. History and the finish screen keep that time, so the distance and the clock cannot be the same effort. The widened circle in `src/lib/gps/stillness.ts:38` (half the surer accuracy, 10 m at 20 m) treats an 8 m, 8 s walk as standing, and the resume circle is both accuracies added (40 m), so the clock stays frozen for most of the walk. Keep auto pause on the 4 m / 0.5 m/s rule. Use the wider circle only to drop distance that cannot be told from wander.

- MAJOR `src/hooks/runEngine.ts:120` After GPS drops, the live screen can stay on "GPS lost · time on hold" with pace "--" once the signal is back. The 15 s restart ignores every fix whose latitude and longitude match the last dot, not only the one replayed callback. Standing at a light, the phone keeps reporting that same spot, each later restart arms the filter again, and the gap never ends until the runner reaches a different coordinate. Ignore only the first callback after a restart, then accept a newer fix at that same spot.

- MAJOR `src/lib/bodyArt/index.ts:85` A press-only day is described as side-delt work. The shared shoulder shape is now "Front and side delts", and Today uses that string: the recovery line can read "You trained front and side delts yesterday…", and the "Worked lately" screen reader says the same, after bench press alone. A lateral raise still does not get the precise "side delts" on those surfaces. The text under an exercise already uses the precise label. Revert the region title and, for the fresh card, the recovery line, and the muscle sheet, use that exercise's own label ("front delts" or "side delts").

- MINOR `src/screens/run/LiveRun.tsx:203` VoiceOver never hears what the big-number control does. The hint "Shows the next number big" is `aria-hidden`, and a description that points at hidden text is not spoken, so the action is gone. Move that span outside the button, keep the visual clip, and drop `aria-hidden`.
