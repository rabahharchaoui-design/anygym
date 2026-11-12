// The shipped JSON shape: a stable plan id and the raw blocks of a day.
import type { PlaceAnswer } from '../intake/options';
import type { Ctx, Item, RawItem, RawPair, RawSingle } from './types';

/** FNV-1a: a short stable id for the same plan. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export const GYM_TYPE: Record<PlaceAnswer, string> = { full: 'full', mix: 'full', hotel: 'hotel', home: 'home', outdoors: 'none' };

const rawItem = (ctx: Ctx, it: Item): RawItem => {
  const out: RawItem = { exercise: ctx.deps.name(it.id), id: it.id };
  if (it.reps) out.reps = it.reps;
  if (it.seconds) out.seconds = it.seconds;
  if (it.candidate.eachSide) out.eachSide = true;
  if (it.note) out.note = it.note;
  return out;
};

export function rawBlock(ctx: Ctx, u: Item[]): RawSingle | RawPair {
  const sets = Math.max(...u.map((it) => it.sets));
  const restSec = Math.max(...u.map((it) => it.rest));
  if (u.length === 1) return { type: 'single', ...rawItem(ctx, u[0]!), sets, restSec };
  return { type: 'superset', sets, restSec, items: u.map((it) => rawItem(ctx, it)) };
}
