import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MuscleMap, autoView, pickLine } from '../MuscleMap';
import { musclesForCatalog, musclesForPlan } from '../../../data/muscles';
import { BODIES } from '../../../lib/bodyArt';

const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const INCLINE = 'Barbell_Incline_Bench_Press_-_Medium_Grip';

describe('MuscleMap', () => {
  it('draws one body (male front for an incline press), every path, roles, controls and the text line', () => {
    const html = renderToStaticMarkup(<MuscleMap data={musclesForCatalog(INCLINE)} />);
    expect(count(html, /data-view="/g)).toBe(1);
    expect(html).toContain('data-view="front"');
    expect(html).toContain('data-body="male"');
    const paths = BODIES.male.front.shapes.reduce((n, s) => n + s.paths.length, 0);
    // + the outline + the glow copies of the primary paths
    const glow = BODIES.male.front.shapes.filter((s) => s.region === 'chest').reduce((n, s) => n + s.paths.length, 0);
    expect(count(html, /<path /g)).toBe(paths + 1 + glow);
    expect(html).toMatch(/data-region="chest" data-role="primary"/);
    expect(html).toMatch(/data-region="front-deltoids" data-role="secondary"/);
    expect(html).toMatch(/data-region="triceps" data-role="secondary"/);
    expect(html).toMatch(/data-region="quadriceps" data-role="body"/);
    expect(html).toContain('Upper chest');
    expect(html).toContain(' · Front delts, triceps');
    expect(html).toContain('Primary');
    expect(html).toContain('Secondary');
    expect(html).toContain('>Front<');
    expect(html).toContain('>Female<');
    expect(html).toContain('Tap a muscle to name it');
  });
  it('opens on the side with more primary muscles, front on a tie', () => {
    expect(autoView(musclesForCatalog(INCLINE)!, 'male')).toBe('front');
    expect(autoView(musclesForCatalog('Face_Pull')!, 'male')).toBe('back');
    expect(autoView(musclesForCatalog('Face_Pull')!, 'female')).toBe('back');
    const html = renderToStaticMarkup(<MuscleMap data={musclesForCatalog('Face_Pull')} />);
    expect(html).toContain('data-view="back"');
    expect(html).toMatch(/data-region="back-deltoids" data-role="primary"/);
  });
  it('names a tapped muscle and says whether this exercise works it', () => {
    const d = musclesForCatalog(INCLINE)!;
    expect(pickLine('chest', d)).toBe('Upper chest · primary');
    expect(pickLine('front-deltoids', d)).toBe('Front delts · secondary');
    expect(pickLine('triceps', d)).toBe('Triceps · secondary');
    expect(pickLine('quadriceps', d)).toBe('Quads · not used here');
  });
  it('hides the Secondary legend when there is none', () => {
    const html = renderToStaticMarkup(<MuscleMap data={musclesForCatalog('Side_Lateral_Raise')} />);
    expect(html).toContain('Side delts');
    expect(html).not.toContain('Secondary');
  });
  it('honest empty state: no drawing for a plan exercise with match none', () => {
    const html = renderToStaticMarkup(<MuscleMap data={musclesForPlan('28-method-squat')} />);
    expect(html).toContain('Muscles coming soon');
    expect(html).not.toContain('<svg');
  });
  it('text only when nothing can be drawn (rotator cuff)', () => {
    const html = renderToStaticMarkup(<MuscleMap data={musclesForCatalog('Internal_Rotation_with_Band')} />);
    expect(html).toContain('Rotator cuff');
    expect(html).not.toContain('<svg');
  });
});
