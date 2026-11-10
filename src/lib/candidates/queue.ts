// The review queue (PLAN 3.5e): which candidate G sees first, and the batches of 20. Pure. What is
// short today comes first: a leg or cardio move a short place can do, then anything a short place
// can do, then moves of a pattern with fewer than 3 sure moves, then the rest; within a tier, moves
// more short places can do first, then by id (the order never changes while G works through it).
import { supports } from '../swap';
import type { Move } from './coverage';
import { LEG_GROUPS, PATTERN_TARGET, PRESET_KITS, PRESET_TARGET, SHORT_PRESETS } from './presets';
import type { CandidateRecord } from './types';

export const BATCH = 20;

export function reviewOrder(candidates: readonly Pick<CandidateRecord, 'id' | 'pattern' | 'requires'>[], sureToday: readonly Move[]): string[] {
  const shortKits = PRESET_KITS.filter((p) => SHORT_PRESETS.includes(p.id) && sureToday.filter((m) => supports(m.requires, p.kit)).length < PRESET_TARGET);
  const thin = (group: string) => sureToday.filter((m) => m.group === group).length < PATTERN_TARGET;
  const ranked = candidates.map((c) => {
    const places = shortKits.filter((p) => supports(c.requires, p.kit)).length;
    const legsOrCardio = LEG_GROUPS.includes(c.pattern) || c.pattern === 'cardio';
    const tier = places > 0 && legsOrCardio ? 0 : places > 0 ? 1 : thin(c.pattern) ? 2 : 3;
    return { id: c.id, tier, places };
  });
  ranked.sort((a, b) => a.tier - b.tier || b.places - a.places || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return ranked.map((r) => r.id);
}

/** The batch G is in: the first with an undecided move (-1: every move decided). */
export function currentBatch(order: readonly string[], decided: ReadonlySet<string>, size = BATCH): number {
  const at = order.findIndex((id) => !decided.has(id));
  return at < 0 ? -1 : Math.floor(at / size);
}

export interface BatchView {
  /** 0 based. */
  index: number;
  count: number;
  ids: string[];
  /** Undecided moves of this batch, in order. */
  left: string[];
}

export function batchView(order: readonly string[], decided: ReadonlySet<string>, index: number, size = BATCH): BatchView {
  const ids = order.slice(index * size, (index + 1) * size);
  return { index, count: Math.ceil(order.length / size), ids, left: ids.filter((id) => !decided.has(id)) };
}

/** "Batch 3 of 15 · 12 left". */
export const batchText = (b: BatchView): string => `Batch ${b.index + 1} of ${b.count} · ${b.left.length} left`;
