// A shared, bounded priority budget. No database, catalog or screen dependencies.
import { FOCUS_PARTS, FOCUS_PICKS, type FocusPickId } from '../intake/options';
import type { Muscle } from '../order';

export function normalizeFocusPicks(picks: readonly string[] = []): FocusPickId[] {
  const valid = new Set<string>(FOCUS_PICKS.map((p) => p.id));
  const unique = [...new Set(picks)].filter((p): p is FocusPickId => valid.has(p));
  if (unique.includes('balance')) return ['balance'];
  return unique.filter((p) => !Object.entries(FOCUS_PARTS).some(([parent, parts]) => parent !== p && unique.includes(parent as FocusPickId) && parts.some((part) => part.id === p)));
}

/** One shared muscle mapping for ordering, Quick and Up next. */
const MUSCLES: Partial<Record<FocusPickId, readonly Muscle[]>> = {
  chest: ['chest'], upper_chest: ['chest'], back: ['back'], lats: ['back'], upper_back: ['back'], lower_back: ['lower back'],
  shoulders: ['front delts', 'side delts', 'rear delts'], front_delts: ['front delts'], side_delts: ['side delts'], rear_delts: ['rear delts'],
  arms: ['biceps', 'triceps', 'forearms'], biceps: ['biceps'], triceps: ['triceps'], forearms: ['forearms'], grip: ['forearms'],
  core: ['abs'], abs: ['abs'], glutes: ['glutes'], legs: ['quads', 'hamstrings', 'calves'], quads: ['quads'], hamstrings: ['hamstrings'], calves: ['calves'],
  posture: ['back', 'rear delts'],
};
export const focusMuscles = (picks: readonly string[] = []): Muscle[] => [...new Set(normalizeFocusPicks(picks).flatMap((p) => MUSCLES[p] ?? []))];
export const focusLabel = (id: FocusPickId): string => FOCUS_PICKS.find((p) => p.id === id)?.label ?? id;

export function focusBudget(picks: readonly string[]): { total: number; targets: Array<{ id: FocusPickId; sets: number }> } {
  const ids = normalizeFocusPicks(picks).filter((p) => p !== 'balance');
  const total = Math.min(12, ids.length <= 2 ? ids.length * 4 : ids.length <= 4 ? ids.length * 3 : 12);
  let left = total;
  const targets = ids.map((id, i) => {
    const sets = Math.min(left, ids.length <= 2 ? 4 : ids.length <= 4 || i < 2 ? 3 : 2);
    left -= sets;
    return { id, sets };
  });
  return { total, targets };
}

/** Each physical set is charged once, even when it trains two requested areas. */
export type FocusMove = {
  seconds?: number;
  id: string; key: string; sets: number; hard: boolean; compound: boolean;
  muscles: readonly string[]; picks: readonly FocusPickId[];
};
export type FocusResult = { id: FocusPickId; requested: number; extra: number; total: number; shortfall: boolean; reason?: string; minutes?: number };
export type FocusReport = { budget: number; spent: number; priorities: FocusResult[]; days: string[][] };
export const countHardSets = (days: readonly (readonly FocusMove[])[], muscle: string): number => days.flat().reduce((n, m) => n + (m.hard && m.muscles.includes(muscle) ? m.sets : 0), 0);
const countPick = (days: FocusMove[][], id: FocusPickId): number => days.flat().reduce((n, m) => n + (m.hard && m.picks.includes(id) ? m.sets : 0), 0);

/**
 * Receives already fitted days and eligible, prescribed candidates. Replacement, then set growth,
 * then a small move at the end. Each tentative edit uses the caller's single duration estimate.
 * No later filling may undo this pass. Compound lifts and the minimum day size are protected.
 */
export function curateFocus(input: {
  picks: readonly string[]; days: FocusMove[][]; candidates: FocusMove[][]; cap: number;
  minutes: (day: FocusMove[], index: number) => number; budgetMinutes?: number;
}): { days: FocusMove[][]; report: FocusReport } {
  const days = input.days.map((d) => d.map((m) => ({ ...m })));
  const budget = focusBudget(input.picks);
  const baseline = days.map((d) => d.map((m) => ({ ...m })));
  let spent = 0;
  const limits = days.map((d, i) => Math.max(input.minutes(d, i), input.budgetMinutes ?? Infinity));
  const focusedMuscles = new Set([...days.flat(), ...input.candidates.flat()].filter((m) => m.picks.some((p) => budget.targets.some((t) => t.id === p))).flatMap((m) => m.muscles));
  const capped = () => [...focusedMuscles].every((m) => countHardSets(days, m) <= 20);
  // Cap baseline work too. Last accessories first; never invent a count or count helpers as direct work.
  for (let guard = 0; !capped() && guard < 200; guard++) {
    const over = new Set(days.flat().flatMap((m) => m.muscles).filter((m) => focusedMuscles.has(m) && countHardSets(days, m) > 20));
    const moves = days.flat().filter((m) => m.hard && m.sets > 1 && m.muscles.some((s) => over.has(s)));
    const move = [...moves].reverse().find((m) => !m.compound) ?? moves.at(-1);
    if (!move) break;
    move.sets--;
  }
  const accepts = (i: number, change: () => void, undo: () => void): boolean => {
    change();
    if (!capped() || input.minutes(days[i]!, i) > limits[i]!) { undo(); return false; }
    return true;
  };
  for (const { id, sets: requested } of budget.targets) {
    if (id === 'mobility') {
      for (const [i, day] of days.entries()) {
        if (day.some((m) => m.picks.includes('mobility'))) continue;
        const c = input.candidates[i]?.find((m) => !m.hard && m.picks.includes('mobility'));
        if (c) accepts(i, () => day.push({ ...c }), () => { day.pop(); });
        if (days.flat().filter((m) => m.picks.includes('mobility')).length >= 2) break;
      }
      continue;
    }
    if (!requested) continue;
    // Work already added for another choice credits every verified target without a second charge.
    let added = Math.min(requested, Math.max(0, countPick(days, id) - countPick(baseline, id)));
    const credit = (n: number) => { spent += n; added += n; };
    // Substitute a low priority accessory. Never sacrifice another ranked choice or a big lift.
    for (const [i, day] of days.entries()) {
      if (added >= requested || spent >= budget.total) break;
      const candidate = input.candidates[i]?.find((m) => m.hard && !m.compound && m.picks.includes(id) && !day.some((x) => x.key === m.key));
      if (!candidate) continue;
      const at = day.findLastIndex((m) => !m.compound && m.hard && !m.picks.some((p) => budget.targets.some((t) => t.id === p)));
      if (at < 0) continue;
      const old = day[at]!;
      const next = { ...candidate, sets: Math.min(old.sets, input.cap, requested - added, budget.total - spent) };
      if (next.sets < 2) continue;
      if (accepts(i, () => { day[at] = next; }, () => { day[at] = old; })) credit(next.sets);
    }
    // Add one working set around the rotation, accessories before compounds, respecting experience.
    for (let guard = 0; added < requested && spent < budget.total && guard < 4; guard++) {
      let grew = false;
      for (const compound of [false, true]) for (const [i, day] of days.entries()) for (const m of day) {
        if (added >= requested || spent >= budget.total) break;
        if (!m.hard || m.compound !== compound || !m.picks.includes(id) || m.sets >= input.cap) continue;
        if (accepts(i, () => m.sets++, () => m.sets--)) { credit(1); grew = true; }
      }
      if (!grew) break;
    }
    // Only then a short accessory finisher, within the shared budget and real duration.
    for (const [i, day] of days.entries()) {
      const n = Math.min(requested - added, budget.total - spent, input.cap);
      if (n < 2 || day.length >= 8) continue;
      const c = input.candidates[i]?.find((m) => m.hard && !m.compound && m.picks.includes(id) && !day.some((x) => x.key === m.key));
      if (!c) continue;
      if (accepts(i, () => day.push({ ...c, sets: n }), () => { day.pop(); })) credit(n);
    }
  }
  const priorities = budget.targets.map(({ id, sets: requested }): FocusResult => {
    if (id === 'mobility') {
      const minutes = days.flat().filter((m) => !m.hard && m.picks.includes(id)).reduce((n, m) => n + (m.seconds ?? 0) * m.sets / 60, 0);
      return { id, requested: 0, extra: 0, total: 0, minutes, shortfall: minutes < 2, ...(minutes < 2 ? { reason: 'No more verified mobility time fits inside your minutes.' } : {}) };
    }
    const total = countPick(days, id);
    // Count retained extra directly against the fitted baseline, never a stale item annotation.
    const extra = Math.min(requested, Math.max(0, total - countPick(baseline, id)));
    const objective = id === 'posture';
    const shortfall = extra < requested || (!objective && total < 12);
    return { id, requested, extra, total, shortfall, ...(shortfall ? { reason: requested === 0 ? 'The shared focus budget went to earlier choices.' : 'Equipment, experience, muscle limits and minutes limit the extra work.' } : {}) };
  });
  const why = (p: FocusResult, total: number) => p.id === 'mobility' ? `Mobility: ${p.minutes} min of stretches` : p.id === 'posture'
    ? `${focusLabel(p.id)}: ${total} sets of back and rear shoulder work`
    : `${p.extra ? 'Extra ' : ''}${focusLabel(p.id).toLowerCase()} work: ${p.total} sets`;
  return { days, report: { budget: budget.total, spent, priorities, days: days.map((d) => priorities.filter((p) => (p.total > 0 || (p.minutes ?? 0) > 0) && d.some((m) => m.picks.includes(p.id))).map((p) => why(p, p.total))) } };
}
