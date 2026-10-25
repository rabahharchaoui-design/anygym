# AnyGym

Your training keeps working in any gym. AnyGym is an iPhone-first web app that builds a session for the gym you are in and the time you have, shows how to do each move, and tells you what to beat from last time. It works offline and keeps all your data on your phone. Live at https://rabahharchaoui-design.github.io/anygym/.

## Add to Home Screen (iPhone)

1. Open the link above in Safari.
2. Tap the Share button.
3. Tap **Add to Home Screen**, then **Add**.
4. Open AnyGym from your Home Screen. It works offline after the first load.

## Develop

`npm run dev` · `npm run build` · `npm run test` · `npm run test:ui` · `npm run typecheck`

`npm run test:live` checks the live site.

## Tests

`npx playwright test` runs the UI tests on the phone matrix (SPEC 13.4):

| Project | Browser | Viewport | Runs |
| --- | --- | --- | --- |
| iPhone SE | WebKit | 375 × 667 | every spec |
| iPhone 15 | WebKit | 393 × 852 screen | every spec |
| iPhone 17 Pro Max | WebKit | 440 × 956 screen | every spec |
| Pixel 7 | Chromium | 412 × 915 screen | `@matrix` |
| Galaxy compact | Chromium | 360 × 780 | `@matrix` |
| Small Android | Chromium | 360 × 640 | `@matrix` |
| 320 floor | WebKit | 320 × 568 | `@matrix` |

The Android projects and the 320 floor run the curated subset: tests with `@matrix` in their title
(logging, picker, sheets, History, plan flows, edge cases, double taps, and the layout checks of
every main screen in `tests/matrix.spec.ts`). Tag a test `@matrix` to add it there. Run one project
with `npx playwright test --project="Pixel 7"`.

`PW_FULL_MATRIX=1 npx playwright test` runs every spec on all seven phones (SPEC 13.3), about
5 minutes per Android or 320 project on top of the default run. Functional specs have no
profile or platform skips; the only skips left are report screenshot and video specs (opt in with
their env flags) and the private history import (only when the private file exists).

Harness (`tests/fixtures.ts`, `tests/helpers/`):
- every test fails on any console error, uncaught error, unhandled rejection or failed request,
  from any page of any context it makes (proved by `tests/harness.spec.ts`). The only exemptions
  are `allowConsoleErrors()` for errors a test provokes on purpose, and requests the network
  guard aborted or that failed while the test set the context offline (by exact URL);
- `helpers/layout.ts`: the phone's safe areas, no horizontal scroll, every control's full box
  inside the safe area (scrolled into view first), never cut off or covered;
- `helpers/monkey.ts`: 90 s of seeded random taps and swipes per main screen (`MONKEY_MS` to change),
  never reloading: it returns home and proves the app responds through the app's own controls;
- `helpers/history-fixture.ts`: two years of generated history (about 300 workouts, 4000 sets);
- `helpers/kill.ts`: SIGKILL the browser on a persistent profile and relaunch it offline;
- `helpers/idb.ts`: hold an IndexedDB write open, or delay the reads after one, for race tests.
