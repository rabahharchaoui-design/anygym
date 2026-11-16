// PLAN 3.6p: the 900 seeded intakes of src/lib/__tests__/generator-3.6f-count.test.ts, for the speed
// measurement and the before and after snapshot (run by scripts/perf/*.perf.ts through vitest).
import { equipmentPreset } from '../../src/db/gyms';
import { FOCUS_PARTS, FOCUS_PICKS, type ExperienceId, type FocusPickId, type GoalId } from '../../src/lib/intake/options';
import type { GeneratorInput } from '../../src/lib/generator';

const exps: ExperienceId[] = ['new', 'months', '1_2y', '3y', 'break'];
const goals: GoalId[] = ['muscle', 'strength', 'health', 'fat_loss', 'comeback'];
const ALL = [...new Set(FOCUS_PICKS.map((p) => p.id))].filter((p) => p !== 'balance') as FocusPickId[];
const childOf = (a: FocusPickId, b: FocusPickId) => a !== b && ((FOCUS_PARTS as Record<string, readonly { id: string }[]>)[a]?.some((x) => x.id === b) ?? false);

export function seededInput(count: number, days: number, minutes: number, rep: number): GeneratorInput {
  const seed = count * 1000 + days * 100 + minutes + rep * 7919;
  let rng = seed + 1;
  const random = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) / 4294967296; };
  const pool = [...ALL];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
  const picks: FocusPickId[] = [];
  for (const p of pool) { if (picks.length >= count) break; if (!picks.some((q) => childOf(p, q) || childOf(q, p))) picks.push(p); }
  const gym = equipmentPreset(rep === 2 ? (seed % 2 ? 'hotel' : 'none') : 'full', 'lb');
  return {
    goals: [goals[seed % 5]!], experience: exps[(seed >> 2) % 5]!, days, minutes, focusPicks: picks, scheduleStyle: rep ? 'flexible' : 'fixed', gym,
    never: ['barbell-bicep-curl', 'hip-thrust', 'dumbbell-lateral-raise'], love: ['cable-tricep-pushdown', 'leg-extension'], easyOn: seed % 3 === 0 ? ['lower_back'] : seed % 3 === 1 ? ['knees'] : [],
  };
}

/** All 900, in the test's order. */
export function seededAll(): Array<{ label: string; input: GeneratorInput }> {
  const out: Array<{ label: string; input: GeneratorInput }> = [];
  for (let count = 0; count <= 11; count++) for (const days of [2, 3, 4, 5, 6]) for (const minutes of [20, 30, 45, 60, 75]) for (let rep = 0; rep < 3; rep++) out.push({ label: `${count}/${days}/${minutes}/${rep}`, input: seededInput(count, days, minutes, rep) });
  return out;
}
