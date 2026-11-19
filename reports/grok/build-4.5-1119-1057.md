STATUS: HANDLED discarded: its build failed and the Opus build-4.5 covers every SPEC 12.5 and 12.6 rule
# Grok backup build of PLAN item 4.5
Branch: grok-build-4.5-1119-1057 (based on s4-run, in the main repo). Review it like any builder output, then: git merge --no-ff --no-edit grok-build-4.5-1119-1057
Changes:  34 files changed, 1666 insertions(+), 49 deletions(-)
Vitest (whole suite in Grok's copy): [31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 3 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m
Build: build FAILED

## Grok notes
I'll build PLAN item 4.5 from the spec and the brief. First I'm reading the project rules and the item itself so the implementation matches them.

Item 4.5 is Out and back plus a ghost race. The moving clock from 4.4a is already in place, so I’ll add the pure helpers first, then wire them through the live run.

Pure turnaround and ghost logic is already in place. Next I’ll wire the live engine, screens, and tests, then run the suite and the build.

The pure modules are on disk. I’ll read the engine, screens, and tests next so the wiring matches the existing patterns.

The engine still treats only interval runs as ticking, and the screens do not offer a ghost or a turnaround yet. I’ll wire those next, then add the tests.

The ghost was sticking to the back edge of the corridor, so a runner 30 m ahead never moved the match. I’ll match the closest forward point, and correct the turnaround cases the tests exposed.
