import { describe, expect, it } from 'vitest';
import catalog from '../../../data/catalog.json';
import cueFile from '../../../data/exercise-cues.json';
import exerciseMap from '../../../data/exercise-map.json';
import type { MapEntry } from '../catalog';
import { MAX_CUE_WORDS, exerciseInfo, firstLine, validateCues, wordCount, type CatalogImages, type CueFile } from '../exerciseInfo';
import { infoForPlan } from '../../data/exerciseInfo';

const MAP = exerciseMap as MapEntry[];
const CUES = cueFile as CueFile;
const CAT = new Map((catalog as { exercises: CatalogImages[] }).exercises.map((e) => [e.id, e]));
const mapped = MAP.filter((m) => m.match !== 'none');
const none = MAP.filter((m) => m.match === 'none');

describe('exercise cues file (SPEC 4.4)', () => {
  it('is valid against the catalog and the map', () => {
    expect(validateCues(CUES, MAP, CAT)).toEqual([]);
  });

  it('every cue and watch out line is under 12 words', () => {
    for (const [id, e] of Object.entries(CUES.exercises)) {
      for (const c of [...e.cues, ...(e.watchOut ? [e.watchOut] : [])]) {
        expect(wordCount(c.text), `${id}: ${c.text}`).toBeLessThan(12);
      }
    }
    expect(MAX_CUE_WORDS).toBe(11);
  });

  it('every from index exists in the source instructions', () => {
    for (const [id, e] of Object.entries(CUES.exercises)) {
      const n = CAT.get(id)!.instructions.length;
      for (const c of [...e.cues, ...(e.watchOut ? [e.watchOut] : [])]) {
        expect(c.from.length, `${id}: ${c.text}`).toBeGreaterThan(0);
        for (const i of c.from) expect(i >= 0 && i < n, `${id} line ${i}`).toBe(true);
      }
    }
  });

  it('every exact and variant exercise has 1 to 3 cues and a good for line', () => {
    expect(mapped.length).toBeGreaterThan(0);
    for (const m of mapped) {
      const info = infoForPlan(m.planId);
      expect(info.cues.length, m.planId).toBeGreaterThanOrEqual(1);
      expect(info.cues.length, m.planId).toBeLessThanOrEqual(3);
      expect(info.goodFor, m.planId).toBeTruthy();
      expect(info.demo, m.planId).not.toBeNull();
    }
  });

  it('a variant shows its map cue first in the collapsed line', () => {
    const variants = mapped.filter((m) => m.match === 'variant');
    expect(variants.length).toBeGreaterThan(0);
    for (const v of variants) {
      const info = infoForPlan(v.planId);
      expect(info.variantNote).toBe(v.cue);
      expect(firstLine(info)).toBe(v.cue);
    }
    const exact = mapped.find((m) => m.match === 'exact')!;
    const info = infoForPlan(exact.planId);
    expect(info.variantNote).toBeNull();
    expect(firstLine(info)).toBe(info.cues[0]);
  });

  it('flags a long cue and a missing source line', () => {
    const id = mapped[0]!.catalogId!;
    const bad: CueFile = { exercises: { ...CUES.exercises, [id]: { cues: [{ text: 'one two three four five six seven eight nine ten eleven twelve', from: [999] }], goodFor: 'x' } } };
    const problems = validateCues(bad, MAP, CAT);
    expect(problems.some((p) => p.includes('12 words'))).toBe(true);
    expect(problems.some((p) => p.includes('line 999'))).toBe(true);
  });
});

describe('match none (SPEC 4.3)', () => {
  it('shows no photos, no muscle map, no catalog cues', () => {
    expect(none.length).toBeGreaterThan(0);
    for (const m of none) {
      const info = infoForPlan(m.planId);
      expect(info.match).toBe('none');
      expect(info.demo).toBeNull();
      expect(info.muscles).toBeNull();
      expect(info.cues).toEqual([]);
      expect(info.watchOut).toBeNull();
      expect(info.goodFor).toBeNull();
      expect(firstLine(info)).toBeNull();
    }
  });

  it('text cues come only from the plan notes', () => {
    const info = infoForPlan(none[0]!.planId, ['Pause 2 seconds at the bottom', '  ']);
    expect(info.cues).toEqual(['Pause 2 seconds at the bottom']);
  });

  it('an unknown exercise or a catalog id mismatch is not sure either', () => {
    expect(infoForPlan('no-such-exercise').demo).toBeNull();
    const m = mapped[0]!;
    const other = [...CAT.values()].find((c) => c.id !== m.catalogId)!;
    const info = exerciseInfo(m, other, CUES.exercises[m.catalogId!], null);
    expect(info.demo).toBeNull();
    expect(info.cues).toEqual([]);
  });
});
