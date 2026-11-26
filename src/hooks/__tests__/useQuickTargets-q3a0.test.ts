// PLAN Q3a0: the hook the Q3a1 target rows read. The node test runner has no DOM, so React's hooks are
// stood in for by a tiny one component harness (state slots, effects run once, memos recomputed).
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const slots: unknown[] = [];
let at = 0;
let effects: (() => void)[] = [];
const ranEffects = new Set<number>();
vi.mock('react', () => ({
  useState: <T,>(init: T | (() => T)) => {
    const i = at++;
    if (!(i in slots)) slots[i] = typeof init === 'function' ? (init as () => T)() : init;
    return [slots[i] as T, (v: T) => (slots[i] = v)];
  },
  useEffect: (fn: () => void) => {
    const i = at++;
    if (!ranEffects.has(i)) {
      ranEffects.add(i);
      effects.push(fn);
    }
  },
  useMemo: <T,>(fn: () => T) => (at++, fn()),
}));

const { db } = await import('../../db/schema');
const { QUICK_DEPS } = await import('../../data/quick');
const { presetEquipment } = await import('../../lib/intake/funnel');
const { useQuickTargets } = await import('../useQuickTargets');
const { QUICK_TARGETS } = await import('../../lib/quickCards');
type Input = import('../../lib/quick').QuickInput;

const HOUR = 60 * 60 * 1000;
const input: Input = { base: { goals: ['muscle'], gym: { equipment: presetEquipment('full'), dumbbellRange: { min: 5, max: 100, step: 5 } }, experience: '1_2y' }, minutes: 45, recent: [] };

/** One render: hooks in order, then the effects that are new this render. */
function render() {
  at = 0;
  effects = [];
  const out = useQuickTargets(input, QUICK_DEPS);
  for (const fn of effects) fn();
  return out;
}

beforeEach(async () => {
  // Noon, so 26 hours ago is yesterday in the phone's local days.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 22, 12));
  slots.length = 0;
  ranEffects.clear();
  await db.open();
  await db.sessions.clear();
  await db.sets.clear();
});

afterEach(() => vi.useRealTimers());

describe('Q3a0: useQuickTargets', () => {
  it('nothing until the log is read, then the eight rows in menu order, each with a build', async () => {
    expect(render().rows).toBeNull();
    await vi.waitFor(() => expect(render().rows).not.toBeNull());
    const { rows, failed } = render();
    expect(failed).toBe(false);
    expect(rows!.map((r) => r.entry.id)).toEqual([...QUICK_TARGETS]);
    expect(rows!.every((r) => r.build.target === r.entry.id)).toBe(true);
    // No history: no claims, Best for today is Full body with its line.
    expect(rows!.every((r) => !r.entry.recommended && !r.entry.fact)).toBe(true);
    expect(rows![0]!.entry.line).toBe('Log a workout and I will steer you.');
  });

  it('chest trained yesterday: the Chest row is dimmed with its fact, its workout still builds', async () => {
    const start = Date.now() - 26 * HOUR;
    await db.sessions.put({ id: 'w', gymId: 'g', startedAt: start, endedAt: start + HOUR, imported: false });
    await db.sets.bulkPut([0, 1, 2].map((order) => ({ id: `s${order}`, sessionId: 'w', exerciseId: 'dumbbell-bench-press', order, kind: 'work' as const, reps: 8, load: { kind: 'bodyweight' as const, unit: 'lb' as const, total: 0 }, uncertain: false })));
    render();
    await vi.waitFor(() => expect(render().rows).not.toBeNull());
    const chest = render().rows!.find((r) => r.entry.id === 'chest')!;
    expect(chest.entry).toMatchObject({ dimmed: true, recommended: false });
    expect(chest.entry.fact).toBe('Trained yesterday');
    expect(chest.build).toMatchObject({ ok: true, concept: { title: 'Chest day' } });
    expect(render().rows!.filter((r) => r.entry.recommended).length).toBeGreaterThan(0);
  });
});
