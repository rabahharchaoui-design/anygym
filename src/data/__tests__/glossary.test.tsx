import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GLOSSARY, STANDARD_WEIGHT_IDS, VARIES, glossaryEntry } from '../glossary';

// SPEC 13.7: every term listed in the spec has an entry.
const SPEC_TERMS = [
  'olympic-barbell',
  'womens-bar',
  'ez-curl-bar',
  'trap-bar',
  'fixed-barbell',
  'smith-machine',
  'cable-station',
  'rope',
  'straight-bar',
  'v-handle',
  'd-handle',
  'plate-loaded-machine',
  'weight-stack-machine',
  'leg-press',
  'hack-squat',
  'pec-deck',
  'lat-pulldown',
  'seated-row',
  'preacher-bench',
  'adjustable-bench',
  'decline-bench',
  'hyperextension-bench',
  'dip-station',
  'landmine',
  'kettlebell',
  'resistance-band',
  'collars-clips',
  'bumper-vs-iron',
  'pair',
  'warm-up-set',
  'drop-set',
  'rest-timer',
  'reps',
  'sets',
];

describe('glossary (SPEC 13.7)', () => {
  it('covers every SPEC 13.7 term, ids unique', () => {
    const ids = GLOSSARY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of SPEC_TERMS) expect(glossaryEntry(id), id).toBeDefined();
    expect(glossaryEntry('nope')).toBeUndefined();
  });

  it('every entry has an id, a term, one or two sentences, and starts unreviewed', () => {
    for (const e of GLOSSARY) {
      expect(e.id).toMatch(/^[a-z0-9-]+$/);
      expect(e.term.trim().length).toBeGreaterThan(0);
      expect(e.sentences.length).toBeGreaterThanOrEqual(1);
      expect(e.sentences.length).toBeLessThanOrEqual(2);
      for (const s of e.sentences) expect(s.trim().length).toBeGreaterThan(0);
      expect(e.reviewed).toBe(false);
    }
  });

  it('numbers only on the three SPEC 5.3 standards; never a guessed typical weight', () => {
    const standard = new Set<string>(STANDARD_WEIGHT_IDS);
    for (const e of GLOSSARY) {
      for (const s of e.sentences) expect(s, `${e.id} sentence`).not.toMatch(/\d/);
      if (standard.has(e.id)) {
        expect(e.weightLine).toMatch(/\d/);
      } else {
        expect(e.weightLine === null || e.weightLine === VARIES, e.id).toBe(true);
      }
    }
    expect(glossaryEntry('olympic-barbell')!.weightLine).toBe('Olympic bar: 45 lb / 20 kg');
    expect(glossaryEntry('womens-bar')!.weightLine).toBe("Women's bar: 35 lb / 15 kg");
    expect(glossaryEntry('collars-clips')!.weightLine).toBe('Competition collars: 2.5 kg each');
  });

  it('equipment that varies says so', () => {
    for (const id of ['ez-curl-bar', 'trap-bar', 'smith-machine', 'plate-loaded-machine', 'weight-stack-machine']) {
      expect(glossaryEntry(id)!.weightLine).toBe(VARIES);
    }
  });

  it('illustrations render as 160 × 120 line drawings, or are null', () => {
    for (const e of GLOSSARY) {
      if (e.illustration === null) continue;
      const Art = e.illustration;
      const html = renderToStaticMarkup(<Art />);
      expect(html, e.id).toContain('viewBox="0 0 160 120"');
      expect(html).toContain('stroke-width="2"');
      expect(html).toContain('aria-hidden="true"');
    }
  });
});
