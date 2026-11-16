// Backup checks for plans and the plan pointer (SPEC 9.2, PLAN 3.6d, audit A1). Split from
// lib/backup.ts. A backup must open on any phone, so nothing here depends on what this phone has
// loaded or approved: a generated plan is judged by its own saved definition in the file, and a
// coach tuned copy ("mine-x~coach-rest") by the plan it was tuned from. Whether a restored plan can
// run is decided after the restore, by the plan registry (db/planRegistry.ts), which applies the
// file's own approvals first and says so on Today when a plan still cannot load.
import { RENAMED_PLAN_IDS } from '../db/schema';
import { isGeneratedId, planById } from '../data/plans';
import { parseTunedId } from './coachTips';
import { isObj, type Rec } from './backupChecks';

/** A day of a saved plan definition: an object with at least one block (or item, the older word). */
const dayHasWork = (d: unknown): boolean => {
  if (!isObj(d)) return false;
  const blocks = Array.isArray(d.blocks) ? d.blocks : Array.isArray(d.items) ? d.items : [];
  return blocks.length > 0 && blocks.every(isObj);
};

/**
 * A generated plan's saved definition, as far as a file can say without this phone's gate: under the
 * row's own id, a generated id, and days that each hold something.
 */
export function definitionShapeOk(d: unknown, rowId: unknown): boolean {
  if (!isObj(d) || typeof d.id !== 'string' || d.id !== rowId || !isGeneratedId(d.id)) return false;
  return Array.isArray(d.days) && d.days.length > 0 && d.days.every(dayHasWork);
}

const dayIndex = (v: unknown): boolean => Number.isInteger(v) && (v as number) >= 0;

/** How many days the plan a pointer names has: from the file first, else a plan this app ships. */
function dayCount(planId: string, fileDays: ReadonlyMap<string, number>): number | undefined {
  const id = (RENAMED_PLAN_IDS as Record<string, string>)[planId] ?? planId;
  // Coach tips never change a plan's day count, so a tuned copy has its base plan's days.
  const base = parseTunedId(id).baseId;
  return fileDays.get(id) ?? fileDays.get(base) ?? planById(id)?.days.length ?? planById(base)?.days.length;
}

/**
 * The plan pointer (PLAN 2.0f): whole day positions, and for a plan the file or this app knows,
 * inside that plan, so Replace never leaves Today pointing at a day that is not there. A plan
 * neither knows keeps its numbers (a newer app's plan), only whole and not negative.
 */
export function planStateOk(rows: Rec[], plans: Rec[] = []): boolean {
  const fileDays = new Map(plans.flatMap((p) => (isObj(p.definition) && Array.isArray(p.definition.days) ? [[p.id as string, p.definition.days.length] as const] : [])));
  return rows.every((r) => {
    const doneDays = r.doneDays as number[];
    const pending = (r.pendingDayIndices ?? []) as number[];
    const partial = (r.partial ?? {}) as Record<string, number>;
    if (!dayIndex(r.nextDayIndex) || !dayIndex(r.weekIndex) || !doneDays.every(dayIndex)) return false;
    if (!Object.keys(partial).every((k) => dayIndex(Number(k)) && /^\d+$/.test(k))) return false;
    const n = dayCount(r.planId as string, fileDays);
    if (n === undefined) return pending.length === 0;
    return (r.nextDayIndex as number) < n && doneDays.every((d) => d < n) && pending.every((d) => d < n) && (r.chosenDayIndex === undefined || (r.chosenDayIndex as number) < n) && Object.keys(partial).every((k) => Number(k) < n);
  });
}
