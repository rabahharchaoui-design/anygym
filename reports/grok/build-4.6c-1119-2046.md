STATUS: HANDLED discarded: its build failed and ours is merged; its label by label recovery match is ported in 4.6d
# Grok backup build of PLAN item 4.6c
Branch: grok-build-4.6c-1119-2046 (based on s4-run, in the main repo). Review it like any builder output, then: git merge --no-ff --no-edit grok-build-4.6c-1119-2046
Changes:  10 files changed, 435 insertions(+), 23 deletions(-)
Vitest (whole suite in Grok's copy): could not run
Build: build FAILED

## Grok notes
I'll build PLAN item 4.6c from the spec and the brief. First I'm reading the project rules and the item itself so the implementation matches them.

The item is six fixes: live-run update safety, per-file photo and voice hashes, recovery muscle names, the dashed-route caption, and cache quota purging. Next I’ll read the code those touch.

The six fixes are mostly in place. I’m closing the remaining honesty gap: recovery must match each exercise’s own muscle names, including when one drawing stands for more than one muscle. Then I’ll lock that in with tests.

The recovery-words test still cannot save its plan. I will compare that fixture with a plan that saves, then finish the remaining 4.6c checks.

The plan id must start with `mine-` or the app refuses it. I will confirm the muscle names, then fix that fixture.
