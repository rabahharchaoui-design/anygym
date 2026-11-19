// PLAN 4.6a (5): the front delt shape is the side delts too, but an exercise is named by its own
// shoulder part: "front delts" after a bench or overhead press, "side delts" after a lateral raise.
import { describe, expect, it } from 'vitest';
import { musclesForCatalog } from '../../data/muscles';
import { exerciseCount, exercisesForMuscle } from '../../data/muscleExercises';
import { primaryNames } from '../../db/coachData';
import { freshNames } from '../coach';
import { ownShoulderLabel } from '../muscles';
import { freshWords } from '../../screens/today/FreshMuscles';

const BENCH = 'Barbell_Bench_Press_-_Medium_Grip';
const PRESS = 'Seated_Barbell_Military_Press';
const RAISE = 'Side_Lateral_Raise';
const NOW = 1_800_000_000_000;

describe("an exercise's own shoulder word (PLAN 4.6a 5)", () => {
  it('names the shared shape by the part the exercise works, and nothing for other shapes', () => {
    expect(ownShoulderLabel('front-deltoids', musclesForCatalog(BENCH)!)).toBe('front delts');
    expect(ownShoulderLabel('front-deltoids', musclesForCatalog(PRESS)!)).toBe('front delts');
    expect(ownShoulderLabel('front-deltoids', musclesForCatalog(RAISE)!)).toBe('side delts');
    expect(ownShoulderLabel('chest', musclesForCatalog(BENCH)!)).toBeNull();
    // The rear delt shape stands for one part only.
    expect(ownShoulderLabel('back-deltoids', musclesForCatalog('Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench')!)).toBeNull();
  });

  it('the list for front delts holds no lateral raise, the list for side delts no press', () => {
    const front = exercisesForMuscle('front-deltoids', undefined, 'front delts').map((r) => r.id);
    const side = exercisesForMuscle('front-deltoids', undefined, 'side delts').map((r) => r.id);
    expect(front).toContain(PRESS);
    expect(front).not.toContain(RAISE);
    expect(side).toContain(RAISE);
    expect(side).not.toContain(PRESS);
    expect(exerciseCount('front-deltoids', 'front delts') + exerciseCount('front-deltoids', 'side delts')).toBe(exerciseCount('front-deltoids'));
  });

  it('Worked lately says front delts after an overhead press, never front and side delts', () => {
    const names = primaryNames(PRESS);
    expect(names['front-deltoids']).toBe('front delts');
    const words = freshWords(freshNames([{ at: NOW - 3_600_000, regions: ['front-deltoids', 'triceps'], names }], NOW));
    expect(words).toBe('Under 24 h: front delts, triceps');
    expect(words).not.toContain('side');
    const both = freshNames(
      [
        { at: NOW - 3_600_000, regions: ['front-deltoids'], names },
        { at: NOW - 30 * 3_600_000, regions: ['front-deltoids'], names: primaryNames(RAISE) },
      ],
      NOW,
    );
    expect(freshWords(both)).toBe('Under 24 h: front delts. 1 to 2 days: side delts');
  });
});
