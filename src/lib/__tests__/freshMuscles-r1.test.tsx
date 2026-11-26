// PLAN R1 (3, 4): Worked lately names its muscles as visible text, and a sure muscle with no shape
// on the map (rotator cuff) is said by its own name, not as "muscles not confirmed".
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { infoForExercise } from '../../data/exerciseInfo';
import { shapelessMuscles } from '../../db/coachData';
import { FreshMuscles, freshWords, unmappedLine } from '../../screens/today/FreshMuscles';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('R1 (3) the muscle names are visible text', () => {
  const named = [
    { name: 'chest', band: 'day' as const },
    { name: 'quads', band: 'two' as const },
  ];
  it('the words under the map are freshWords(named), outside any aria-label', () => {
    const html = renderToStaticMarkup(<FreshMuscles bands={{ chest: 'day', quadriceps: 'two' }} named={named} />);
    const words = freshWords(named);
    expect(words).toMatch(/chest/);
    expect(html).toContain(`data-testid="fresh-names"`);
    expect(text(html)).toContain(words);
  });
  it('nothing shaded: no names line', () => {
    const html = renderToStaticMarkup(<FreshMuscles bands={{}} named={[]} unmapped={['Crunch']} />);
    expect(html).not.toContain('fresh-names');
  });
});

describe('R1 (4) a named muscle without a shape is said by its own name', () => {
  it('rotator cuff work: the muscle is known, only its shape is missing', () => {
    const id = 'Internal_Rotation_with_Band';
    expect(infoForExercise(id).muscles?.primary.map((t) => t.label)).toEqual(['rotator cuff']);
    expect(shapelessMuscles(id)).toEqual(['rotator cuff']);
    expect(unmappedLine([], shapelessMuscles(id))).toBe('Not on the map: rotator cuff');
  });
  it('an exercise with no sure muscles is still named as not confirmed, and never gets a muscle', () => {
    expect(unmappedLine(['Hip Thrust', 'Crunch'])).toBe('Not on the map: Hip Thrust and Crunch (muscles not confirmed)');
    expect(unmappedLine(['Crunch'], ['rotator cuff'])).toBe('Not on the map: rotator cuff; Crunch (muscles not confirmed)');
    expect(unmappedLine([], [])).toBeNull();
  });
  it('a mapped exercise has no shapeless muscles', () => {
    expect(shapelessMuscles('Barbell_Squat')).toEqual([]);
  });
});
