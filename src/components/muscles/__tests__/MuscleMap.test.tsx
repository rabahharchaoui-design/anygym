import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MuscleMap } from '../MuscleMap';
import { musclesForCatalog, musclesForPlan } from '../../../data/muscles';
import { BACK, FRONT } from '../../../lib/bodyPolygons';

const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe('MuscleMap', () => {
  it('draws front and back, every polygon, primary and secondary roles, and the text line', () => {
    const html = renderToStaticMarkup(<MuscleMap data={musclesForCatalog('Barbell_Incline_Bench_Press_-_Medium_Grip')} />);
    expect(html).toContain('data-view="front"');
    expect(html).toContain('data-view="back"');
    const polygons = [...FRONT, ...BACK].reduce((n, s) => n + s.polygons.length, 0);
    expect(count(html, /<polygon /g)).toBe(polygons);
    expect(html).toMatch(/data-region="chest" data-role="primary"/);
    expect(html).toMatch(/data-region="front-deltoids" data-role="secondary"/);
    expect(html).toMatch(/data-region="hamstring" data-role="body"/);
    expect(html).toContain('Upper chest');
    expect(html).toContain(' · Front delts, triceps');
    expect(html).toContain('Primary');
    expect(html).toContain('Secondary');
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
