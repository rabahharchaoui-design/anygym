import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MuscleMap, MusclePair, autoView, pickLine } from '../MuscleMap';
import { selectableRegions } from '../MusclePicker';
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
    // The drawing only: the "Pick a muscle" control's chevron (PLAN 2.0k) is not body art.
    const art = html.replace(/<label[^]*?data-testid="muscle-pick-control"[^]*?<\/label>/, '');
    expect(count(art, /<path /g)).toBe(paths + 1 + glow);
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

describe('accessible picker lists every drawn region (PLAN 2.0j)', () => {
  const drawnRegions = (body: 'male' | 'female', view: 'front' | 'back') => new Set(BODIES[body][view].shapes.flatMap((s) => (s.region ? [s.region] : [])));
  it.each([['male'], ['female']] as const)('%s: options equal the selectable drawn regions of each view and of the pair', (body) => {
    const data = musclesForCatalog(INCLINE)!;
    for (const view of ['front', 'back'] as const) expect(new Set(selectableRegions(body, [view], data))).toEqual(drawnRegions(body, view));
    const both = selectableRegions(body, ['front', 'back'], data);
    expect(new Set(both)).toEqual(new Set([...drawnRegions(body, 'front'), ...drawnRegions(body, 'back')]));
    expect(both.length).toBe(new Set(both).size);
  });
  it('lit muscles come first; unlit ones are listed too; resting art is not', () => {
    const data = musclesForCatalog(INCLINE)!;
    const list = selectableRegions('male', ['front', 'back'], data);
    expect(list[0]).toBe('chest');
    expect(list).toContain('forearm');
    expect(list).not.toContain(null as never);
  });
  it('the workout pair renders an option for an unlit muscle', () => {
    const html = renderToStaticMarkup(<MusclePair data={musclesForCatalog(INCLINE)} exercises />);
    expect(html).toContain('data-testid="muscle-a11y-pick"');
    expect(html).toMatch(/<option value="forearm">[^<]*not used here/);
  });
  it('the single map has the picker too', () => {
    const html = renderToStaticMarkup(<MuscleMap data={musclesForCatalog(INCLINE)} />);
    expect(html).toMatch(/<option value="forearm">/);
  });
});
