STATUS: HANDLED FAIL recorded; baseline failures are item FS1
# Full suite on Codex's M6 build (codex-build-M6-1122-2146 at 2177f4c7), run by Claude's chat session Nov 23
Do not merge until these are fixed and a new full suite run says RESULT: PASS (PROMPT.md, CODEX AND GROK BUILDS NEED A FULL SUITE PASS).

Vitest: Test Files  397 passed | 1 skipped (398);Tests  5237 passed | 97 expected fail | 2 skipped (5336);
Playwright: 5872 tests: 161 failed, 439 skipped, 5272 passed (1.1h) (66 min)
Rerun of the 161 failed: 5 passed on a second try (flaky), 156 fail again
Of the 156: 133 fail the same way before this change (codex-build-M6-1122-2146^ at f6201503), 23 are NEW
RESULT: FAIL (23 new Playwright failures)

## The 23 new failures (fail twice on the branch, pass on the commit before it)
  320 floor|tests/smoke.spec.ts:4|app shell › loads, shows 5 tabs, each tab opens its screen, no console errors @matrix
  Galaxy compact|tests/smoke.spec.ts:4|app shell › loads, shows 5 tabs, each tab opens its screen, no console errors @matrix
  Pixel 7|tests/smoke.spec.ts:4|app shell › loads, shows 5 tabs, each tab opens its screen, no console errors @matrix
  Small Android|tests/smoke.spec.ts:4|app shell › loads, shows 5 tabs, each tab opens its screen, no console errors @matrix
  iPhone 15|tests/art-3.6h.spec.ts:291|3.6h empty states › history: the scene arrives in room that was already kept, nothing moves
  iPhone 15|tests/fullscreen-1.10b.spec.ts:48|Plans: tab bar reaches the bottom edge, header sits at the safe area
  iPhone 15|tests/monkey.spec.ts:52|monkey: 90 s of random taps and swipes on Plans
  iPhone 15|tests/monkey.spec.ts:52|monkey: 90 s of random taps and swipes on plan viewer
  iPhone 15|tests/smoke.spec.ts:4|app shell › loads, shows 5 tabs, each tab opens its screen, no console errors @matrix
  iPhone 15|tests/verify-4.2.spec.ts:355|4.2 run start screen › only the Run tab asks the tile host, and MapLibre loads only there
  iPhone 17 Pro Max|tests/art-3.6h.spec.ts:291|3.6h empty states › history: the scene arrives in room that was already kept, nothing moves
  iPhone 17 Pro Max|tests/fullscreen-1.10b.spec.ts:48|Plans: tab bar reaches the bottom edge, header sits at the safe area
  iPhone 17 Pro Max|tests/monkey.spec.ts:52|monkey: 90 s of random taps and swipes on Plans
  iPhone 17 Pro Max|tests/monkey.spec.ts:52|monkey: 90 s of random taps and swipes on plan viewer
  iPhone 17 Pro Max|tests/smoke.spec.ts:4|app shell › loads, shows 5 tabs, each tab opens its screen, no console errors @matrix
  iPhone 17 Pro Max|tests/verify-4.2.spec.ts:355|4.2 run start screen › only the Run tab asks the tile host, and MapLibre loads only there
  iPhone SE|tests/art-3.6h.spec.ts:291|3.6h empty states › history: the scene arrives in room that was already kept, nothing moves
  iPhone SE|tests/fullscreen-1.10b.spec.ts:48|Plans: tab bar reaches the bottom edge, header sits at the safe area
  iPhone SE|tests/monkey.spec.ts:52|monkey: 90 s of random taps and swipes on Plans
  iPhone SE|tests/monkey.spec.ts:52|monkey: 90 s of random taps and swipes on plan viewer
  iPhone SE|tests/monolith-m6.spec.ts:63|plans and empty history fit the 320 px floor at larger text
  iPhone SE|tests/smoke.spec.ts:4|app shell › loads, shows 5 tabs, each tab opens its screen, no console errors @matrix
  iPhone SE|tests/verify-4.2.spec.ts:355|4.2 run start screen › only the Run tab asks the tile host, and MapLibre loads only there

## What they show (read from the failure output and the diff)
- 19 of 23: the Plans tab title changed from "Plans" to "Plan" (PlansScreen.tsx, TopBar giant, matching board 10). smoke, monkey, fullscreen-1.10b and verify-4.2 still wait for a level 1 heading "Plans" and time out. Decide the title against SPEC and the board, then update those tests in the same change (CLAUDE.md: never leave the suite red).
- Real layout bug, M6's own test: monolith-m6.spec.ts:63 on iPhone SE at 320 px and larger text, plan cards are cut off by <main> (tops at y -10 to -27) and one reaches under the status bar.
- 3 art-3.6h failures: the History empty state no longer shows the art scene slot. Check whether the board drops the art there; if yes update the test, if not restore it.
- Logs: .loop-tools/verify/codex-build-M6-1122-2146.txt.pw2 (rerun) and .pwb (before the change).
