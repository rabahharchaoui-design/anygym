STATUS: NEW
Grok Build review of PLAN item 4.6c, range 473baf35dcb481d0a3c68a17734410df1ac92e68..55ac5e0a9658c632f3a425d7464f6c73fcb06764, written Nov 21 00:34. A second opinion, not orders: SPEC.md wins.

I'll review PLAN item 4.6c from the spec and the diff only, without changing the repo.

The range mixes other session work with 4.6c. I'll read the six 4.6c commits and the code they left behind.

# Grok review of PLAN item 4.6c

- MINOR src/lib/run/summary.ts:28 — On the finish screen and in History, a dashed gap tells the user “The distance across a GPS gap counts in the total but not in the average pace.” That is false whenever the gap is longer than 5 minutes, faster than 8 m/s, or ends back on the same spot: the line is still dashed, and those metres are not added (`src/lib/gps/filter.ts:51`, `src/lib/gps/tracker.ts:140`). A 6 minute tunnel that comes out 400 m away shows the dash and the caption, and the 400 m is not in the distance. The same sentence also leaves a short bridged gap looking inconsistent: run 100 s, lose GPS for 40 s (120 m bridged), run 100 s more, and the screen shows about 0.72 km, 3:35, and 5:33/km. Taking the gap metres out of the distance and dividing by 3:35 gives about 5:58/km, because the first 15 s are in the clock and left out of the pace (`rowPace` subtracts `heldSec`). Smallest fix: one caption that matches the rule (a gap of up to 5 minutes at 8 m/s or less adds its straight line to the total and leaves that distance, and those 15 s, out of the pace; any other gap adds no distance), and change the assertion in `src/lib/run/__tests__/fixes-4.4c.test.ts` that locks the current wording.
