import { beforeEach, describe, expect, it } from 'vitest';
import { addExtraSet, clearExtraSets, extraSets, resetExtraSetsMemory } from '../extraSets';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

describe('extraSets', () => {
  beforeEach(() => resetExtraSetsMemory());
  it('counts per workout and exercise, survives a reload, clears on finish', () => {
    const kv = mem();
    expect(extraSets('s1', 'sq', kv)).toBe(0);
    expect(addExtraSet('s1', 'sq', kv)).toBe(1);
    expect(addExtraSet('s1', 'sq', kv)).toBe(2);
    resetExtraSetsMemory();
    expect(extraSets('s1', 'sq', kv)).toBe(2);
    expect(extraSets('s2', 'sq', kv)).toBe(0);
    expect(addExtraSet('s2', 'bp', kv)).toBe(1);
    expect(extraSets('s1', 'sq', kv)).toBe(0);
    clearExtraSets(kv);
    expect(kv.m.size).toBe(0);
    expect(extraSets('s2', 'bp', kv)).toBe(0);
  });
  it('blocked or corrupt storage: memory keeps it', () => {
    const bad = { getItem: () => '{oops', setItem: () => { throw new Error('full'); }, removeItem: () => {} };
    expect(extraSets('s', 'x', bad)).toBe(0);
    expect(addExtraSet('s', 'x', bad)).toBe(1);
    expect(extraSets('s', 'x', bad)).toBe(1);
  });
});
