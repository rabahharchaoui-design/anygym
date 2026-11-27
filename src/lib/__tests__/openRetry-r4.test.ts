// PLAN R4 (6): a part's chunk that failed to load is not given up on for the whole visit; the next
// open asks again, and a failure shows nothing (never a wrong fallback).
import { describe, expect, it } from 'vitest';
import { openRetry } from '../openRetry';

const now = () => Promise.resolve();

describe('openRetry (PLAN R4 6)', () => {
  it('a failed open ends in the empty part, and the next open loads afresh', async () => {
    let calls = 0;
    let up = false;
    const load = () => {
      calls++;
      return up ? Promise.resolve('module') : Promise.reject(new Error('offline'));
    };
    const r = openRetry(load, 'nothing', now);
    expect(r.stale()).toBe(false);
    expect(await r.load()).toBe('nothing');
    expect(calls).toBe(2); // tried, then once more after the wait
    expect(r.stale()).toBe(true); // the next open makes a new lazy part
    expect(r.stale()).toBe(false); // once
    up = true;
    expect(await r.load()).toBe('module');
    expect(calls).toBe(3);
    expect(r.stale()).toBe(false);
  });

  it('a load that worked on the second try is kept', async () => {
    let calls = 0;
    const r = openRetry(() => (++calls === 1 ? Promise.reject(new Error('blip')) : Promise.resolve('module')), 'nothing', now);
    expect(await r.load()).toBe('module');
    expect(r.stale()).toBe(false);
  });
});
