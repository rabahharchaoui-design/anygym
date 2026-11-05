// PLAN 3.4a round 2 (Codex review): helpers tired today, the heaviest lift on a pull day, the rest an
// Up next lift brings, and no invented demo tile.
import { describe, expect, it } from 'vitest';
import { profileFor, upNextPool } from '../../data/order';
import { SWAP_DATA } from '../../data/patterns';
import { demoFor } from '../../data/exerciseInfo';
import { heaviestOf, isCompound, restFor, upNextIdeas } from '../order';
import { quickEntry } from '../planWorkout';
import { FULL_GYM, HOTEL_DUMBBELLS } from './fixtures/order-scenarios';

describe('(2) rule 3 in Up next: a helper tired today', () => {
  it('after curls, no row or pull up (they lean on the biceps)', () => {
    for (const curl of ['Dumbbell_Bicep_Curl', 'barbell-bicep-curl']) {
      const ideas = upNextIdeas([profileFor(curl)], upNextPool(FULL_GYM), { sameAs: SWAP_DATA.sameAs }, 20);
      expect(ideas.length).toBeGreaterThan(0);
      for (const i of ideas) if (isCompound(i.profile)) expect(i.profile.helpers, i.profile.id).not.toContain('biceps');
    }
  });

  it('after triceps pushdowns, no bench or overhead press; after back extensions, no free squat', () => {
    const tri = upNextIdeas([profileFor('cable-tricep-pushdown')], upNextPool(FULL_GYM), { sameAs: SWAP_DATA.sameAs }, 20);
    expect(tri.some((i) => i.profile.pattern === 'horizontal push' || i.profile.pattern === 'vertical push')).toBe(false);
    const back = upNextIdeas([profileFor('hyperextension-roman-chair-back-extension')], upNextPool(FULL_GYM), { sameAs: SWAP_DATA.sameAs }, 20);
    expect(back.some((i) => i.profile.id === 'barbell-back-squat')).toBe(false);
  });

  it('a compound done today tires nothing for this rule (bench, then rows are fine)', () => {
    const ideas = upNextIdeas([profileFor('Barbell_Bench_Press_-_Medium_Grip')], upNextPool(FULL_GYM), { sameAs: SWAP_DATA.sameAs });
    expect(ideas[0]!.profile.id).toBe('barbell-bent-over-row');
  });
});

describe('(4) rule 5: the heaviest lift of a pull day', () => {
  it('is its biggest compound, rows and pull ups included', () => {
    expect(heaviestOf(['wide-grip-pull-up', 'barbell-bent-over-row', 'barbell-bicep-curl'].map((id) => profileFor(id)))?.id).toBe('barbell-bent-over-row');
    expect(heaviestOf(['lat-machine-wide-grip-pulldown', 'cable-seated-close-grip-row', 'barbell-bent-over-row'].map((id) => profileFor(id)))?.id).toBe('barbell-bent-over-row');
    expect(heaviestOf(['barbell-bicep-curl', 'crunch'].map((id) => profileFor(id)))).toBeUndefined();
  });
});

describe('(3) an Up next lift brings its rule 6 rest', () => {
  it('quickEntry takes a suggested rest and shows it as the stated rest', () => {
    const e = quickEntry('deadlift', 'Deadlift', 'barbell', 0, restFor(profileFor('deadlift')));
    expect(e).toMatchObject({ restSec: 150, statedRest: 150 });
    expect(quickEntry('deadlift', 'Deadlift', 'barbell', 0, restFor(profileFor('deadlift'), 'strength')).restSec).toBe(180);
    expect(quickEntry('cable-tricep-pushdown', 'Pushdown', 'stack', 0, restFor(profileFor('cable-tricep-pushdown'))).restSec).toBe(75);
    // Without one, the quick workout default and no stated rest (unchanged).
    const plain = quickEntry('deadlift', 'Deadlift', 'barbell', 0);
    expect(plain.restSec).toBe(90);
    expect(plain.statedRest).toBeUndefined();
  });
});

describe('(1) demos: SPEC 4.3 forbids a wrong demo; Up next never invents one', () => {
  it('ideas without a sure match have no demo (the card shows the plain tile, never a photo)', () => {
    expect(demoFor('Dumbbell_Squat')).toBeNull();
    expect(demoFor('Bodyweight_Squat')).toBeNull();
    expect(upNextPool(HOTEL_DUMBBELLS).map((p) => p.id)).toContain('Dumbbell_Squat');
    expect(demoFor('single-arm-dumbbell-row')).not.toBeNull();
  });
});

describe('(5) level: no advanced bodyweight skill unless 2+ years of lifting; plain moves first', () => {
  const all = (ctx = {}) => upNextIdeas([profileFor('dumbbell-bench-press')], upNextPool(HOTEL_DUMBBELLS), { sameAs: SWAP_DATA.sameAs, ...ctx }, 40).map((i) => i.profile.id);
  it('never for a new, months, 1 to 2 years, coming back or unknown lifter', () => {
    for (const experience of [undefined, 'new', 'months', '1_2y', 'break'] as const) {
      const ids = all({ experience });
      expect(ids, String(experience)).not.toContain('Handstand_Push-Ups');
      expect(ids).not.toContain('Natural_Glute_Ham_Raise');
    }
  });
  it('3+ years may get one, but a plain move still leads every pattern', () => {
    const ideas = upNextIdeas([profileFor('Dumbbell_Squat')], upNextPool(HOTEL_DUMBBELLS), { sameAs: SWAP_DATA.sameAs, experience: '3y' });
    expect(ideas.map((i) => i.profile.id)).not.toContain('Handstand_Push-Ups');
    expect(all({ experience: '3y' })).toContain('Handstand_Push-Ups');
  });
});
