import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REST_SEC,
  REST_KEY,
  extendRest,
  isRestDone,
  loadRest,
  parseRest,
  remainingMs,
  remainingSec,
  restFraction,
  saveRest,
  startRest,
} from '../rest';

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
};

describe('rest timer math', () => {
  it('defaults to 90 s and counts down from an end timestamp', () => {
    expect(DEFAULT_REST_SEC).toBe(90);
    const r = startRest('s', 1000);
    expect(r).toEqual({ sessionId: 's', endsAt: 91_000, totalSec: 90 });
    expect(remainingMs(r, 1000)).toBe(90_000);
    expect(remainingSec(r, 1000)).toBe(90);
    expect(remainingSec(r, 1001)).toBe(90); // rounds up
    expect(remainingSec(r, 90_500)).toBe(1);
    expect(remainingSec(r, 91_000)).toBe(0);
    expect(remainingMs(r, 500_000)).toBe(0); // backgrounded for minutes: never negative
    expect(isRestDone(r, 90_999)).toBe(false);
    expect(isRestDone(r, 91_000)).toBe(true);
  });

  it('ring fraction goes 1 → 0', () => {
    const r = startRest('s', 0, 60);
    expect(restFraction(r, 0)).toBe(1);
    expect(restFraction(r, 30_000)).toBe(0.5);
    expect(restFraction(r, 99_000)).toBe(0);
    expect(restFraction({ ...r, totalSec: 0 }, 0)).toBe(0);
  });

  it('+15 s adds to what is left, or from now once it ran out', () => {
    const r = startRest('s', 0, 90);
    const a = extendRest(r, 10_000);
    expect(a.endsAt).toBe(105_000);
    expect(a.totalSec).toBe(95); // 80 left + 15 > 90
    expect(remainingSec(a, 10_000)).toBe(95);
    const b = extendRest(startRest('s', 0, 90), 1000);
    expect(b.totalSec).toBe(104);
    const late = extendRest(r, 200_000);
    expect(late.endsAt).toBe(215_000);
    expect(remainingSec(late, 200_000)).toBe(15);
    const small = extendRest(startRest('s', 0, 90), 80_000, 15);
    expect(small.totalSec).toBe(90); // 25 left: ring keeps its size
  });
});

describe('rest persistence', () => {
  it('round trips through storage for the same workout only', () => {
    const kv = memory();
    const r = startRest('s1', 5);
    saveRest(r, kv);
    expect(JSON.parse(kv.m.get(REST_KEY)!)).toEqual(r);
    expect(loadRest('s1', kv)).toEqual(r);
    expect(loadRest('s2', kv)).toBeNull();
    saveRest(null, kv);
    expect(loadRest('s1', kv)).toBeNull();
    expect(loadRest('s1', null)).toBeNull();
    saveRest(r, null);
  });

  it('treats corrupt or partial data as no rest', () => {
    expect(parseRest(null)).toBeNull();
    expect(parseRest('{')).toBeNull();
    expect(parseRest('{"sessionId":"s","endsAt":"x","totalSec":1}')).toBeNull();
    expect(parseRest('{"sessionId":"s","endsAt":1,"totalSec":2}')).toEqual({ sessionId: 's', endsAt: 1, totalSec: 2 });
  });

  it('never throws when storage is full or blocked', () => {
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => saveRest(startRest('s', 0), broken)).not.toThrow();
    expect(() => saveRest(null, broken)).not.toThrow();
  });

  it('defaults to localStorage when present', () => {
    const kv = memory();
    (globalThis as { localStorage?: unknown }).localStorage = kv;
    try {
      saveRest(startRest('g', 0));
      expect(loadRest('g')).not.toBeNull();
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
    expect(loadRest('g')).toBeNull();
  });
});

describe('blocked storage', () => {
  it('reading localStorage that throws (private mode) means no rest', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    try {
      expect(loadRest('s')).toBeNull();
      expect(() => saveRest(startRest('s', 0))).not.toThrow();
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});
