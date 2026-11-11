// What a Quick workout card shows (PLAN 3.5b): its gear, its main muscles, its one line counts, the
// reason per exercise, and what Go easy on leaves out. Pure. Moved out of quick.ts (code organization).
import type { Concept, QuickDeps, QuickItem } from './quick';
import { EQUIPMENT_LABEL } from './intake/options';
import type { EquipmentId } from '../db/types';
import { type GroupedItem, SLACK, structureOf } from './quickStyles';
import type { GymKit } from './picker';
import { type Profile, easyOnAvoids } from './order';
import { type SwapData, requiresOf } from './swap';
import { cap } from './quickWhy';
import { withNotes } from './quickNotes';

/** Round 2 (B3): a concept is offered only when its estimate is at or under the minutes picked, 2 more at most. */
export const FIT_SLACK = SLACK;
export const fits = (minutes: number, budget: number): boolean => minutes <= budget + FIT_SLACK;

/** A built day as Quick workout items (a group: done back to back). */
export function itemsOf(deps: QuickDeps, day: readonly GroupedItem[]): QuickItem[] {
  // PLAN 3.5f: every card's why line is a fact from the curated list (quickNotes.ts).
  const items: QuickItem[] = day.map((it) => ({
    id: it.id,
    slot: it.id,
    origin: it.id,
    name: deps.name(it.id),
    pattern: it.pattern,
    sets: it.sets,
    ...(it.reps ? { reps: it.reps } : {}),
    ...(it.seconds ? { seconds: it.seconds } : {}),
    ...(it.eachSide ? { eachSide: true } : {}),
    restSec: it.restSec,
    why: '',
    ...(it.group !== undefined ? { group: it.group } : {}),
  }));
  return withNotes(items, deps);
}


export const hasGear = (id: EquipmentId, gym: GymKit) => gym.equipment.includes(id) && (id !== 'dumbbells' || gym.dumbbellRange !== null);

/** The gear a workout uses here: for each requirement the first option this gym has (never both of an either/or). */
export function gearOf(ids: readonly string[], data: SwapData, gym: GymKit): EquipmentId[] {
  const out: EquipmentId[] = [];
  for (const id of ids) for (const g of requiresOf(data, id) ?? []) {
    const pick = g.find((x) => hasGear(x, gym));
    if (pick && !out.includes(pick)) out.push(pick);
  }
  return out;
}

/** Short gear words for a card's gear line (3.5b round 4, P14): "bench" for either bench, "cable" for the station. */
export const GEAR_WORD: Partial<Record<EquipmentId, string>> = {
  barbell_rack: 'barbell',
  flat_bench: 'bench',
  adjustable_bench: 'bench',
  cable_station: 'cable',
  hyperextension_bench: 'back extension bench',
  hip_adductor_abductor: 'thigh machine',
};

/** "Dumbbells, bench +2": the first two in words, the rest counted; none: "No equipment". */
export function gearWords(gear: readonly EquipmentId[], shown = 2): string {
  const words = [...new Set(gear.map((g) => GEAR_WORD[g] ?? EQUIPMENT_LABEL[g].toLowerCase()))];
  if (!words.length) return 'No equipment';
  const head = words.slice(0, shown).join(', ');
  const rest = words.length - shown;
  return cap(head) + (rest > 0 ? ` +${rest}` : '');
}

/** A More ideas chip: the style's title, with what it trains when another idea has the same title. */
export function moreLabel(c: Pick<Concept, 'title' | 'focus'>, all: readonly Pick<Concept, 'title' | 'focus'>[]): string {
  const twin = all.some((o) => o !== c && o.title === c.title);
  return twin && c.focus ? `${c.title}: ${c.focus.toLowerCase()}` : c.title;
}

/** The primary muscles of a workout (map regions), every one of them. */
export function primaryOf(ids: readonly string[], deps: Pick<QuickDeps, 'primaryOf' | 'profile'>): Set<string> {
  return new Set(ids.flatMap((id) => (deps.primaryOf ? deps.primaryOf(id) : deps.profile(id).targets)));
}

/** How many main muscles a card is known by (the diversity rule compares these). */
export const MAIN_MUSCLES = 3;

/**
 * 3.5b round 4 (B1, M12): a card's primary muscles, the ones the diversity rule compares: the map
 * regions that get the most working sets on it (the catalog's primary muscles of each exercise,
 * counted by its sets), the first ones in the workout first on a tie, at most MAIN_MUSCLES. A 9
 * move full body card and a 6 move arms card are told apart by what they mostly train, not by the
 * one curl the first one ends on.
 */
export function mainMuscles(items: readonly Pick<QuickItem, 'id' | 'sets'>[], deps: Pick<QuickDeps, 'primaryOf' | 'profile'>): Set<string> {
  const count = new Map<string, { n: number; at: number }>();
  items.forEach((it, i) => {
    // PLAN 3.5j: a cardio warm up or finisher says nothing about what the card trains.
    if (deps.profile(it.id).role === 'cardio') return;
    const regions = deps.primaryOf ? deps.primaryOf(it.id) : deps.profile(it.id).targets;
    for (const r of new Set(regions)) {
      const c = count.get(r);
      count.set(r, { n: (c?.n ?? 0) + it.sets, at: c?.at ?? i });
    }
  });
  return new Set(
    [...count.entries()]
      .sort((a, b) => b[1].n - a[1].n || a[1].at - b[1].at)
      .slice(0, MAIN_MUSCLES)
      .map(([r]) => r),
  );
}

/**
 * "6 exercises · 2 pairs · ~30 min", "4 exercises · 3 rounds · ~14 min" (every number from the items
 * and the one estimate). 3.5b round 4 (M9, SPEC 13.1): one vocabulary on every card and the day
 * list: a superset is a "pair", a circuit is counted in "rounds" (never "1 circuit").
 */
export function metaLine(items: readonly Pick<QuickItem, 'group' | 'sets'>[], minutes: number): string {
  const n = items.length;
  const st = structureOf(items);
  const parts = [`${n} ${n === 1 ? 'exercise' : 'exercises'}`];
  const rounds = roundsOf(items);
  if (rounds) parts.push(`${rounds} ${rounds === 1 ? 'round' : 'rounds'}`);
  if (st.supersets) parts.push(`${st.supersets} ${st.supersets === 1 ? 'pair' : 'pairs'}`);
  parts.push(`~${minutes} min`);
  return parts.join(' · ');
}

/**
 * PLAN 3.5f (5, calm card face): an idea card's one numbers line, "6 exercises · ~28 min". The pairs
 * and rounds are behind the card's info button (metaLine), never stacked on the face.
 */
export function countLine(items: readonly unknown[], minutes: number): string {
  const n = items.length;
  return `${n} ${n === 1 ? 'exercise' : 'exercises'} · ~${minutes} min`;
}

/** The rounds of a card's circuits (3 or more moves one after another), the most of them; 0: no circuit. */
export function roundsOf(items: readonly Pick<QuickItem, 'group' | 'sets'>[]): number {
  const size = new Map<number, number>();
  for (const it of items) if (it.group !== undefined) size.set(it.group, (size.get(it.group) ?? 0) + 1);
  return Math.max(0, ...items.filter((it) => it.group !== undefined && (size.get(it.group) ?? 0) >= 3).map((it) => it.sets));
}

export const JOINT_WORD: Record<string, string> = { lower_back: 'lower back', knees: 'knees', shoulders: 'shoulders', wrists: 'wrists', neck: 'neck', hips: 'hips' };

/**
 * 3.5b round 4 (B2, SPEC 15): what Quick leaves out for a joint on the Go easy on list, on every card,
 * on top of the generator's own rule (order.ts easyOnAvoids). Knees: nothing that bends the knee under
 * load (no squat of any kind, the leg press included, no leg extension, no lunge); lower back: no
 * loaded hinge, no bent over row, no barbell squat (easyOnAvoids), and no back extension either;
 * shoulders: no overhead pressing (easyOnAvoids).
 */
export function quickAvoids(easyOn: readonly string[] | undefined, p: Profile): boolean {
  if (easyOnAvoids(easyOn, p)) return true;
  const on = new Set(easyOn ?? []);
  if (on.has('knees') && (p.pattern === 'squat' || p.pattern === 'quads isolation' || p.pattern === 'lunge')) return true;
  if (on.has('lower_back') && p.pattern === 'hinge') return true;
  return false;
}
