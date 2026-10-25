import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../db/schema';
import { buildCrash, captureCrash, cleanStack, crashSignature, firstFrame } from '../capture';
import type { CrashPreference } from '../preferences';
import type { Transport } from '../transport';
import { stubBrowser } from './env';

const WEBKIT_STACK = 'render@http://localhost:4173/anygym/assets/index-Ab12.js?v=1:40:1234\nlogSet@http://localhost:4173/anygym/assets/index-Ab12.js:12:99';
const CHROME_STACK = 'TypeError: x\n    at render (https://rabahharchaoui-design.github.io/anygym/assets/index-Ab12.js:40:1234)';

const prefs = (on: boolean): CrashPreference => ({ enabled: () => on, ready: async () => on, fresh: async () => on, setEnabled: async () => {}, subscribe: () => () => {} });
let drains = 0;
const fakeTransport = { drain: async () => void drains++ } as unknown as Transport;
const DAY = Date.parse('2026-10-25T12:00:00');

beforeEach(async () => {
  stubBrowser('#/workout/0f8c2a4e-1b2c-4d5e-8f90-123456789abc');
  drains = 0;
  await db.reportQueue.clear();
  await db.crashSignatures.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('signatures', () => {
  it('first frame is the script file, line and column, the same in WebKit and Chrome stacks', () => {
    expect(firstFrame(cleanStack(WEBKIT_STACK))).toBe('index-Ab12.js:40:1234');
    expect(firstFrame(cleanStack(CHROME_STACK))).toBe('index-Ab12.js:40:1234');
    expect(firstFrame('')).toBe('no-stack');
    expect(crashSignature('TypeError: x', cleanStack(WEBKIT_STACK))).toBe(crashSignature('TypeError: x', cleanStack(CHROME_STACK)));
    expect(crashSignature('TypeError: x', cleanStack(WEBKIT_STACK))).toBe('TypeError: x @ index-Ab12.js:40:1234');
  });

  it('ids in a message do not split a signature', () => {
    const a = buildCrash(new Error('No set 0f8c2a4e-1b2c-4d5e-8f90-123456789abc'))!;
    const b = buildCrash(new Error('No set 11111111-2222-4333-8444-555555555555'))!;
    expect(a.message).toBe('Error: No set [id]');
    expect(a.signature.split(' @ ')[0]).toBe(b.signature.split(' @ ')[0]);
  });

  it('cleans stacks: only our own script frames, no origins or queries, at most 12 lines', () => {
    const s = cleanStack(Array.from({ length: 20 }, () => 'f@https://host.example/anygym/a.js?k=SECRET:1:2').join('\n'));
    expect(s.split('\n')).toHaveLength(12);
    expect(s.split('\n')[0]).toBe('f@a.js:1:2');
    expect(s).not.toMatch(/host\.example|SECRET/);
    expect(cleanStack('x@https://evil.example/steal.js:1:2\nQuentin Privateperson 602-555-1234\nat (native)')).toBe('');
  });

  it('a crash with a name, phone and email keeps none of them in message, stack or signature', () => {
    const e = new Error('Quentin Privateperson, phone 602-555-1234, mail a@b.co');
    e.stack = `Error: Quentin Privateperson, phone 602-555-1234, mail a@b.co\n${WEBKIT_STACK}\nhttps://maps.example/Quentin/602-555-1234:1:1`;
    const p = buildCrash(e)!;
    const text = JSON.stringify({ m: p.message, s: p.stack, g: p.signature });
    for (const secret of ['Quentin', 'Privateperson', '602', '555-1234', 'a@b.co', 'maps.example']) expect(text, secret).not.toContain(secret);
    expect(p.message).toBe('Error: [name] [name], phone [phone], mail [email]');
    expect(p.message.length).toBeLessThanOrEqual(160);
  });

  it('messages are cut to 160 characters before the signature is built', () => {
    const p = buildCrash(new Error('x'.repeat(400)))!;
    expect(p.message.length).toBe(160);
    expect(p.signature.startsWith(p.message)).toBe(true);
  });

  it('builds a tiny report with the templated route, and skips browser noise', () => {
    const e = new TypeError('x is undefined');
    e.stack = WEBKIT_STACK;
    const p = buildCrash(e)!;
    expect(Object.keys(p).sort()).toEqual(['appVersion', 'device', 'message', 'requestId', 'route', 'signature', 'stack']);
    expect(p.route).toBe('/workout/:id');
    expect(p.message).toBe('TypeError: x is undefined');
    expect(p.appVersion).toMatch(/^\d+\.\d+\.\d+\+(dev|[0-9a-f]+)$/);
    expect(buildCrash('ResizeObserver loop completed with undelivered notifications.')).toBeNull();
    expect(buildCrash('Script error.')).toBeNull();
    expect(buildCrash({ weird: true })!.message).toBe('[object]');
  });
});

describe('captureCrash', () => {
  it('queues each signature at most once per local day, then again the next day', async () => {
    const e = new Error('boom');
    e.stack = WEBKIT_STACK;
    const deps = { prefs: prefs(true), transport: fakeTransport, now: () => DAY };
    expect(await captureCrash(e, '', deps)).toBe(true);
    expect(await captureCrash(e, '', deps)).toBe(false);
    const other = new Error('other');
    expect(await captureCrash(other, '', deps)).toBe(true);
    expect(await captureCrash(e, '', { ...deps, now: () => DAY + 86_400_000 })).toBe(true);
    expect(await db.reportQueue.count()).toBe(3);
    expect(drains).toBe(3);
  });

  it('re-reads the saved choice before queueing: off in another tab, nothing is queued', async () => {
    let saved = true;
    const live: CrashPreference = { ...prefs(true), ready: async () => true, fresh: async () => saved };
    saved = false;
    expect(await captureCrash(new Error('other tab'), '', { prefs: live, transport: fakeTransport, now: () => DAY })).toBe(false);
    expect(await db.reportQueue.count()).toBe(0);
  });

  it('sends nothing while Send crash reports is off', async () => {
    expect(await captureCrash(new Error('off'), '', { prefs: prefs(false), transport: fakeTransport, now: () => DAY })).toBe(false);
    expect(await db.reportQueue.count()).toBe(0);
    expect(drains).toBe(0);
  });

  it('never throws, even when the preference cannot be read', async () => {
    const broken = { ...prefs(true), fresh: async () => Promise.reject(new Error('no storage')) } as CrashPreference;
    await expect(captureCrash(new Error('x'), '', { prefs: broken, transport: fakeTransport })).resolves.toBe(false);
  });
});
