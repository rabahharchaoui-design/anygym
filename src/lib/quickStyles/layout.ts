// Grouping and ordering the items of a card: areas, interleaving, supersets and circuits.
import { canPair, isCompound, isHeavy, type Profile } from '../order';
import type { Requires } from '../swap';
import { LEGS, PULL, PUSH } from './styleHelpers';
import { quickMinutes } from './estimate';
import type { BuildDeps, BuildSpec, Work } from './buildTypes';
import type { Shape } from './types';

export const minutesOfWork = (items: readonly Work[], deps: BuildDeps) => quickMinutes(items.map((it) => ({ ...it, name: deps.name(it.id) })));

export const areaOf = (p: Profile): number => (p.pattern === null ? 3 : LEGS.has(p.pattern) ? 0 : PUSH.has(p.pattern) ? 1 : PULL.has(p.pattern) ? 2 : 3);

/** Legs, push, pull, legs, push, pull... then the rest (abs, shoulders), each area in its own order. */
export function interleave<T extends { profile: Profile }>(items: readonly T[]): T[] {
  const buckets: T[][] = [[], [], [], []];
  for (const it of items) buckets[areaOf(it.profile)]!.push(it);
  const out: T[] = [];
  while (buckets.slice(0, 3).some((b) => b.length)) for (const b of buckets.slice(0, 3)) if (b.length) out.push(b.shift()!);
  return [...out, ...buckets[3]!];
}

/** Groups the items the style's way; a group's members get the same sets and the group's rest. */
export function groupUp(items: Work[], shape: Shape, spec: BuildSpec): Work[] {
  for (const it of items) delete it.group;
  if (shape === 'straight') return items;
  if (shape === 'circuit' || shape === 'tri') {
    // 3.5b round 2 (Codex #1): a heavy lift is never in a circuit: it goes first, on its own, at its own rest.
    const heavy = items.filter((x) => isHeavy(x.profile));
    const rest = items.filter((x) => !isHeavy(x.profile));
    if (heavy.length) return [...heavy, ...groupUp(rest, shape, spec)];
    // Legs, a push and a pull take turns, so every round works the whole body and no muscle goes twice in a row.
    items = interleave(items);
    const sizes: number[] = [];
    if (shape === 'circuit') sizes.push(items.length);
    else {
      // Circuits of 3; a leftover of 1 or 2 joins the last one (3.5b round 4, M9: a circuit card is all
      // rounds, never "3 rounds · 1 pair"); 2 alone is a pair.
      let n = items.length;
      while (n > 0) {
        if (n === 4) {
          sizes.push(4);
          n = 0;
        } else if (n === 2) {
          if (sizes.length) sizes[sizes.length - 1]! += 2;
          else sizes.push(2);
          n = 0;
        } else {
          sizes.push(Math.min(3, n));
          n -= Math.min(3, n);
        }
      }
    }
    let at = 0;
    sizes.forEach((size, g) => {
      const run = items.slice(at, at + size);
      at += size;
      if (run.length < 2) return;
      const rounds = Math.max(...run.map((x) => x.sets));
      for (const it of run) {
        it.group = g;
        it.sets = rounds;
        it.restSec = spec.rest.group;
      }
    });
    return items;
  }
  // Supersets: two moves that share no muscle, never a heavy lift, as many as the minutes ask for.
  const out: Work[] = [];
  const used = new Set<number>();
  let g = 0;
  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;
    const a = items[i]!;
    used.add(i);
    out.push(a);
    if (g >= spec.density.supersets || isHeavy(a.profile)) continue;
    const j = items.findIndex((b, k) => k > i && !used.has(k) && !isHeavy(b.profile) && canPair(a.profile, b.profile));
    if (j === -1) continue;
    const b = items[j]!;
    used.add(j);
    const sets = Math.max(a.sets, b.sets);
    a.sets = sets;
    b.sets = sets;
    a.group = g;
    b.group = g;
    const rest = isCompound(a.profile) || isCompound(b.profile) ? Math.max(spec.rest.group, 90) : spec.rest.group;
    a.restSec = rest;
    b.restSec = rest;
    out.push(b);
    g++;
  }
  return out;
}

/** The units of a grouped list: each group once, each single once, in order. */
export function unitsOf(items: readonly Work[]): Work[][] {
  const out: Work[][] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (it.group !== undefined && last && last[0]!.group === it.group) last.push(it);
    else out.push([it]);
  }
  return out;
}

export const restMovable = (u: readonly Work[]) => u.length > 1 || !u[0]!.keepRest;

/** Only a pull up bar: the lift hangs your whole bodyweight (pull ups, chin ups). */
export const hangsBodyweight = (requires: Requires | null): boolean => !!requires && requires.length > 0 && requires.every((g) => g.every((id) => id === 'pull_up_bar'));
