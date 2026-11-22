// PLAN H1 (2), SPEC 20.3: Quick names only trained (target) muscles. Helpers worked by yesterday's
// bench (triceps, front delts) keep suggestions off them, but no line ever calls them trained or rested.
import { describe, expect, it } from 'vitest';
import { EQUIPMENT_IDS } from '../../db/types';
import { QUICK_DEPS } from '../../data/quick';
import { profileFor } from '../../data/order';
import type { GymKit } from '../picker';
import type { GeneratorInput } from '../generator';
import { muscleWord, type Muscle } from '../order';
import { buildConcepts, sureRest } from '../quick';

const FULL: GymKit = { equipment: [...EQUIPMENT_IDS], dumbbellRange: { min: 5, max: 100, step: 5 } };
const base: GeneratorInput = { goals: ['muscle'], experience: '1_2y', gym: FULL };
const NOW = new Date(2026, 10, 22, 12).getTime();
const DAY = 86_400_000;

describe('sureRest', () => {
  it('drops a muscle that worked as a helper after it was last trained, keeps the rest', () => {
    const trained: Partial<Record<Muscle, number>> = { chest: NOW - DAY, triceps: NOW - 5 * DAY, quads: NOW - 4 * DAY };
    expect(sureRest(trained, { triceps: NOW - DAY })).toEqual({ chest: NOW - DAY, quads: NOW - 4 * DAY });
    expect(sureRest(trained, { triceps: NOW - 6 * DAY })).toEqual(trained);
    expect(sureRest(trained, undefined)).toEqual(trained);
  });
});

describe('after a bench only workout yesterday', () => {
  // What the log proves: chest trained yesterday; triceps and front delts only helped.
  const input = { base, minutes: 45, recent: ['chest'] as Muscle[], recentWhen: 'yesterday', lastTrained: { chest: NOW - DAY }, lastHelped: { triceps: NOW - DAY, 'front delts': NOW - DAY } as Partial<Record<Muscle, number>>, now: NOW };

  it("Hit what's fresh skips chest only, by name, and never suggests a move for a tired helper", () => {
    const fresh = buildConcepts(input, QUICK_DEPS).find((c) => c.id === 'fresh');
    expect(fresh).toBeDefined();
    expect(fresh!.line).toBe('Skips chest (trained yesterday)');
    for (const it of fresh!.items) for (const m of profileFor(it.id).targets) expect(['chest', 'triceps', 'front delts'], it.id).not.toContain(m);
  });

  it('no card line names triceps or shoulders as trained or rested', () => {
    for (const c of buildConcepts(input, QUICK_DEPS))
      for (const line of [c.line, ...(c.altLines ?? [])]) {
        expect(line, c.id).not.toMatch(/triceps|shoulders/i);
        if (/trained|rested/.test(line)) expect(line, c.id).not.toMatch(new RegExp(muscleWord('front delts'), 'i'));
      }
  });

  it('a triceps day yesterday: triceps are the trained muscle Skips names', () => {
    const fresh = buildConcepts({ ...input, recent: ['triceps'], lastTrained: { triceps: NOW - DAY }, lastHelped: {} }, QUICK_DEPS).find((c) => c.id === 'fresh');
    expect(fresh!.line).toBe('Skips triceps (trained yesterday)');
  });
});
