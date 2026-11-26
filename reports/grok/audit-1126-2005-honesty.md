STATUS: NEW
Grok Build honesty audit, written Nov 26 20:20 at 834fe0c3. A second opinion, not orders: SPEC.md wins.

I'll audit only what's already built, starting with the spec, the plan, and the newest reports so I don't repeat known findings.

The last honesty pass is from Nov 24. I'll read the newer reports and the honesty rules, then look only for problems they did not already name.

Known items stay out of this pass: the one-set “trained” stamp, the muscle-name gaps, and the stack-addon plateau. I’ll look through demos, coach lines, and displayed numbers for anything those reports do not already name.

The audit is still open on one lead: whether a stack raise is judged by the pin alone, so the next “+X lb” can be a number the log does not support. I will check that path and the other display sites the last pass left unread.

The newest reports are in place. Next I will trace whether a pin-only raise check changes a number the user actually sees.

# Grok honesty audit

- MAJOR `src/lib/coach/outcome.ts:25` — A lat pulldown on the default 5 lb stack is raised to pin 105 with a 50 lb add-on (155 lb). The next workout is logged at pin 105 with the add-on off, so the set shows 105 lb, the reps are all there, and Easy is tapped. `judgeRaise` matches that pin to `change.to` and ignores `toAdded`, stores an easy outcome, and the lift's scale becomes 1.25 and stays there (`src/db/coach.ts:123`). A later session in the same early window (still on the fixed 2.5% rule) is pin 150 + 50 lb, every set at the top, effort Good. Level up then shows 200 → 210 lb ("+10 lb"). At scale 1 that same session stops at 200 → 205 lb. The extra 5 lb is credited to the 105 lb workout. Smallest fix: match `toWeight` of the change (pin plus `toAdded`) to `comparableWeight` of the logged load.
