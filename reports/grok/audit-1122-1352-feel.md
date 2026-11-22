STATUS: NEW
Grok Build feel audit, written Nov 22 14:12 at f6201503. A second opinion, not orders: SPEC.md wins.

I'll start with the project rules and the newest audit reports, then check only the iPhone feel issues those reports have not already listed.

The newest reports and SPEC sections 13 and 23 are next, so I only flag feel issues that are not already listed.

The latest feel audits are progress notes. I’ll read the last report that lists real findings, plus SPEC 13 and 23 and the newest Codex notes.

The Nov 17 notes are still the last real findings. I’ll measure the newer run screens and the clip cases those notes never confirmed.

I'll confirm the exact lines for the remaining feel issues, then write the audit from what's already built.

The column math for the set-table header is tight, so I’m measuring the real Inter widths before I call anything a clip.

# Grok feel audit

- MINOR src/screens/workout/SetTable.module.css:40 — On a 320-wide phone at normal text size, the set table header cuts "Last time" to "Last ti…" while a set is being logged. At 130% text that header falls to "La…" and a dumbbell header such as "kg each" falls to "kg …". The weights and reps in the cells still show. Smallest fix: drop `white-space: nowrap` and the ellipsis on `.head > span`, and change the header's fixed `height: 24px` (and the 18px height under 600px tall) to `min-height` so the words can wrap onto a second line.
- MINOR src/ui/DataField.module.css:16 — On a 320-wide phone at 130% text, the Distance label in the run summary's three-up row, and the same row under an interval ring, breaks into "DISTAN" and "CE". Time and Pace stay on one line. The 0.14em tracking makes "DISTANCE" about 96px wide in a column about 82px wide (about 85px on the interval row). Smallest fix: set that label's `letter-spacing` to 0 below 360px so the word stays on one line.
