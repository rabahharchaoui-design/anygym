// PLAN Q3a0: each of Quick's eight targets as a workout from the existing pieces, or an explicit
// "not available" with its reason (never a padded workout, never a nearer day under the target's name).
import { describe, expect, it } from 'vitest';
import { QUICK_DEPS } from '../../data/quick';
import { equipmentPreset } from '../../db/gyms';
import { GYM_TYPE_OF, presetEquipment } from '../intake/funnel';
import type { GymKit } from '../picker';
import { QUICK_TARGETS, targetMenu, type TrainTargetId } from '../quickCards';
import { fits } from '../quickShow';
import type { QuickDeps, QuickInput } from '../quick';
import { buildTarget, missingWords } from '../quickTargets';

const kitOf = (place: 'full' | 'hotel' | 'home'): GymKit => ({ equipment: presetEquipment(place), dumbbellRange: equipmentPreset(GYM_TYPE_OF[place], 'lb').dumbbellRange });
const input = (gym: GymKit, minutes: number): QuickInput => ({ base: { goals: ['muscle'], gym, experience: '1_2y' }, minutes, recent: [] });
const build = (t: TrainTargetId, gym: GymKit, minutes: number, deps: QuickDeps = QUICK_DEPS) => buildTarget({ id: t, builds: t }, input(gym, minutes), deps);
const TITLE: Record<Exclude<TrainTargetId, 'abs'>, string> = { push: 'Push day', pull: 'Pull day', legs: 'Leg day', chest: 'Chest day', back: 'Back day', full: 'Full body circuit' };

describe('Q3a0: targets that build at a full gym', () => {
  for (const minutes of [30, 45, 60])
    it(`${minutes} min: push, pull, legs, chest, back and full body each build their own day, inside the minutes`, () => {
      for (const t of Object.keys(TITLE) as (keyof typeof TITLE)[]) {
        const r = build(t, kitOf('full'), minutes);
        expect(r.ok, `${t} ${minutes}`).toBe(true);
        if (!r.ok) continue;
        expect(r.concept.title).toBe(TITLE[t]);
        expect(fits(r.concept.minutes, minutes)).toBe(true);
        expect(r.concept.items.length).toBeGreaterThan(0);
        // Only moves with a sure demo (the Quick pool's gate).
        for (const it of r.concept.items) expect(QUICK_DEPS.usable(it.id), it.id).toBe(true);
      }
    });
});

describe('Q3a0: not available, with the reason', () => {
  it('Abs: fewer than 3 sure core moves today, so not available (never padded with other moves)', () => {
    for (const minutes of [15, 30, 45, 60]) {
      const r = build('abs', kitOf('full'), minutes);
      expect(r).toMatchObject({ ok: false, target: 'abs', reason: 'few-moves' });
      if (!r.ok) expect(r.words).toBe(missingWords('abs', 'few-moves', minutes));
    }
  });
  it('Abs builds core moves only once more core demos are approved (a fake approved set)', () => {
    const more = new Set(['Hanging_Leg_Raise', 'Cable_Crunch', 'Reverse_Crunch', 'dead-bug']);
    const approved: QuickDeps = { ...QUICK_DEPS, usable: (id) => QUICK_DEPS.usable(id) || more.has(id) };
    const r = build('abs', kitOf('full'), 15, approved);
    expect(r.ok).toBe(true);
    if (r.ok) for (const it of r.concept.items) expect(approved.profile(it.id).pattern).toBe('core');
  });
  it('a hotel: Chest and Back are not available (never a Push or Pull day under their names); Push and Pull build', () => {
    for (const t of ['chest', 'back'] as const) expect(build(t, kitOf('hotel'), 45)).toMatchObject({ ok: false, reason: 'few-moves' });
    expect(build('push', kitOf('hotel'), 45)).toMatchObject({ ok: true, concept: { title: 'Push day' } });
    expect(build('pull', kitOf('hotel'), 45)).toMatchObject({ ok: true, concept: { title: 'Pull day' } });
  });
  it('a full gym at 15 min: Chest does not fit, and says to try another time', () => {
    const r = build('chest', kitOf('full'), 15);
    expect(r).toMatchObject({ ok: false, reason: 'no-fit', words: 'Chest does not fit 15 min here. Try another time.' });
  });
  it('a home gym: no pull moves we can show, so Pull is not available', () => {
    expect(build('pull', kitOf('home'), 45)).toMatchObject({ ok: false, reason: 'few-moves', words: 'Not enough moves we can show you here for a pull workout.' });
  });
});

describe('Q3a0: the menu entries', () => {
  it('every menu entry gets a result in menu order; Best for today builds what it points at', () => {
    const menu = targetMenu([], Date.now()).targets;
    const out = menu.map((e) => buildTarget(e, input(kitOf('full'), 45), QUICK_DEPS));
    expect(out.map((r) => r.target)).toEqual([...QUICK_TARGETS]);
    // No history: Best for today is Full body.
    expect(out[0]).toMatchObject({ ok: true, target: 'best', builds: 'full', concept: { title: 'Full body circuit' } });
  });
});
