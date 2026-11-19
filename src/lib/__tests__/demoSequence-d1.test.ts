import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import shipped from '../../../data/demo-sequences.json';
import catalog from '../../../data/catalog.json';
import { demoWithSequence, frameCount, parseDemoSequences, SEQUENCE_FORMAT, sequencePaths, type DemoSource } from '../demoSequence';
import type { DemoImages } from '../exerciseInfo';

// PLAN D1: a demo may have 2, 3 or 4 frames. Two stays the catalog pair with no declaration; 3 or 4
// is declared with one licensed source record, and is shown only when every frame file is there.

const IDS = new Set(['Dumbbell_Lunges', 'Dead_Bug', 'Dumbbell_Flyes']);
const SOURCE: DemoSource = {
  author: 'A. Person',
  title: 'Lunge, four phases',
  fileUrl: 'https://commons.wikimedia.org/wiki/File:Lunge.jpg',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  license: 'CC BY 4.0',
};
const file = (sequences: Record<string, unknown>) => ({ format: SEQUENCE_FORMAT, sequences });
const pair = (id: string): DemoImages => ({ webp: [`ex/${id}/0.webp`, `ex/${id}/1.webp`], jpg: [`ex/${id}/0.jpg`, `ex/${id}/1.jpg`] });
const all = () => true;
const filesUpTo = (n: number) => (p: string) => Number(/\/(\d)\.(?:jpg|webp)$/.exec(p)![1]) < n;

describe('demo frame list (PLAN D1)', () => {
  it('two frames: no declaration keeps the catalog pair exactly as it is', () => {
    const base = pair('Dumbbell_Lunges');
    expect(demoWithSequence('Dumbbell_Lunges', base, undefined, all)).toBe(base);
    expect(frameCount(base)).toBe(2);
  });

  it('three and four frames, in order, WebP and JPG twins', () => {
    for (const frames of [3, 4] as const) {
      const seqs = parseDemoSequences(file({ Dumbbell_Lunges: { frames, source: SOURCE, samePersonAndSetup: true } }), IDS);
      const demo = demoWithSequence('Dumbbell_Lunges', pair('Dumbbell_Lunges'), seqs.get('Dumbbell_Lunges'), all)!;
      expect(frameCount(demo)).toBe(frames);
      expect(demo.webp).toEqual(Array.from({ length: frames }, (_, i) => `ex/Dumbbell_Lunges/${i}.webp`));
      expect(demo.jpg).toEqual(Array.from({ length: frames }, (_, i) => `ex/Dumbbell_Lunges/${i}.jpg`));
    }
  });

  it('a missing frame file (middle or last, either format) refuses the sequence: no demo, never a hole', () => {
    const seqs = parseDemoSequences(file({ Dead_Bug: { frames: 4, source: SOURCE, samePersonAndSetup: true } }), IDS);
    const entry = seqs.get('Dead_Bug');
    expect(entry?.ok).toBe(true);
    const base = pair('Dead_Bug');
    expect(demoWithSequence('Dead_Bug', base, entry, (p) => p !== 'ex/Dead_Bug/2.webp')).toBeNull();
    expect(demoWithSequence('Dead_Bug', base, entry, (p) => p !== 'ex/Dead_Bug/1.jpg')).toBeNull();
    expect(demoWithSequence('Dead_Bug', base, entry, filesUpTo(3))).toBeNull();
    expect(demoWithSequence('Dead_Bug', base, entry, filesUpTo(4))?.webp).toHaveLength(4);
  });

  it('a hidden or unsure demo stays hidden whatever is declared', () => {
    const seqs = parseDemoSequences(file({ Dumbbell_Flyes: { frames: 3, source: SOURCE, samePersonAndSetup: true } }), IDS);
    expect(demoWithSequence('Dumbbell_Flyes', null, seqs.get('Dumbbell_Flyes'), all)).toBeNull();
  });

  it('refuses a 3 or 4 frame sequence without one complete licensed source record', () => {
    const bad: Record<string, unknown> = {
      noSource: { frames: 3, samePersonAndSetup: true },
      manySources: { frames: 3, source: [SOURCE, SOURCE], samePersonAndSetup: true },
      noAuthor: { frames: 3, source: { ...SOURCE, author: ' ' }, samePersonAndSetup: true },
      noTitle: { frames: 3, source: { ...SOURCE, title: '' }, samePersonAndSetup: true },
      noFile: { frames: 3, source: { ...SOURCE, fileUrl: undefined }, samePersonAndSetup: true },
      httpFile: { frames: 3, source: { ...SOURCE, fileUrl: 'http://example.org/a.jpg' }, samePersonAndSetup: true },
      noLicenseUrl: { frames: 3, source: { ...SOURCE, licenseUrl: 'not a url' }, samePersonAndSetup: true },
      nonCommercial: { frames: 3, source: { ...SOURCE, license: 'CC BY-NC 4.0' }, samePersonAndSetup: true },
      shareAlike: { frames: 3, source: { ...SOURCE, license: 'CC BY-SA 4.0' }, samePersonAndSetup: true },
      bannedHost: { frames: 3, source: { ...SOURCE, fileUrl: 'https://wger.de/media/x.png' }, samePersonAndSetup: true },
      notChecked: { frames: 4, source: SOURCE },
      twoFrames: { frames: 2, source: SOURCE, samePersonAndSetup: true },
      fiveFrames: { frames: 5, source: SOURCE, samePersonAndSetup: true },
    };
    const ids = new Set(Object.keys(bad));
    const seqs = parseDemoSequences(file(bad), ids);
    for (const id of ids) {
      const entry = seqs.get(id)!;
      expect(entry.ok, id).toBe(false);
      expect(demoWithSequence(id, pair(id), entry, all), id).toBeNull();
    }
  });

  it('refuses an id that is not in the catalog, and a file of another format', () => {
    const seqs = parseDemoSequences(file({ Not_An_Exercise: { frames: 3, source: SOURCE, samePersonAndSetup: true } }), IDS);
    expect(seqs.get('Not_An_Exercise')).toEqual({ ok: false, reason: 'Not_An_Exercise: not in the catalog' });
    expect(() => parseDemoSequences({ format: 'other', sequences: {} }, IDS)).toThrow(/format/);
    expect(() => parseDemoSequences({ format: SEQUENCE_FORMAT }, IDS)).toThrow(/sequences/);
  });

  it('sequencePaths lists frame files in order', () => {
    expect(sequencePaths('X', 3)).toEqual({ webp: ['ex/X/0.webp', 'ex/X/1.webp', 'ex/X/2.webp'], jpg: ['ex/X/0.jpg', 'ex/X/1.jpg', 'ex/X/2.jpg'] });
  });
});

describe('the shipped sequence file (data/demo-sequences.json)', () => {
  const catalogIds = new Set((catalog as { exercises: { id: string }[] }).exercises.map((e) => e.id));
  const seqs = parseDemoSequences(shipped, catalogIds);

  it('declares nothing that would be refused', () => {
    expect([...seqs.values()].filter((e) => !e.ok)).toEqual([]);
  });

  it('every declared frame file is in public/ex (so the build hashes it)', () => {
    for (const [id, e] of seqs) {
      if (!e.ok) continue;
      const p = sequencePaths(id, e.sequence.frames);
      for (const f of [...p.webp, ...p.jpg]) expect(existsSync(join(__dirname, '..', '..', '..', 'public', f)), f).toBe(true);
    }
  });
});
