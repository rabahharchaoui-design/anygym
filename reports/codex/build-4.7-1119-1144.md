STATUS: HANDLED head start: cityLookup.ts and its test are taken at 4.7 (PLAN note)
# Codex backup build of PLAN item 4.7
Branch: codex-build-4.7-1119-1144 (based on s4-run). Review like any builder output, then merge with: git merge --no-ff --no-edit codex-build-4.7-1119-1144
Changes:  5 files changed, 54 insertions(+)
Vitest (whole suite in Codex's copy): could not run
Build: build passed
Playwright (whole suite, port 4176, all iPhone profiles): could not run (see /Users/rabah/.config/anygym/codex-pw.txt)

## Codex notes
**PLAN item 4.7 is not complete.** I added a tested nearest-city helper, but it is not connected to the app.

Files added:

- [cityLookup.ts](/Users/rabah/projects/anygym-codex-build/src/lib/run/cityLookup.ts) — finds the nearest supplied city within 30 km and rejects invalid coordinates.
- [cityLookup.test.ts](/Users/rabah/projects/anygym-codex-build/src/lib/run/__tests__/cityLookup.test.ts) — covers the distance boundary, invalid data and date-line crossings.

`npx vitest run` passed: 4,948 passed, five expected failures and one skipped. `npm run build` passed. I did not run Playwright or commit.

The GeoNames dataset and the specified `.design-ref/pluto/2/` stamp artwork are absent from this checkout; the attempt to download the city dataset failed because the host could not be resolved. The passport screen, city lookup integration, identity and stamp flows, share image, About credit and Playwright specs remain unfinished.