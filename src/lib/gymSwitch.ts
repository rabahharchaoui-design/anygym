// Switching gyms in the middle of a workout (PLAN 3.9, SPEC 19, 7.5). Pure: no Dexie, no React.
// The rows still to do meet the new gym the way a plan day meets a gym when it starts (adaptDay):
// only an exercise whose gear is known and missing changes, to the best of its pattern, or is marked
// as nothing fits. A slot the engine changed for the old gym goes back to the plan's exercise when
// the new gym can do it. Done rows never change, and an exercise with logged sets keeps them under
// its own id (applySwap keeps it as its own row). No number is carried across exercises.
import type { SessionSwap } from '../db/types';
import type { GymKit } from './picker';
import { applySwap, missingWord, patternOf, requiresOf, slotOf, supports, swapCandidates, swapOfRow, workoutIdOf, type SwapData, type SwapState } from './swap';

/** One row of the workout as it is now. */
export type SwitchRow = {
  id: string;
  /** A hold: only swapped for another hold. */
  seconds?: boolean;
  /** Finishers stay as they are (adaptDay leaves them too). */
  finisher?: boolean;
  /** Every planned set of it is logged: it never changes. */
  finished: boolean;
  /** At least one set logged: it stays as its own row with those sets. */
  logged: boolean;
};

export type SwitchChange =
  /** `from` makes way for `to`: the new gym lacks what `from` needs. */
  | { kind: 'swap'; from: string; to: string; reason: string }
  /** The slot's own exercise again: the new gym has what it needs. */
  | { kind: 'back'; from: string; to: string }
  /** Nothing this gym can do fits: the row stays and can be skipped. */
  | { kind: 'noFit'; id: string; reason: string }
  /** It was marked as nothing fits; the new gym can do it. */
  | { kind: 'fits'; id: string };

export type SwitchPlan = { state: SwapState; changes: SwitchChange[] };

const withSwaps = (state: SwapState, swaps: SessionSwap[]): SwapState => ({ exerciseIds: state.exerciseIds, swaps });

/** The record of `id` (as the current exercise) replaced by `next`, or removed when `next` is null. */
function replaceRecord(state: SwapState, id: string, next: SessionSwap | null): SwapState {
  const others = state.swaps.filter((s) => s.current !== id);
  return withSwaps(state, next ? [...others, next] : others);
}

/** After applySwap to `to`: mark it as the engine's pick with its reason, or clean it when back on the slot. */
function stamp(state: SwapState, to: string, reason: string | null): SwapState {
  const rec = swapOfRow(state.swaps, to);
  if (!rec) return state;
  const next: SessionSwap = { ...rec };
  delete next.noFit;
  if (reason) {
    next.auto = true;
    next.reason = reason;
  } else {
    delete next.auto;
    delete next.reason;
  }
  return replaceRecord(state, to, next);
}

const fits = (data: SwapData, id: string, gym: GymKit): boolean | null => {
  const needs = requiresOf(data, id);
  return needs === null ? null : supports(needs, gym);
};

/**
 * What a workout in progress does at `gym`, and the list of what changes (the preview shown before
 * the switch). Rows are in the workout's order; `rows` lists every row on screen, kept rows included.
 */
export function planGymSwitch(data: SwapData, start: SwapState, rows: readonly SwitchRow[], gym: GymKit): SwitchPlan {
  let state: SwapState = { exerciseIds: [...start.exerciseIds], swaps: start.swaps.map((s) => ({ ...s })) };
  const changes: SwitchChange[] = [];
  for (const row of rows) {
    const id = row.id;
    if (row.finished || row.finisher || !state.exerciseIds.includes(id)) continue;
    const rec = swapOfRow(state.swaps, id);
    // A kept exercise (an earlier member of a slot with its logged sets) is history, not a row to do.
    if (!rec && state.swaps.some((s) => s.kept?.includes(id))) continue;
    const slot = slotOf(state.swaps, id);
    const others = state.exerciseIds.filter((x) => x !== id && x !== slot);
    const curFits = fits(data, id, gym);
    const slotFits = id === slot ? curFits : fits(data, slot, gym);
    const slotFree = !others.some((x) => data.sameAs(x) === data.sameAs(slot));

    // Back to the plan: the engine (or a pick the new gym cannot do) moved this slot away from an
    // exercise the new gym has everything for.
    if (id !== slot && slotFits === true && slotFree && (rec?.auto || curFits === false)) {
      state = stamp(applySwap(state, id, slot, row.logged), slot, null);
      changes.push({ kind: 'back', from: id, to: slot });
      continue;
    }
    if (rec?.noFit) {
      if (curFits === true) {
        const next: SessionSwap = { ...rec };
        delete next.noFit;
        delete next.reason;
        delete next.auto;
        state = replaceRecord(state, id, next.current === next.slot && !next.kept?.length && !next.always ? null : next);
        changes.push({ kind: 'fits', id });
      }
      continue;
    }
    if (curFits !== false) continue;
    const needs = requiresOf(data, id)!;
    const reason = `no ${missingWord(needs, gym)} here`;
    const mine = new Set([slot, ...(rec?.kept ?? [])]);
    const exclude = state.exerciseIds.filter((x) => !mine.has(x)).concat(id, slot);
    const from = patternOf(data, slot) ? slot : id;
    const best = swapCandidates(data, from, gym, { mode: row.seconds ? 'seconds' : 'reps', exclude })[0];
    if (best) {
      const to = workoutIdOf(best);
      state = stamp(applySwap(state, id, to, row.logged), to, reason);
      changes.push({ kind: 'swap', from: id, to, reason });
    } else {
      const next: SessionSwap = rec ? { ...rec, noFit: true, reason } : { slot: id, current: id, noFit: true, reason };
      state = replaceRecord(state, id, next);
      changes.push({ kind: 'noFit', id, reason });
    }
  }
  return { state, changes };
}

/** "Barbell Back Squat → Dumbbell Squat", the reason under it, in plain words. */
export function changeWords(c: SwitchChange, nameOf: (id: string) => string): { title: string; line: string } {
  switch (c.kind) {
    case 'swap':
      return { title: `${nameOf(c.from)} → ${nameOf(c.to)}`, line: `Swapped: ${c.reason}` };
    case 'back':
      return { title: `${nameOf(c.from)} → ${nameOf(c.to)}`, line: 'Back to the plan: this gym has it' };
    case 'noFit':
      return { title: nameOf(c.id), line: `Nothing fits: ${c.reason}. Skip it.` };
    case 'fits':
      return { title: nameOf(c.id), line: 'This gym has it' };
  }
}
