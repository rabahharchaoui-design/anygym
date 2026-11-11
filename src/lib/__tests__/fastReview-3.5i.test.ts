// PLAN 3.5i: the fast review's pure rules: the two piles from the pre check file, the grid's
// screens of 9, the rows Approve writes, the button's words, the deck's place and the stored place.
import { describe, expect, it } from 'vitest';
import { GRID, NO_PRECHECK, START_PLACE, approveLabel, deckProgress, gridScreen, mainMuscles, marksOn, parsePlace, parsePrecheck, screenRows, screenText, splitPiles, toggleWrong, type Marks } from '../candidates/fastReview';

const ids = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `m${String(from + i).padStart(3, '0')}`);

describe('pile routing from the pre check file', () => {
  it('a missing, empty or broken file sends everything to the grid', () => {
    const order = ids(288);
    for (const file of [undefined, null, 7, 'x', {}, { checkCarefully: 'no' }, { checkCarefully: [] }, NO_PRECHECK]) {
      const piles = splitPiles(order, parsePrecheck(file));
      expect(piles.careful).toEqual([]);
      expect(piles.grid).toEqual(order);
    }
  });

  it('listed ids go to Check carefully (in the review order), all the others to the grid; unknown ids are ignored', () => {
    const order = ids(20);
    const pre = parsePrecheck({ checkCarefully: ['m007', 'm002', 'm002', 'nope', 5], notes: { m002: ' Looks like a cable, not a dumbbell ', m007: '', x: 3 } });
    expect(pre.checkCarefully).toEqual(['m007', 'm002', 'nope']);
    expect(pre.notes).toEqual({ m002: 'Looks like a cable, not a dumbbell' });
    const piles = splitPiles(order, pre);
    expect(piles.careful).toEqual(['m002', 'm007']);
    expect(piles.grid).toHaveLength(18);
    expect([...piles.careful, ...piles.grid].sort()).toEqual(order);
  });
});

describe('grid batching', () => {
  it('288 moves are 32 screens of 9', () => {
    const g = gridScreen(ids(288), new Set());
    expect(GRID).toBe(9);
    expect(g.ids).toEqual(ids(9));
    expect(g.next).toEqual(ids(9, 9));
    expect(screenText(g)).toBe('Screen 1 of 32');
  });

  it('decided moves are skipped: the 5 approved earlier never show again, every screen is still full', () => {
    const pile = ids(288);
    const decided = new Set(['m000', 'm003', 'm004', 'm010', 'm200']);
    const g = gridScreen(pile, decided);
    expect(g.ids).toEqual(['m001', 'm002', 'm005', 'm006', 'm007', 'm008', 'm009', 'm011', 'm012']);
    expect(g.ids.some((id) => decided.has(id))).toBe(false);
    expect(g.screens).toBe(32);
  });

  it('resume: after n screens are saved the next screen is n + 1, and the last one holds the rest', () => {
    const pile = ids(30);
    const decided = new Set<string>();
    const seen: string[][] = [];
    for (;;) {
      const g = gridScreen(pile, decided);
      if (!g.ids.length) break;
      expect(g.screen).toBe(seen.length + 1);
      expect(g.screens).toBe(4);
      seen.push(g.ids);
      g.ids.forEach((id) => decided.add(id));
    }
    expect(seen.map((s) => s.length)).toEqual([9, 9, 9, 3]);
    expect(seen.flat()).toEqual(pile);
  });
});

describe('a screen: marks, rows and the button', () => {
  const screen = ids(9);
  it('everything starts approved; a tap marks Wrong, a second tap clears it', () => {
    let marks: Marks = {};
    expect(approveLabel(screen, marks)).toBe('Approve 9');
    marks = toggleWrong(marks, 'm001');
    marks = toggleWrong(marks, 'm004');
    expect(approveLabel(screen, marks)).toBe('Approve 7, 2 wrong');
    marks = toggleWrong(marks, 'm001');
    expect(approveLabel(screen, marks)).toBe('Approve 8, 1 wrong');
    expect(approveLabel(screen, Object.fromEntries(screen.map((id) => [id, { decision: 'wrong' }])) as Marks)).toBe('Save 9 wrong');
  });

  it('Approve writes one row per tile: approve unless marked; a Fix keeps its reason and note', () => {
    const marks: Marks = { m001: { decision: 'wrong' }, m002: { decision: 'fix', reason: 'gear', note: ' a cable ' }, stale: { decision: 'wrong' } };
    const rows = screenRows(screen, marksOn(screen, marks), 42);
    expect(rows).toHaveLength(9);
    expect(rows.map((r) => r.id)).toEqual(screen);
    expect(rows.filter((r) => r.decision === 'approve')).toHaveLength(7);
    expect(rows[1]).toEqual({ id: 'm001', decision: 'wrong', at: 42 });
    expect(rows[2]).toEqual({ id: 'm002', decision: 'fix', reason: 'gear', note: 'a cable', at: 42 });
  });

  it('the tile chip shows the main muscles only', () => {
    expect(mainMuscles('Chest, triceps · Front delts')).toBe('Chest, triceps');
    expect(mainMuscles('Abs')).toBe('Abs');
    expect(mainMuscles(undefined)).toBe('');
  });
});

describe('the deck place and the stored place', () => {
  it('progress is the card on top, of the whole pile', () => {
    const pile = ids(288);
    expect(deckProgress(pile, new Set())).toBe('1 of 288');
    expect(deckProgress(pile, new Set(ids(22)))).toBe('23 of 288');
    expect(deckProgress(pile, new Set(pile))).toBe('288 of 288');
  });

  it('a stored place is read back exactly; anything broken starts fresh in the grid', () => {
    const place = { mode: 'deck', marks: { a: { decision: 'wrong' }, b: { decision: 'fix', reason: 'photo', note: 'blurry' } } };
    expect(parsePlace(JSON.parse(JSON.stringify(place)))).toEqual(place);
    expect(parsePlace(null)).toEqual(START_PLACE);
    expect(parsePlace({ mode: 'sideways', marks: { a: { decision: 'approve' }, b: { decision: 'fix', reason: 'nope' }, c: 4 } })).toEqual(START_PLACE);
  });
});
