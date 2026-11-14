import { describe, expect, it } from 'vitest';
import { focusNotYet } from '../focusServed';
import { generate } from '../generator';
import { FOCUS_PICKS } from '../../lib/intake/options';
import { generatorInputOf } from '../../lib/intake/yourPlan';

describe('focusNotYet (PLAN 3.6f)', () => {
  it('names exactly the choices a full gym plan reports as having no sure move', () => {
    const notYet = focusNotYet();
    expect(notYet.has('balance')).toBe(false);
    expect(notYet.has('mobility')).toBe(false);
    for (const { id } of FOCUS_PICKS) {
      if (id === 'balance' || id === 'mobility') continue;
      const built = generate(generatorInputOf({ goal: 'muscle', goals: ['muscle'], days: 4, minutes: 60, experience: '3y', place: 'full', equipmentFor: 'full', focusPicks: [id] } as never));
      if (!built.ok) throw new Error(`no plan for ${id}`);
      const result = built.applied.focusReport!.priorities.find((p) => p.id === id)!;
      expect(notYet.has(id), id).toBe(result.noMove === true);
    }
  });
});
