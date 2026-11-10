# AnyGym repo rules

- SPEC.md is the source of truth. PLAN.md is the work queue. PROMPT.md is the orchestrator's instructions.
- Target: iPhone Home Screen web app on GitHub Pages at /anygym/. Portrait. Test with Playwright WebKit, iPhone 15 Pro profile.
- Work on the session branch, one PLAN item per commit, never commit on master directly, merge only at the merge gate.
- The repo is public. Never commit personal data or anything from ~/anygym-private/.
- No bad data: never show a demo, muscle or number the app is not sure of. Prefer an honest empty state.
- Weight math lives only in src/lib/load.ts and is fully unit tested. UI never does its own arithmetic.
- Commands: `npm run dev`, `npm run build`, `npm run test` (Vitest), `npx playwright test`.
- Code organization (G, Nov 11): screens in src/screens/<area>/, shared UI pieces in src/components/ and src/ui/, saving and loading in src/db/, pure logic in src/lib/. One job per file. Before writing anything new, search for an existing component or helper and reuse it; never write a second copy of a button, card, sheet or helper. New files stay under about 300 lines; any file over 400 lines gets split when you next touch it, without changing behavior. src/MAP.md explains every folder in plain words; update it when you add a folder.
