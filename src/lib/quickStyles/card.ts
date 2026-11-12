// One card: the slots filled the plan generator's way, grouped the style's way, fitted to the minutes.
import { generateDay } from '../generator';
import { isCompound, isHeavy } from '../order';
import { quickMinutes, SLACK } from './estimate';
import type { Built, BuildDeps, BuildSpec, Work } from './buildTypes';
import { groupUp, hangsBodyweight, minutesOfWork, restMovable, unitsOf } from './layout';
import { structureCounts } from './styleHelpers';
import type { GroupedItem } from './types';

export const optionWord = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\b(machine|angled|lever|leverage)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function buildCard(spec: BuildSpec, deps: BuildDeps, budget: number): Built | null {
  const left = new Set<string>();
  const usable = (id: string) => !left.has(id) && deps.usable(id) && (!spec.only || spec.only(deps.profile(id), deps.requires(id)));
  // 3.5b round 4: one option once ("Leg Press" and "Machine Leg Press" are one leg press at a gym).
  const sameAs = (id: string) => optionWord(deps.name(id));
  const gen = { ...deps, usable, data: { ...deps.data, sameAs } };
  let r = generateDay({ ...spec.input, minutes: undefined }, gen, { name: spec.name, slots: spec.slots, want: spec.want });
  // At most `maxHeavy` heavy lifts: the later ones make room for lighter moves (a circuit leads with one big leg lift).
  for (let guard = 0; r.ok && spec.maxHeavy !== undefined && guard < 6; guard++) {
    const extra = r.items.filter((it) => isHeavy(deps.profile(it.id))).slice(spec.maxHeavy);
    if (!extra.length) break;
    for (const it of extra) left.add(it.id);
    r = generateDay({ ...spec.input, minutes: undefined }, gen, { name: spec.name, slots: spec.slots, want: spec.want });
  }
  if (!r.ok) return null;
  let items: Work[] = r.items.map((it) => {
    const profile = deps.profile(it.id);
    // A heavy lift keeps its prescribed rest always (SPEC 22 rule 6); other compounds keep theirs outside circuits.
    const w: Work = { ...it, profile, keepRest: isHeavy(profile) || (isCompound(profile) && spec.shape !== 'circuit' && spec.shape !== 'tri') };
    if (spec.reps && w.reps) w.reps = isCompound(profile) ? [...spec.reps.compound] : [...spec.reps.other];
    // 3.5b round 4 (B4): a bodyweight pull up is a reachable 5 to 8 reps, never 8 to 12 (or a pulldown: quick.ts).
    if (w.reps && hangsBodyweight(deps.requires(it.id))) w.reps = [5, 8];
    if (spec.sets !== undefined) w.sets = spec.sets;
    w.sets = Math.min(w.sets, spec.maxSets);
    if (!w.keepRest) w.restSec = spec.rest.single;
    return w;
  });
  items = groupUp(items, spec.shape, spec);
  // A card never says more than the minutes picked ("~17 min" on the 15 chip reads wrong).
  const over = () => minutesOfWork(items, deps) > budget;
  const fits = (fn: () => void): boolean => {
    const before = items.map((it) => ({ ...it }));
    fn();
    if (over()) {
      items = before;
      return false;
    }
    return true;
  };

  // Long: tighter rest, then fewer sets (small moves first), then the last moves go.
  for (let guard = 0; over() && guard < 200; guard++) {
    const units = unitsOf(items);
    const rest = units.filter((u) => restMovable(u) && u[0]!.restSec - 15 >= spec.rest.floor);
    if (rest.length) {
      for (const u of rest) for (const it of u) it.restSec -= 15;
      continue;
    }
    const cut = [...units].reverse().filter((u) => u[0]!.sets > 2).sort((a, b) => Number(isCompound(a[0]!.profile)) - Number(isCompound(b[0]!.profile)) || b[0]!.sets - a[0]!.sets)[0];
    if (cut) {
      for (const it of cut) it.sets--;
      continue;
    }
    if (items.length <= 3) break;
    // 3.5b round 2: one heavy lift is plenty for a short workout: a second one goes before any light
    // move (its long rest would cost two light moves that pair up).
    const heavy = items.filter((x) => isHeavy(x.profile));
    const out = heavy.length > 1 ? heavy[heavy.length - 1]! : items[items.length - 1]!;
    items = groupUp(items.filter((x) => x !== out), spec.shape, spec);
  }
  if (over()) return null;

  // Short: one more set or round where it still fits, then a little more rest.
  for (let guard = 0; minutesOfWork(items, deps) < budget - SLACK && guard < 200; guard++) {
    const units = unitsOf(items);
    let grew = false;
    for (const u of units) {
      if (u[0]!.sets >= spec.maxSets) continue;
      if (fits(() => unitsOf(items).find((x) => x[0]!.id === u[0]!.id)!.forEach((it) => it.sets++))) {
        grew = true;
        break;
      }
    }
    if (grew) continue;
    for (const u of units) {
      if (!restMovable(u) || u[0]!.restSec + 15 > spec.rest.cap) continue;
      if (fits(() => unitsOf(items).find((x) => x[0]!.id === u[0]!.id)!.forEach((it) => (it.restSec += 15)))) {
        grew = true;
        break;
      }
    }
    if (!grew) break;
  }

  // Groups numbered in order; a group of one is a single.
  const sizes = structureCounts(items);
  const renumber = new Map<number, number>();
  const out: GroupedItem[] = items.map((w) => {
    const { profile: _p, keepRest: _k, ...it } = w;
    void _p;
    void _k;
    if (it.group === undefined || (sizes.get(it.group) ?? 0) < 2) {
      delete it.group;
      return it;
    }
    if (!renumber.has(it.group)) renumber.set(it.group, renumber.size);
    it.group = renumber.get(it.group)!;
    return it;
  });
  const minutes = quickMinutes(out.map((it) => ({ ...it, name: deps.name(it.id) })));
  if (minutes >= budget - SLACK) return { items: out, minutes };
  return { items: out, minutes, short: r.items.length < spec.want ? 'moves' : 'caps' };
}
