// PLAN 3.5f (4) why notes: every card's line comes from data/coach-facts.json (a curated list), no
// note is ever written on the fly, and every card of every kind gets one.
import { describe, expect, it } from 'vitest';
import { COACH_FACTS, FACT_FILE, factById } from '../../data/coachFacts';
import { QUICK_DEPS } from '../../data/quick';
import { SWAP_DATA } from '../../data/patterns';
import { PLANS } from '../../data/plans';
import { profileFor } from '../../data/order';
import { equipmentPreset } from '../../db/gyms';
import { GYM_TYPE_OF, presetEquipment } from '../intake/funnel';
import type { GymKit } from '../picker';
import { FACT_ROLES, aboutNote, fill, notesFor, pickFact, roleAt, swapNote, validateFacts, type CoachFact, type FactWords, type NoteItem } from '../coachFacts';
import { PATTERNS } from '../swap';
import { QUICK_MINUTES, buildIdeas, focusCards, planConcept, swapItem, swapPool, type Concept, type QuickItem } from '../quick';
import { withNotes } from '../quickNotes';

const PLACES = ['full', 'hotel', 'home', 'outdoors', 'mix'] as const;
const kitOf = (place: (typeof PLACES)[number]): GymKit => ({ equipment: presetEquipment(place), dumbbellRange: equipmentPreset(GYM_TYPE_OF[place], 'lb').dumbbellRange });

/** The words a card's line was filled with, read back from the card itself (never trusted from the note). */
function wordsOf(it: QuickItem, items: readonly QuickItem[]): FactWords[] {
  const p = QUICK_DEPS.profileOf(it.id, it.name);
  const read: NoteItem[] = items.map((x) => ({
    profile: QUICK_DEPS.profileOf(x.id, x.name),
    ...(x.group !== undefined ? { group: x.group } : {}),
    ...(x.seconds !== undefined && x.reps === undefined ? { timed: true } : {}),
    ...(x.from ? { swappedFor: { from: x.from, ...(x.close ? { close: true } : {}) } } : x.standsIn ? { standsIn: x.standsIn } : {}),
  }));
  void p;
  return [roleAt(read, items.indexOf(it)).words];
}

function checkCards(cards: readonly Concept[], label: string): number {
  let n = 0;
  for (const c of cards)
    for (const it of c.items) {
      n++;
      const fact = factById(it.fact);
      expect(fact, `${label} ${c.id} ${it.id}: fact ${it.fact}`).toBeDefined();
      const [words] = wordsOf(it, c.items);
      // The line and the two sentences are the file's own text, with only the card's own words filled in.
      expect(it.why, `${label} ${c.id} ${it.id}`).toBe(fill(fact!.line, words!));
      expect(it.more, `${label} ${c.id} ${it.id}`).toBe(fill(fact!.more, words!));
      expect(it.why).not.toMatch(/[{}]/);
      expect(it.more).not.toMatch(/[{}]/);
      expect(it.why.length).toBeGreaterThan(10);
    }
  return n;
}

describe('3.5f (4) the curated list', () => {
  it('is valid: ids, roles, one short line, exactly two more sentences, plain words, nothing medical', () => {
    expect(validateFacts(FACT_FILE, PATTERNS)).toEqual([]);
    expect(COACH_FACTS.length).toBeGreaterThanOrEqual(50);
    // Every pattern has its own "about" fact, and every role a fact.
    for (const p of PATTERNS) expect(COACH_FACTS.some((f) => f.role === 'about' && f.patterns?.includes(p)), p).toBe(true);
    for (const r of FACT_ROLES) expect(COACH_FACTS.some((f) => f.role === r), r).toBe(true);
  });

  it('G’s example is in it, word for word', () => {
    const f = factById('first-chest')!;
    expect(fill(f.line, { name: 'Barbell bench' })).toBe('Barbell bench first: you lift the most weight while fresh, the main driver of chest growth');
  });

  it('the checker catches a bad list', () => {
    const bad = (f: Partial<CoachFact>) => validateFacts({ version: 1, facts: [...COACH_FACTS, { id: 'x-y', role: 'other', line: 'Fine', more: 'One. Two.', ...f }] }, PATTERNS);
    expect(bad({})).toEqual([]);
    expect(bad({ id: 'first-chest' }).join()).toMatch(/used twice/);
    expect(bad({ more: 'Only one sentence.' }).join()).toMatch(/two sentences/);
    expect(bad({ more: 'One. Two. Three.' }).join()).toMatch(/two sentences/);
    expect(bad({ line: 'This prevents injury' }).join()).toMatch(/medical/);
    expect(bad({ line: 'A superset' }).join()).toMatch(/jargon/);
    expect(bad({ line: 'Says {coach}' }).join()).toMatch(/unknown word/);
    expect(bad({ line: 'x'.repeat(91) }).join()).toMatch(/90 characters/);
    expect(bad({ patterns: ['nope' as never] }).join()).toMatch(/unknown pattern/);
    expect(validateFacts({ version: 1, facts: COACH_FACTS.filter((f) => f.id !== 'other-plain') }, PATTERNS).join()).toMatch(/role other: no plain fact/);
  });

  it('never names a person: no capitalised word inside a line but the filled in words', () => {
    for (const f of COACH_FACTS) {
      const bare = `${f.line}. ${f.more}`.replace(/\{\w+\}/g, 'x');
      // A capital only starts a sentence (or the line).
      const inner = bare.replace(/(^|[.!?:]\s+)[A-Z]/g, '$1x');
      expect(inner, f.id).not.toMatch(/[A-Z]/);
    }
  });
});

describe('3.5f (4) every card gets a fact from the file', () => {
  it('every quick card and every area day, on every place preset at 15, 30, 45, 60', () => {
    let n = 0;
    for (const place of PLACES)
      for (const experience of ['new', '1_2y', '3y'] as const)
        for (const minutes of QUICK_MINUTES) {
          const input = { base: { goals: ['muscle' as const], gym: kitOf(place), experience }, minutes, recent: [] };
          const ideas = buildIdeas(input, QUICK_DEPS);
          n += checkCards([...ideas.cards, ...ideas.more, ...focusCards(input, QUICK_DEPS)], `${place} ${experience} ${minutes}`);
        }
    expect(n).toBeGreaterThan(1500);
  });

  it('every plan day card, stand ins included ("Instead of X: why")', () => {
    let standIns = 0;
    for (const plan of PLANS)
      for (const place of ['full', 'hotel'] as const)
        plan.days.forEach((_, dayIndex) => {
          const c = planConcept({ plan, dayIndex, weekIndex: 0, minutes: 45, gym: kitOf(place) }, QUICK_DEPS);
          if (!c) return;
          checkCards([c], `${plan.id} ${dayIndex} ${place}`);
          for (const it of c.items)
            if (it.standsIn) {
              standIns++;
              expect(it.fact).toBe('standin-any');
              expect(it.why).toBe(`Instead of ${it.standsIn.from}: ${it.standsIn.reason}`);
            }
        });
    expect(standIns).toBeGreaterThan(0);
  });

  it('a swapped in card says so with a fact, and the rest of the deck stays true', () => {
    const gym = kitOf('full');
    const input = { base: { goals: ['muscle' as const], gym, experience: '1_2y' as const }, minutes: 45, recent: [] };
    const card = focusCards(input, QUICK_DEPS)[0]!;
    const ctx = { data: SWAP_DATA, gym, ok: (id: string) => QUICK_DEPS.usable(id), profile: QUICK_DEPS.profile, nameOf: QUICK_DEPS.name };
    const at = card.items.findIndex((it) => swapPool(it, card.items, [], ctx).length > 0);
    const item = card.items[at]!;
    const to = swapPool(item, card.items, [], ctx)[0]!;
    const next = withNotes(card.items.map((it, i) => (i === at ? swapItem(item, to.id, QUICK_DEPS.name(to.id), false, item.name, false, to.close) : it)), QUICK_DEPS);
    expect(next[at]!.fact).toBe(to.close ? 'swap-close' : 'swap-same');
    expect(next[at]!.why).toContain(item.name);
    checkCards([{ ...card, items: next }], 'swapped');
  });

  it('roles: the first big lift, a second angle, a finish, a pair, a circuit, a hold, abs last', () => {
    const P = (id: string) => profileFor(id);
    const one = (items: NoteItem[], i: number) => roleAt(items, i).role;
    const bench: NoteItem = { profile: P('barbell-incline-bench-press') };
    const db: NoteItem = { profile: P('dumbbell-bench-press') };
    const push: NoteItem = { profile: P('cable-tricep-pushdown') };
    const curl: NoteItem = { profile: P('barbell-bicep-curl') };
    const crunch: NoteItem = { profile: P('crunch') };
    expect([0, 1, 2, 3, 4].map((i) => one([bench, db, push, curl, crunch], i))).toEqual(['first', 'angle', 'finish', 'isolation', 'late']);
    expect(one([bench, { ...push, group: 0 }, { ...curl, group: 0 }], 1)).toBe('pair');
    expect(roleAt([bench, { ...push, group: 0 }, { ...curl, group: 0 }], 1).words.partner).toBe(P('barbell-bicep-curl').name);
    expect(one([{ ...bench, group: 0 }, { ...push, group: 0 }, { ...curl, group: 0 }], 0)).toBe('circuit');
    expect(one([{ ...crunch, timed: true }], 0)).toBe('hold');
    expect(one([{ ...curl, swappedFor: { from: 'X' } }], 0)).toBe('swap');
    expect(one([{ ...curl, swappedFor: { from: 'X', close: true } }], 0)).toBe('close');
    // The pattern's own fact wins; a fact whose words the card lacks is never picked.
    expect(pickFact(COACH_FACTS, 'first', 'horizontal push', { name: 'A' }).id).toBe('first-chest');
    expect(pickFact(COACH_FACTS, 'first', null, { name: 'A' }).id).toBe('first-plain');
    expect(pickFact(COACH_FACTS, 'first', null, { name: 'A', muscle: 'traps' }).id).toBe('first-any');
    expect(notesFor(COACH_FACTS, [bench])[0]!.fact).toBe('first-chest');
    expect(aboutNote(COACH_FACTS, P('crunch')).fact).toBe('about-core');
    expect(swapNote(COACH_FACTS, P('crunch'), 'Plank').why).toBe('Same movement as Plank, so the workout stays balanced');
  });
});
