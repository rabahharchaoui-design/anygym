STATUS: HANDLED Nov 28: the Finish stat clip is fixed by M18b; the toggle labels are R6 (6) (triage /tmp/grok-triage-17.md)
Grok Build feel audit, written Nov 28 00:29 at fa41287f. A second opinion, not orders: SPEC.md wins.

I'll audit the built iPhone feel against SPEC 13 and 23, starting with the spec, plan, and the newest Codex and Grok reports so I don't repeat what's already listed.

The latest feel report is from Nov 27. I'll read SPEC 13 and 23 plus those reports, then look only for problems they don't already list.

Known feel notes stop at the set-table header, Distance label, goal chips, plan strip, and page dots. I'll measure the current screens for new tap, clip, safe-area, and motion problems.

I'll finish the remaining feel checks on the finish bar, live scroll, height toggle, and reduced motion, then report only new findings.

# Grok feel audit

- MINOR src/screens/workout/Finish.module.css:91 — On a 320-wide phone at 130% text, a 100-minute workout with a five-digit total (Time "120 min", Sets "18", "58,320 lb") puts that total in a column about 118px wide while the number needs about 132px. The unit is cut, so the stat reads "58,320 l". Any total from 10,000 lb up does the same once Time reaches "100 min". Smallest fix: under 360px, stack the three stats, or drop `nowrap` and the ellipsis on `.value` so the unit wraps under the digits.
- MINOR src/ui/SlidingToggle.module.css:50 — On a 320-wide phone at 130% text, the height step's "Feet and inches" (src/screens/intake/AboutSteps.tsx:131) is about 11px wider than its half of the row at regular weight and about 13px wider when bold, so the words paint over "Centimeters". The same `nowrap` puts "Never (12)" about 7px into the next option on the exercise deck when that option is bold. Smallest fix: let a full-width toggle's label wrap onto a second line.
