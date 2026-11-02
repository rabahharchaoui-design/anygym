Codex brief for PLAN item 2.2f, written Nov 01 16:42 at commit 53020ce. SPEC.md wins if they disagree; code may have moved since.

2.2f is a build and deployment guard. It requires no workout UI or storage changes.
The queue entry is [PLAN.md:72](/Users/rabah/projects/anygym/PLAN.md:72). The implementation should follow these six groups.

1) Apply the security requirements below and use them as acceptance checks.

- SPEC 0.6: the public repository must contain no tokens, personal history, or private files.
- SPEC 1: GitHub Actions builds `dist/` and publishes it to GitHub Pages.
- SPEC 18: service credentials and VAPID private keys belong in Cloudflare Worker secrets.
- SPEC 18 explicitly permits public Firebase web configuration; distinguish public configuration from credentials.
- SPEC 24: `NTFY_TOPIC` must never appear as a concrete production value in the repository or client.
- SPEC 24: the browser calls the public Worker; it must not acquire direct D1 credentials.
- SPEC 0.4 and 13.3: preserve offline operation and fail browser tests on unexpected console errors.
- CLAUDE.md requires one PLAN item per commit and prohibits committing private data.
- Acceptance: scan every Git-tracked working-tree file, including documentation, tests, reports, and lockfiles.
- Acceptance: recursively scan every file in the final `dist/`, including hidden files and generated service workers.
- Acceptance: detect API credentials, access tokens, private keys, literal passwords, bearer credentials, ntfy topics, and database URLs.
- Acceptance: any `.map` file or `sourceMappingURL` occurrence anywhere in `dist/` fails.
- Acceptance: findings and scanner errors return nonzero; clean inputs return zero.
- Acceptance: `npm run build` enforces both scans, so the existing deploy workflow cannot upload a failed build.
- Acceptance: a Vitest plants a synthetic credential and proves the CLI rejects it.
- Acceptance: diagnostics identify the file, rule, and position without printing the credential.
- Acceptance: no dependencies are added; Worker secrets remain runtime bindings.

2) Create or change the following files; proposed scanner function names below are new.

- Create [scripts/secret-scan.mjs](/Users/rabah/projects/anygym/scripts/secret-scan.mjs) using Node built-ins only.
- Give it `scanContent()`, `listTrackedFiles()`, `scanTracked()`, `scanDist()`, and `main()`.
- Support `--tracked`, `--dist`, and no flags meaning both; reject unknown arguments.
- Resolve the repository from the invocation directory using Git, so tests can invoke it inside temporary repositories.
- Use `execFile`/`spawn` arguments rather than shell interpolation for Git commands.
- Enumerate tracked paths with `git ls-files --cached -z`; split on NUL, never newline.
- Scan current file contents, including unstaged modifications, rather than only committed blobs.
- Recursively enumerate `dist/` independently of Git; `.gitignore` must not affect this traversal.
- Separate rule matching from traversal so each finding has a stable rule ID.
- Match recognizable provider formats, including GitHub, OpenAI, Cloudflare, AWS, and Slack credentials.
- Match PEM/OpenSSH private-key headers, including RSA, EC, and encrypted private keys.
- Match case-insensitive literal credential assignments in JS/TS, JSON, YAML, dotenv, and URL query forms.
- Match bearer literals, concrete `NTFY_TOPIC` assignments, and concrete ntfy subscription/publish URLs.
- Match database schemes such as PostgreSQL, MySQL, MongoDB, Redis, and credential-bearing connection URLs.
- Treat identifiers, type declarations, environment references, and empty values differently from literal secrets.
- Read files sequentially or with bounded concurrency; do not load the whole repository into memory.
- Inspect bytes in binary files too; do not exempt images, videos, fonts, or files containing NUL.
- Apply map filename and `sourceMappingURL` checks before any content exemptions.
- Print deterministic, sorted findings and a concise scan summary; never print matched source lines.
- Change [package.json](/Users/rabah/projects/anygym/package.json) build to:
  `node scripts/secret-scan.mjs --tracked && tsc --noEmit && vite build && node scripts/secret-scan.mjs --dist`
- This rejects tracked leaks before bundling and examines generated output after Vite/PWA finish.
- Add `"secret-scan": "node scripts/secret-scan.mjs"` for manual verification of an existing build.
- In [vite.config.ts](/Users/rabah/projects/anygym/vite.config.ts), explicitly set `build.sourcemap: false`.
- Also set `VitePWA({ workbox: { sourcemap: false, ... } })`; preserve existing caching configuration.
- In [PROMPT.md:86](/Users/rabah/projects/anygym/PROMPT.md:86), add the requested HARD RULES.
- Use: “Never put secrets in client code, VITE_* variables, public assets, or committed files.”
- Follow with: “Anything requiring a secret goes behind the Worker; credentials use Cloudflare secrets.”
- Briefly document scanner usage and sanitized failure output in [README.md](/Users/rabah/projects/anygym/README.md).
- The existing [.github/workflows/deploy.yml](/Users/rabah/projects/anygym/.github/workflows/deploy.yml) already calls `npm run build` before artifact upload.
- Preserve that ordering; a separate scanner workflow would not replace enforcement inside build.

3) Keep application data and Dexie unchanged.

- [src/db/schema.ts](/Users/rabah/projects/anygym/src/db/schema.ts) currently registers versions 1–9 in `AnyGymDB`.
- Add no version, table, migration, backup field, preference, or stored scan result.
- Keep `Env.NTFY_TOPIC` and `Env.IP_SALT` in [workers/anygym-api/src/env.ts](/Users/rabah/projects/anygym/workers/anygym-api/src/env.ts).
- Keep `sendPush()` in [workers/anygym-api/src/push.ts](/Users/rabah/projects/anygym/workers/anygym-api/src/push.ts) reading the topic from `env.NTFY_TOPIC`.
- `wrangler.jsonc` contains public D1 binding metadata, not a database connection secret; preserve it.
- Do not read local secret files, query Cloudflare, rotate credentials, or change Worker deployment.

4) Handle these edge cases explicitly.

- The scanner will encounter existing synthetic secrets; resolve each initial finding individually.
- Worker `api.test.ts` deliberately contains `NTFY_TOPIC: 'test-topic'` and its expected ntfy URL.
- Reporting `privacy.test.ts` contains synthetic `token=hunter2` values used to prove redaction.
- Reporting `diagnostics.test.ts` also contains synthetic token/key material.
- Prefer runtime construction of new synthetic credentials so the new tests do not flag themselves.
- If retaining existing literals, use exact path + rule + matched-value hash exemptions with written reasons.
- Never exempt whole test files, report directories, or all occurrences of a placeholder.
- Permit no secret exemptions in `dist/`; a synthetic value shipped to the browser is still a failure.
- Do not mistake deletion tokens in `deleteSetToken()`, `undoDelete()`, and `newId()` for credentials.
- Do not mistake CSS design tokens, Git hashes, integrity hashes, or UUIDs for access tokens.
- `DEFAULT_API_BASE`/`API_BASE` in `src/lib/reporting/config.ts` identify the public Worker endpoint.
- `createTransport()` uses `credentials: 'omit'`; preserve the existing credential-free reporting flow.
- Allow `env.NTFY_TOPIC`, `${encodeURIComponent(topic)}`, and documentation naming the secret binding.
- Reject concrete ntfy topics, including short values; entropy thresholds alone are insufficient.
- Check inline data-URL maps and hidden maps without a mapping comment, as well as ordinary JS/CSS maps.
- Fail closed on Git errors, unreadable tracked files, missing `dist/`, or unsupported escaping symlinks.
- Handle filenames containing spaces/newlines safely and avoid following directory symlinks into private locations.
- Keep regexes bounded; inspect minified one-line bundles without pathological backtracking.
- State the limit honestly: pattern scanning cannot recognize every arbitrary password or encoded secret.
- It also cannot interpret secrets visible only inside image pixels; byte scanning is not OCR.

5) Write focused Vitest coverage and run existing browser regressions on both requested phones.

- Create [src/lib/__tests__/secret-scan-2.2f.test.ts](/Users/rabah/projects/anygym/src/lib/__tests__/secret-scan-2.2f.test.ts).
- The existing `vitest.config.ts` includes this path and uses Node; no config expansion is needed.
- Invoke the `.mjs` CLI with `process.execPath` and an absolute script path.
- Create isolated temporary Git repositories and `dist/` folders; clean them in `afterEach`.
- Generate fake credentials from string fragments at runtime; never use a real credential.
- Test each detection family independently: the child exits nonzero and reports the correct rule/path.
- Test the planted-key requirement in a tracked, extensionless file outside `src/`.
- Test a tracked file modified after `git add`: the current working-tree leak is detected.
- Test generated-only files: a credential in ignored `dist/assets/...js` is detected.
- Test binary coverage: a recognizable ASCII credential surrounded by NUL bytes is detected.
- Test `.map` at nested paths, CSS/JS mapping comments, and inline mapping directives.
- Test that every map check fails even when no credential rule matches.
- Test legitimate environment references, public Worker URLs, D1 IDs, UUIDs, and integrity hashes pass.
- Test exact fixture exemptions and prove changing the value or path makes the finding fail.
- Assert stdout/stderr never contain the planted credential, including on error paths.
- Test missing Git metadata, missing output, unreadable inputs where supported, and unknown flags fail.
- Test a filename with spaces/newlines without splitting it into separate paths.
- Add a small build-chain integration fixture with stub `tsc`/`vite` commands.
- Assert a tracked leak prevents Vite running; assert a Vite-emitted leak fails the completed build command.
- For Playwright, reuse `tests/smoke.spec.ts` and `tests/network-guard.spec.ts`; this item adds no UI.
- Run: `npx playwright test tests/smoke.spec.ts tests/network-guard.spec.ts --project="iPhone SE" --project="iPhone 17 Pro Max"`.
- These are existing WebKit projects: SE is 375×667; Pro Max is 440×956.
- Assert the scanned build loads, tabs/settings navigate, and the existing console-error trap stays clean.
- Assert reporting remains mocked before and after service-worker control, without external network access.
- Run one normal `npm run build`, the focused Vitest file, and the existing Vitest suite before completion.

6) Account for these conflicts and practical risks.

- The working tree already has changes to PLAN.md and numerous screenshots; preserve them.
- The tracked repository contains 4,538 files totaling about 900 MiB, mostly media.
- Measure scan duration; the extra work also affects Playwright because its server normally runs the build.
- Do not copy `no-personal-names.test.ts` traversal: it deliberately skips tests and binary files.
- The existing `dist/` currently has no `.map` files or `sourceMappingURL` bytes; that is only a baseline.
- Workbox output must be checked after generation; scanning only Vite asset chunks leaves a gap.
- PLAN 2.2d/2.2e may concurrently change package scripts or Vite configuration; preserve their changes.
- SPEC 18 permits public Firebase config; review that distinction when accounts arrive rather than allow all API keys.
- Git enumeration covers tracked files, while the output scan catches bundled/copied untracked inputs.
- Neither scan cleans repository history; this item does not authorize rewriting it.
- No files were edited and no builds or tests were run for this brief.