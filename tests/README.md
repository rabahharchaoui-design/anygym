# How the tests are run

Three speeds. Pick by when you are running them.

## After every PLAN item: the golden suite (about a minute)

    npm run test:golden

The few journeys a person really takes, clicked through the real UI on WebKit with the iPhone 15
profile (`tests/golden/`): a new phone to its first workout, log sets and finish and see it in
History, the Quick workout swipe deck, a hotel gym, the plate math, backup and restore, no signal
with a workout open, and an app update that keeps the data. No retries: a test that fails once is
a real failure or a flaky test, and a flaky test is fixed or cut the same day, never retried into
green. The run journey is a named `test.fixme` until Session 4 builds it.

Also after every item: `npm run test` (Vitest, includes the chained intake to plan to load tests),
`npm run typecheck`, and `npm run perf:bundle` once a build exists.

## Before a checkpoint ships: the budgets

    npm run build && npm run perf:bundle      # the initial JavaScript, gzip, within 10 percent of the baseline
    npm run test:perf                         # cold start, tab switch, set check, finish screen

`npm run perf:bundle` fails when the initial JavaScript grew more than 10 percent over
`scripts/perf-baseline.json`. Growth on purpose is raised with `node scripts/perf-budget.mjs --update`,
and that change to the baseline is committed like any other.

## At merge gates: everything

    npx playwright test                       # every spec, the three iPhones, the matrix subset on the rest
    PW_FULL_MATRIX=1 npx playwright test      # every spec on all seven phones (SPEC 13.3)

The per item `verify-*` and item specs only run here. They are not edited or tagged one by one:
`npm run test:golden` selects `tests/golden/` by path, so the default command still runs
everything. Golden and perf specs are part of the full run too.

## In CI

`.github/workflows/deploy.yml` runs, on every push to master and to a session branch (`s*-*`):
typecheck, Vitest, the build with the secret scan, the bundle budget, the size guard when
`scripts/size-guard.mjs` exists, and `npm run test:golden`. The Pages deploy needs that to pass.
