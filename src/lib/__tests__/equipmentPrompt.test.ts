import { glossaryEntry } from '../../data/glossary';
import { describe, expect, it } from 'vitest';
import { entryFor, promptFor } from '../equipmentPrompt';

describe('first use prompt', () => {
  it('asks the SPEC 5.3 questions', () => {
    expect(promptFor('smith', 'lb')).toMatchObject({
      question: 'Enter the bar weight (usually on a sticker on the frame).',
      alternative: { label: 'Count plates only', entry: { kind: 'plates_only', value: 0 } },
    });
    expect(promptFor('plate_machine', 'kg').alternative).toEqual({
      label: 'Plates only',
      entry: { kind: 'plates_only', value: 0 },
    });
    expect(promptFor('stack', 'lb')).toMatchObject({ title: 'Weight steps', question: 'Do the plates on this machine go up by 5, 10, or other?', chips: [5, 10] });
    expect(promptFor('stack', 'kg')).toMatchObject({ question: 'Do the plates on this machine go up by 2.5, 5, or other?', chips: [2.5, 5] });
    for (const k of ['ez_curl', 'trap'] as const) {
      const p = promptFor(k, 'lb');
      expect(p.question).toBe('Enter the bar weight.');
      expect(p.alternative).toBeUndefined();
      expect(p.chips).toBeUndefined();
    }
    expect(promptFor('ez_curl', 'lb').title).toBe('EZ curl bar');
    expect(promptFor('trap', 'lb').title).toBe('Trap bar');
  });

  it('every prompt names a glossary entry for its ⓘ (SPEC 13.7)', () => {
    const kinds = ['smith', 'plate_machine', 'stack', 'ez_curl', 'trap'] as const;
    const ids = kinds.map((k) => promptFor(k, 'lb').info);
    expect(ids).toEqual(['smith-machine', 'plate-loaded-machine', 'weight-stack-machine', 'ez-curl-bar', 'trap-bar']);
    for (const id of ids) expect(glossaryEntry(id)).toBeDefined();
    // No "stack" label in user facing titles (SPEC 13.6).
    for (const k of kinds) expect(promptFor(k, 'kg').title.toLowerCase()).not.toContain('stack');
  });

  it('turns a number into the stored answer', () => {
    expect(entryFor('plate_machine', 110)).toEqual({ kind: 'starting_resistance', value: 110 });
    expect(entryFor('stack', 10)).toEqual({ kind: 'stack_step', value: 10 });
    for (const k of ['smith', 'ez_curl', 'trap'] as const) expect(entryFor(k, 25)).toEqual({ kind: 'bar_weight', value: 25 });
  });
});
