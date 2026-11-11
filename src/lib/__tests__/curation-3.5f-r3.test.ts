// PLAN 3.5f round 3. B1: the deck's pool for a slot is Replace's own list for that slot (the same
// gym, no sure demo asked for), minus moves already in the workout and the ones the user hid, then
// close patterns; the honest end only when it is truly empty. B4: an idea card's words and mini map
// come from the exercises it holds, and its first card is what the name promises.
import { describe, expect, it } from 'vitest';
import { MUSCLE_MAP_REGIONS, QUICK_DEPS, workoutMuscles } from '../../data/quick';
import { SWAP_DATA } from '../../data/patterns';
import { profileFor } from '../../data/order';
import { EQUIPMENT_IDS } from '../../db/types';
import type { GymKit } from '../picker';
import { muscleWord } from '../order';
import { buildIdeas, optionKey, swapPool, type QuickItem, type SwapContext } from '../quick';
import { replaceOptions } from '../curation';
import { patternOf, swapCandidates, workoutIdOf, type Pattern } from '../swap';

const FULL: GymKit = { equipment: [...EQUIPMENT_IDS], dumbbellRange: { min: 5, max: 100, step: 5 } };
// The hotel preset (db/gyms.ts equipmentPreset 'hotel').
const HOTEL: GymKit = { equipment: ['dumbbells', 'adjustable_bench', 'cable_station', 'treadmill', 'bike'], dumbbellRange: { min: 5, max: 50, step: 5 } };
const item = (id: string): QuickItem => ({ id, slot: id, origin: id, name: QUICK_DEPS.name(id), pattern: patternOf(SWAP_DATA, id) as Pattern, sets: 3, reps: [8, 12], restSec: 120, why: '' });
const ctxOf = (gym: GymKit, hidden: readonly string[] = []): SwapContext => {
  const never = new Set(hidden.map(SWAP_DATA.sameAs));
  return { data: SWAP_DATA, gym, ok: (id) => !never.has(SWAP_DATA.sameAs(id)), profile: (id) => profileFor(id), nameOf: QUICK_DEPS.name };
};
const key = (id: string) => optionKey(QUICK_DEPS.name(id));

/** What Replace lists for the slot in a workout holding `others` (useWorkout.swapChoices). */
const replaceList = (slot: string, gym: GymKit, others: readonly string[]) => swapCandidates(SWAP_DATA, slot, gym, { mode: 'reps', exclude: [...others, slot] }).map(workoutIdOf);

describe('3.5f round 3 (B1): the deck draws from the Replace pool', () => {
  const slots = ['dumbbell-bench-press', 'deadlift', 'barbell-back-squat', 'romanian-deadlift', 'lat-machine-wide-grip-pulldown', 'dumbbell-lateral-raise'];
  for (const [g, gym] of [
    ['hotel', HOTEL],
    ['full', FULL],
  ] as const)
    for (const slot of slots) {
      if (!patternOf(SWAP_DATA, slot)) continue;
      it(`${g}: ${slot}: deck pool = Replace pool minus the workout and hidden moves`, () => {
        const card = item(slot);
        const replace = replaceList(slot, gym, []);
        // One move of the list is already in the workout, another one is hidden.
        const inWorkout = replace[1] ? item(replace[1]) : null;
        const hidden = replace[2] ? [replace[2]] : [];
        const items = inWorkout ? [card, inWorkout] : [card];
        const deck = swapPool(card, items, [], ctxOf(gym, hidden)).filter((o) => !o.close).map((o) => o.id);
        expect(deck).toEqual(replaceOptions(card, items, [], ctxOf(gym, hidden)));
        const expected = replaceList(slot, gym, items.map((x) => x.id)).filter((id) => !hidden.includes(id));
        // Every deck move is on Replace's list; every Replace move is in the deck (one name per option).
        for (const id of deck) expect(expected, id).toContain(id);
        for (const id of expected) expect(deck.some((d) => d === id || key(d) === key(id)), id).toBe(true);
        if (inWorkout) expect(deck).not.toContain(inWorkout.id);
        for (const h of hidden) expect(deck).not.toContain(h);
      });
    }

  it('hotel gym: a left on Dumbbell Bench Press brings another move, and 3 lefts still leave options or say the honest end', () => {
    const bench = item('dumbbell-bench-press');
    const pool = swapPool(bench, [bench], [], ctxOf(HOTEL));
    // Replace lists push ups here (no sure demo yet: the card says "No demo for this one yet").
    expect(pool.length).toBeGreaterThanOrEqual(replaceList(bench.id, HOTEL, []).length);
    expect(pool.length).toBeGreaterThanOrEqual(2);
    expect(pool[0]!.close).toBe(false);
  });
});

describe('3.5f round 3 (B4): an idea card says what it holds', () => {
  for (const [g, gym] of [
    ['hotel', HOTEL],
    ['full', FULL],
  ] as const)
    for (const minutes of [30, 45, 60])
      it(`${g} ${minutes} min: the pairs line leads with the first card's muscle, every word it names is lit on the map`, () => {
        const ideas = buildIdeas({ base: { goals: ['muscle'], experience: '1_2y', gym }, minutes, recent: [] }, QUICK_DEPS);
        const cards = [...ideas.cards, ...ideas.more];
        for (const c of cards) {
          const lit = new Set(Object.keys(workoutMuscles(c.items.map((it) => it.id))?.shading ?? {}));
          const first = muscleWord(profileFor(c.items[0]!.id).targets[0]!);
          if (c.id === 'pump') {
            expect(c.line.toLowerCase().startsWith(first), `${c.line} / ${c.items[0]!.name}`).toBe(true);
            const named = c.line.replace(/ pairs$/, '').toLowerCase().split(/, | and /);
            for (const w of named) {
              const regions = (Object.keys(MUSCLE_MAP_REGIONS) as (keyof typeof MUSCLE_MAP_REGIONS)[]).filter((m) => muscleWord(m) === w).flatMap((m) => MUSCLE_MAP_REGIONS[m]);
              expect(regions.some((r) => lit.has(r)), `${c.line}: ${w} lit`).toBe(true);
            }
          }
          if (c.focus) expect(c.focus.toLowerCase().startsWith(first), `${c.focus} / ${c.items[0]!.name}`).toBe(true);
        }
      });
});
