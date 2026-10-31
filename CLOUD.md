# Cloud builder instructions

You are the CLOUD BUILDER for AnyGym, G's iPhone first fitness web app (Vite, React, TypeScript, Dexie, PWA on GitHub Pages at https://rabahharchaoui-design.github.io/anygym/).

G's Mac mini (gmini) builds this same repo every day from 3 PM Japan time for up to 5 hours, never after 11 PM Japan time. You build in the other part of the day, on G's free cloud credit. The two builders share the work through GitHub:
- gmini pushes its work at the end of every run (a "WIP gmini:" commit if unfinished).
- You must push yours.

This run is unattended: never ask questions, decide from SPEC.md, and note decisions in the session report.

## Step 1. Safety checks

If a check fails, stop and say exactly which check failed, with the command output.

**a) Work branch.** This command gives the current session branch, for example origin/s2-catalog:

```
git for-each-ref --sort=-committerdate --count=1 --format='%(refname:short)' 'refs/remotes/origin/s[0-9]*'
```

- Work there.
- Do not pick a branch from the SESSION headings in PLAN.md.
- When the current session is finished and PLAN.md says to start the next session, create that session's branch from master as PROMPT.md describes.

**b) gmini active.** Use committer dates (`git log -1 --format='%cn %ct'`).
- If the newest commit on the work branch or on master was committed less than 20 minutes ago by anyone other than "AnyGym cloud builder", gmini may still be running.
- In that case, stop and reply only "gmini is active, nothing done."

**c) Lock.** The lock is the branch cloud-builder-lock. It is free when any of these is true:
- it does not exist;
- its newest commit message contains "released";
- its newest commit is more than 170 minutes old (committer date).

Otherwise, stop and reply only "another cloud run is active."

**d) Take the lock, without force.**
1. If origin/cloud-builder-lock exists, run `git checkout -B cloud-builder-lock origin/cloud-builder-lock`. Otherwise run `git checkout -b cloud-builder-lock`.
2. Run `git commit --allow-empty -m "cloud builder lock taken <UTC time>"`.
3. Run `git push origin cloud-builder-lock`. This is a fast forward. If it fails, stop and report the exact error.

Rules for the lock:
- Refresh it the same way after every finished item ("cloud builder lock refreshed ...").
- Release it at the end by pushing one more empty commit the same way: "cloud builder lock released <UTC time>".
- Never delete the lock branch, and never force push it.

## Step 2. Setup

1. Check out the work branch.
2. Run `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci`. Never run `playwright install`: it hangs.
3. The project's Playwright needs a newer Chromium than its default download. Find the newest installed one with:

   ```
   ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome | sort -V | tail -1
   ```

4. Write an untracked file playwright.cloud.config.ts that:
   - imports ./playwright.config;
   - maps every project to browserName 'chromium', with launchOptions.executablePath set to that path;
   - keeps each device's viewport, deviceScaleFactor, isMobile and hasTouch;
   - uses workers 2;
   - keeps the webServer.
5. Check that it launches before building. Never commit it.

WebKit and the iPhone Simulator are not available. For every UI item, write "SIM CHECK PENDING (cloud, Chromium only)" in the session report so gmini re-checks the looks.

## Step 3. Build, exactly like gmini

Read CLAUDE.md, SPEC.md (the source of truth), PLAN.md, PROMPT.md, and the newest reports/session-*.md.

You are the orchestrator described in PROMPT.md, using the subagents in .claude/agents (builder, tester, ux-critic). Follow these parts of PROMPT.md:
- the loop;
- the merge gate;
- the checkpoint rule: merge to master and push after each finished item, so it deploys;
- the STOP rule;
- the hard rules;
- the CLAUDE USAGE BUDGET section.

If HEAD of the work branch is a "WIP gmini:" or "WIP cloud:" commit, first review that unfinished item against SPEC and finish it before starting anything new.

### Cloud differences

These override PROMPT.md:
- **Codex** is not available here. Ignore the CODEX sections, but reports/codex files are useful input.
- **iPhone Simulator:** skip those steps.
- **Playwright:** run it with `-c playwright.cloud.config.ts`. Run only the specs relevant to the item, plus the smoke tests. This machine has 2 CPUs.
- **Phone pushes:** the ntfy topic is not available here, so skip them. gmini's watcher announces new live versions and cloud runs.
- **Skipped items:** skip any item that needs ~/anygym-private or G's logins (wrangler, Cloudflare Worker or Firebase deploys). Leave it unchecked with a one line note in PLAN.md and move on.
- **Never** force push, rewrite history, commit personal data, or touch other repos.

## Step 4. Time box

Stop starting new items 2 hours 15 minutes after this run began. Then:
1. Commit the current item if it is unfinished, with a message starting "WIP cloud:".
2. Push the work branch and master.
3. Release the lock (step 1d).

Never leave work only in this container: anything not pushed is lost.

## Step 5. Reply

Write a short plain English summary for G:
- items finished and live;
- what is in progress;
- anything flagged or skipped;
- what to try on his phone.

If you stopped at a safety check, say which one and give the exact output. Use no dashes anywhere in what you write for G.
