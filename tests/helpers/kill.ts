// Kill and restore helpers (SPEC 13.3: "app killed mid workout: state restores exactly where it
// was"; codex bughunt 0800 #6). A reload lets unload handlers run; these do not:
//   launchPersistent(profileDir)  a browser with an on disk profile (IndexedDB, localStorage, the
//                                 service worker cache survive like on a phone),
//   killHard(context)             SIGKILL to every process of that browser: no pagehide, no
//                                 unload, no graceful close, like iOS ending the app,
//   relaunchOffline(profileDir)   the same profile again with the network off.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, webkit, type BrowserContext, type TestInfo } from '@playwright/test';
import { guardContext, markOffline } from '../fixtures';

export type Persistent = { context: BrowserContext; profileDir: string };

/** A fresh, empty profile folder in the temp dir. */
export const newProfileDir = () => mkdtempSync(join(tmpdir(), 'anygym-kill-'));
export const removeProfileDir = (dir: string) => rmSync(dir, { recursive: true, force: true });

/** The project's device (viewport, touch, user agent) and browser, for a persistent launch. */
function projectLaunch(info: TestInfo) {
  const use = info.project.use as Record<string, unknown>;
  const { defaultBrowserType: _d, browserName, baseURL, trace: _t, ...device } = use as Record<string, unknown> & { browserName?: string; baseURL?: string };
  return { type: browserName === 'chromium' ? chromium : webkit, device, baseURL: baseURL as string };
}

/** Launches the project's browser on `profileDir` with the network guard and the error trap. */
export async function launchPersistent(info: TestInfo, profileDir: string, opts: { offline?: boolean } = {}): Promise<BrowserContext> {
  const { type, device, baseURL } = projectLaunch(info);
  const context = await type.launchPersistentContext(profileDir, { ...device, baseURL, offline: opts.offline ?? false });
  if (opts.offline) markOffline(context);
  await guardContext(context);
  return context;
}

/** The pids of every process launched for this profile (the browser and its helpers). */
export function pidsOf(profileDir: string): number[] {
  const out = execFileSync('ps', ['-axww', '-o', 'pid=,command='], { encoding: 'utf8' });
  return out
    .split('\n')
    .filter((l) => l.includes(profileDir))
    .map((l) => Number(l.trim().split(/\s+/, 1)[0]))
    .filter((pid) => Number.isInteger(pid) && pid !== process.pid);
}

/** SIGKILL: the browser gets no chance to run pagehide, unload or flush anything on its way out. */
export async function killHard(context: BrowserContext, profileDir: string): Promise<number[]> {
  const pids = pidsOf(profileDir);
  if (!pids.length) throw new Error(`no browser process found for ${profileDir}`);
  const closed = new Promise<void>((r) => context.once('close', () => r()));
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  }
  await Promise.race([closed, new Promise((r) => setTimeout(r, 5000))]);
  // Wait until every process of the profile is really gone before the profile is opened again.
  for (let i = 0; i < 50 && pidsOf(profileDir).length; i++) await new Promise((r) => setTimeout(r, 100));
  return pids;
}

/** Opens the same profile again, offline. */
export const relaunchOffline = (info: TestInfo, profileDir: string) => launchPersistent(info, profileDir, { offline: true });
