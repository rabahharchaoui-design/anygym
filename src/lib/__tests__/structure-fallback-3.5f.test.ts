// PLAN 3.5f round 2 (3, smart structure): a day for an area degrades honestly instead of vanishing.
// The best sure compound leads; with fewer than 3 sure moves for the area the card is the nearest
// honest day (a push day led by the one sure chest press) with its curated reason line; when G
// approves candidates (a fake approved set here) the pool grows by itself through the candidate gate.
import { describe, expect, it } from 'vitest';
import { QUICK_DEPS } from '../../data/quick';
import { factById } from '../../data/coachFacts';
import { profileFor } from '../../data/order';
import { equipmentPreset } from '../../db/gyms';
import { GYM_TYPE_OF, presetEquipment } from '../intake/funnel';
import type { GymKit } from '../picker';
import { FALLBACK_RULES, SESSION_AREAS, hardSetsBy, isCompound, sessionTitle } from '../order';
import { fill } from '../coachFacts';
import { QUICK_MINUTES, focusCard, focusCards, quickTitleOf, type QuickDeps } from '../quick';

const PLACES = ['full', 'hotel', 'home', 'outdoors', 'mix'] as const;
const kitOf = (place: (typeof PLACES)[number]): GymKit => ({ equipment: presetEquipment(place), dumbbellRange: equipmentPreset(GYM_TYPE_OF[place], 'lb').dumbbellRange });
const DUMBBELLS: GymKit = { equipment: ['dumbbells', 'adjustable_bench'] as never, dumbbellRange: { min: 5, max: 50, step: 5 } };
const BODYWEIGHT: GymKit = { equipment: [], dumbbellRange: null as never };

const FLAT_BENCH = 'Barbell_Bench_Press_-_Medium_Grip';
const DB_BENCH = 'dumbbell-bench-press';
const PUSH_UPS = 'Pushups';
/** A fake set of candidates G approved (their demos reviewed): only the candidate gate changes. */
const APPROVED = new Set([FLAT_BENCH, PUSH_UPS, 'Incline_Push-Up', 'Dumbbell_Flyes', 'Incline_Dumbbell_Flyes']);
const approved: QuickDeps = { ...QUICK_DEPS, usable: (id) => QUICK_DEPS.usable(id) || APPROVED.has(id) };

const input = (gym: GymKit, minutes: number, experience: '1_2y' | '3y' | 'new' = '1_2y') => ({ base: { goals: ['muscle' as const], gym, experience }, minutes, recent: [] });

describe('3.5f round 2: chest leads with the best gear the gym has', () => {
  it('approved: flat barbell bench leads a full gym, dumbbells a dumbbell gym, push ups a bodyweight gym', () => {
    for (const minutes of QUICK_MINUTES) {
      expect(focusCard('chest', input(kitOf('full'), minutes), approved)?.items[0]?.id, `full ${minutes}`).toBe(FLAT_BENCH);
      expect(focusCard('chest', input(DUMBBELLS, minutes), approved)?.items[0]?.id, `dumbbells ${minutes}`).toBe(DB_BENCH);
      expect(focusCard('chest', input(BODYWEIGHT, minutes), approved)?.items[0]?.id, `bodyweight ${minutes}`).toBe(PUSH_UPS);
    }
  });

  it('the ladder order holds wherever both are there: barbell before dumbbells before push ups', () => {
    const rank = [FLAT_BENCH, DB_BENCH, PUSH_UPS];
    for (const place of PLACES)
      for (const gym of [kitOf(place), DUMBBELLS, BODYWEIGHT])
        for (const minutes of QUICK_MINUTES) {
          const c = focusCard('chest', input(gym, minutes), approved);
          if (!c) continue;
          const lead = rank.indexOf(c.items[0]!.id);
          // Nothing better on the ladder that this gym has is left out of the lead.
          for (const better of rank.slice(0, Math.max(0, lead))) expect(c.items.some((it) => it.id === better), `${place} ${minutes}: ${better} before ${c.items[0]!.id}`).toBe(false);
        }
  });

  it('approving candidates turns a hotel push day into a real chest day by itself', () => {
    const before = focusCard('chest', input(kitOf('hotel'), 30), QUICK_DEPS)!;
    expect(before.title).toBe('Push day');
    const after = focusCard('chest', input(kitOf('hotel'), 30), approved)!;
    expect(after.title).toBe('Chest day');
    expect(after.items.filter((it) => profileFor(it.id).targets.includes('chest')).length).toBeGreaterThanOrEqual(3);
  });
});

describe('3.5f round 2: fewer than 3 sure moves for an area: the nearest honest day', () => {
  it('a hotel chest day is a push day led by its one sure chest press, saying why from the curated file', () => {
    for (const minutes of QUICK_MINUTES) {
      const c = focusCard('chest', input(kitOf('hotel'), minutes), QUICK_DEPS);
      expect(c, `hotel ${minutes}`).not.toBeNull();
      expect(c!.title).toBe('Push day');
      expect(c!.variant).toBe(FALLBACK_RULES.chest.id);
      expect(c!.items[0]!.id).toBe(DB_BENCH);
      expect(isCompound(profileFor(c!.items[0]!.id))).toBe(true);
      expect(c!.line).toBe(fill(factById('idea-fewer')!.line, { muscle: 'chest', name: c!.items[0]!.name }));
      expect(c!.minutes).toBeLessThanOrEqual(minutes);
      expect(quickTitleOf(`focus:${c!.variant}`)).toBe('Push day');
    }
  });

  it('every area day on every preset and length: a sure compound first, in time, never over 10 hard sets a muscle, a nearest day only once', () => {
    for (const place of PLACES)
      for (const experience of ['new', '1_2y', '3y'] as const)
        for (const minutes of QUICK_MINUTES) {
          const cards = focusCards(input(kitOf(place), minutes, experience), QUICK_DEPS);
          expect(new Set(cards.map((c) => c.title)).size, `${place} ${minutes}`).toBe(cards.length);
          for (const c of cards) {
            const label = `${place} ${experience} ${minutes} ${c.title}`;
            expect(isCompound(profileFor(c.items[0]!.id)), label).toBe(true);
            expect(c.items.every((it) => QUICK_DEPS.usable(it.id)), label).toBe(true);
            expect(c.minutes, label).toBeLessThanOrEqual(minutes);
            for (const [, n] of hardSetsBy(c.items.map((it) => ({ sets: it.sets, profile: profileFor(it.id) })))) expect(n, label).toBeLessThanOrEqual(10);
            expect(sessionTitle(c.variant!), label).toBe(c.title);
          }
        }
  });

  it('no sure big lift for an area at all: no card (never padded with unsure moves)', () => {
    for (const area of SESSION_AREAS) expect(focusCard(area, input(BODYWEIGHT, 30), QUICK_DEPS), area).toBeNull();
  });
});
