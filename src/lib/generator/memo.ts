// PLAN 3.6p, speed: a plan is a pure function of the answers, the committed data and what is
// approved on this phone, so the same build is done once and remembered. The reveal builds the plan
// and then the plans for more days and more minutes (lib/intake/focusFit.ts), and each of those looks
// at the plans one step smaller (least.ts): most of them are the same few builds.
import type { GeneratorDeps, GeneratorInput, GeneratorResult } from './types';

/** The most results kept for one set of data (one screen's worth of choices is at most a few dozen). */
const KEPT = 120;
const memo = new WeakMap<GeneratorDeps, Map<string, GeneratorResult>>();

/** Everything a build reads: the whole input, and the state of what is approved on this phone (it can change between two builds). */
const keyOf = (input: GeneratorInput, deps: GeneratorDeps): string => `${JSON.stringify(input)}|${deps.stamp!()}`;

/**
 * `build` for this input, or the remembered result of the same input. Every caller gets its own
 * copy, so changing a returned plan never changes what the next caller gets.
 */
export function remembered(input: GeneratorInput, deps: GeneratorDeps, build: () => GeneratorResult): GeneratorResult {
  // Only deps that name their state (`stamp`) and have no filter of their own (`usable`) are remembered.
  if (!deps.stamp || deps.usable) return build();
  const cache = memo.get(deps) ?? new Map<string, GeneratorResult>();
  memo.set(deps, cache);
  const key = keyOf(input, deps);
  const hit = cache.get(key);
  if (hit) return structuredClone(hit);
  const result = build();
  if (cache.size >= KEPT) cache.clear();
  cache.set(key, structuredClone(result));
  return result;
}
