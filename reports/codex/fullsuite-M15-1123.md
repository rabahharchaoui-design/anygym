STATUS: HANDLED FAIL recorded; baseline failures are item FS1
# Full suite on Codex's M15 build (codex-build-M15-1122-2323 at 824e9740), run by Claude's chat session Nov 23
Do not merge until these are fixed and a new full suite run says RESULT: PASS (PROMPT.md, CODEX AND GROK BUILDS NEED A FULL SUITE PASS).

Vitest: Test Files  397 passed | 1 skipped (398);Tests  5239 passed | 97 expected fail | 2 skipped (5338);
Playwright: 5874 tests: 174 failed, 434 skipped, 5266 passed (1.1h) (67 min)
Rerun of the 174 failed: 9 passed on a second try (flaky), 165 fail again
Of the 165: 136 fail the same way before this change (codex-build-M15-1122-2323^ at 19842b77), 29 are NEW
RESULT: FAIL (29 new Playwright failures)

## The 29 new failures (fail twice on the branch, pass on the commit before it)
  320 floor|tests/foundation-2.2e.spec.ts:154|components (#/dev/ui) › ChoiceCard: icon, label, ring that fills; lime border when picked; BottomCTA grey until valid @matrix
  320 floor|tests/picture-2.0d.spec.ts:541|2.0d critic r3: 320 x 568 sheets fit @matrix › horn (question open and answered), Smith question, barbell: the sheet body never scrolls
  320 floor|tests/verify-2.0d-final.spec.ts:29|2.0d final verify @matrix › 1+2+5+6: horn, Smith, barbell sheets fit; horn total + start; chips label; bar link name
  320 floor|tests/verify-3.7a.spec.ts:164|3.7a (5) the plate buttons stay above Done with a question card @matrix › sides question: every plate button and the title in view, nothing under Done; 130% text scrolls to each
  Galaxy compact|tests/foundation-2.2e.spec.ts:154|components (#/dev/ui) › ChoiceCard: icon, label, ring that fills; lime border when picked; BottomCTA grey until valid @matrix
  Pixel 7|tests/foundation-2.2e.spec.ts:154|components (#/dev/ui) › ChoiceCard: icon, label, ring that fills; lime border when picked; BottomCTA grey until valid @matrix
  Pixel 7|tests/motion-3.5w.spec.ts:516|round 2: past the intake › B2 closing a sheet: the app behind comes forward over about 200 ms, never in one frame @matrix
  Small Android|tests/foundation-2.2e.spec.ts:154|components (#/dev/ui) › ChoiceCard: icon, label, ring that fills; lime border when picked; BottomCTA grey until valid @matrix
  Small Android|tests/monolith-m15.spec.ts:4|gym sheet rows and Undo are flat and still switch gyms @matrix
  Small Android|tests/review-3.5i.spec.ts:66|grid is the default: 9 moving tiles, tap wrong and clear, hold for Fix, Approve saves the screen and brings the next 9 @matrix
  Small Android|tests/verify-3.7a.spec.ts:164|3.7a (5) the plate buttons stay above Done with a question card @matrix › sides question: every plate button and the title in view, nothing under Done; 130% text scrolls to each
  iPhone 15|tests/codex-se-offline-first-timer.spec.ts:25|offline SE: first-timer number survives reload and its source set survives edit, delete Undo and Finish
  iPhone 15|tests/codex-se-offline-pin-addon.spec.ts:25|offline SE: fractional pin add-on survives edit, Delete Undo, Finish and reload with exposed lifting controls
  iPhone 15|tests/foundation-2.2e.spec.ts:154|components (#/dev/ui) › ChoiceCard: icon, label, ring that fills; lime border when picked; BottomCTA grey until valid @matrix
  iPhone 15|tests/verify-1.7c.spec.ts:485|G. tap targets are at least 48pt
  iPhone 15|tests/verify-2.0d-final.spec.ts:29|2.0d final verify @matrix › 1+2+5+6: horn, Smith, barbell sheets fit; horn total + start; chips label; bar link name
  iPhone 15|tests/verify-3.7a.spec.ts:164|3.7a (5) the plate buttons stay above Done with a question card @matrix › sides question: every plate button and the title in view, nothing under Done; 130% text scrolls to each
  iPhone 15|tests/verify-3.7a.spec.ts:164|3.7a (5) the plate buttons stay above Done with a question card @matrix › start question: every plate button and the title in view, nothing under Done; 130% text scrolls to each
  iPhone 17 Pro Max|tests/codex-se-offline-first-timer.spec.ts:25|offline SE: first-timer number survives reload and its source set survives edit, delete Undo and Finish
  iPhone 17 Pro Max|tests/codex-se-offline-pin-addon.spec.ts:25|offline SE: fractional pin add-on survives edit, Delete Undo, Finish and reload with exposed lifting controls
  iPhone 17 Pro Max|tests/foundation-2.2e.spec.ts:154|components (#/dev/ui) › ChoiceCard: icon, label, ring that fills; lime border when picked; BottomCTA grey until valid @matrix
  iPhone 17 Pro Max|tests/foundation-2.2e.spec.ts:212|components (#/dev/ui) › PRBadge springs in on a row without moving it; AppMarkLoader draws the mark after 400 ms @matrix
  iPhone 17 Pro Max|tests/verify-1.1.spec.ts:4|1.1 verify: network, shots, break
  iPhone 17 Pro Max|tests/verify-1.7c.spec.ts:485|G. tap targets are at least 48pt
  iPhone SE|tests/codex-se-offline-first-timer.spec.ts:25|offline SE: first-timer number survives reload and its source set survives edit, delete Undo and Finish
  iPhone SE|tests/foundation-2.2e.spec.ts:154|components (#/dev/ui) › ChoiceCard: icon, label, ring that fills; lime border when picked; BottomCTA grey until valid @matrix
  iPhone SE|tests/verify-1.7c.spec.ts:485|G. tap targets are at least 48pt
  iPhone SE|tests/verify-2.0d-final.spec.ts:29|2.0d final verify @matrix › 1+2+5+6: horn, Smith, barbell sheets fit; horn total + start; chips label; bar link name
  iPhone SE|tests/verify-3.7a.spec.ts:164|3.7a (5) the plate buttons stay above Done with a question card @matrix › sides question: every plate button and the title in view, nothing under Done; 130% text scrolls to each

## What they show (read from the failure output)
- Sheets got taller: plate buttons end 6 to 11 px under Done (verify-3.7a), the Smith and horn sheets scroll when they must not (verify-2.0d-final, picture-2.0d), More reps in the Edit set sheet is 95% on screen (codex-se-offline-*).
- A 22 px tall tap target: rest-time-controls#2 343x22 (verify-1.7c, 48 pt rule).
- A picked ChoiceCard border is white, not the ice blue --accent token (foundation-2.2e:154); PRBadge test also fails (foundation-2.2e:212).
- Small Android: the gym pill is not found after adding a gym, so M15's own test fails there (monolith-m15:4).
- Logs: .loop-tools/verify/codex-build-M15-1122-2323.txt.pw2 (rerun) and .pwb (before the change).
- Flaky, not M15's fault: review-3.5i.spec.ts:66 (Small Android) fails about 1 run in 5 before the change too (recheck Nov 23 4:58 AM).
