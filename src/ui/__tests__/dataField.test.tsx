import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NO_PACE } from '../../lib/run/format';
import { DataField } from '../DataField';
import { BLANK, numberEm, TRACKING } from '../dataFieldFit';

const text = (html: string) => html.replace(/<[^>]+>/g, '');

describe('numberEm (PLAN M1): how wide a data field number prints', () => {
  it('figures are tabular: every figure string of one length is as wide', () => {
    expect(numberEm('11.11', 'hero')).toBe(numberEm('99.99', 'hero'));
    expect(numberEm('1:00:00', 'large')).toBe(numberEm('9:59:59', 'large'));
  });
  it('matches the widths measured in WebKit (Inter 900, tnum) within the safety room', () => {
    // measured at 100 px with no tracking: 99.99 is 2.847 em, 1:59:59 is 3.760 em, 999 is 1.934 em
    const at = (t: string, measured: number) => {
      const em = numberEm(t, 'medium') / 1.03 - [...t].length * TRACKING.medium;
      expect(em).toBeCloseTo(measured, 2);
    };
    at('99.99', 2.847);
    at('1:59:59', 3.76);
    at('999', 1.934);
  });
  it('worst cases stay big at 320 px wide (280 px between the 20 px side margins)', () => {
    const px = (t: string, size: 'hero' | 'large' | 'medium') => 280 / numberEm(t, size);
    expect(px('99.99', 'hero')).toBeGreaterThan(95);
    expect(px('1:59:59', 'hero')).toBeGreaterThan(75);
    expect(px('999', 'large')).toBeGreaterThan(140);
    expect(px('1:59:59', 'medium')).toBeGreaterThan(70);
  });
  it('never zero wide, even for an empty string', () => {
    expect(numberEm('', 'hero')).toBeGreaterThan(0.6);
  });
});

describe('DataField (PLAN M1)', () => {
  it('a label, the number exactly as given, and the unit; sized hero, large or medium', () => {
    const html = renderToStaticMarkup(<DataField label="Distance" value="3.42" unit="km" size="hero" testId="f" />);
    expect(text(html)).toBe('Distance3.42km');
    expect(html).toContain('data-size="hero"');
    expect(html).toContain('data-testid="f"');
    expect(html).toMatch(/--df-em:2\.\d{3}/);
    expect(html).not.toContain('data-blank');
    expect(renderToStaticMarkup(<DataField label="Time" value="21:08" />)).toContain('data-size="large"');
    expect(renderToStaticMarkup(<DataField label="Pace" value="6:11" unit="/km" size="medium" />)).toContain('data-size="medium"');
  });
  it('the number uses tabular figures', () => {
    expect(renderToStaticMarkup(<DataField label="Weight" value="315" unit="lb" />)).toMatch(/class="[^"]*number[^"]* num"/);
  });
  it('a value that is not trusted is an honest blank: two dashes, read out as not known yet', () => {
    for (const value of [null, '', '  ', NO_PACE]) {
      const html = renderToStaticMarkup(<DataField label="Pace" value={value} unit="/km" />);
      expect(html).toContain('data-blank="true"');
      expect(text(html)).toBe(`Pace${BLANK}not known yet/km`);
      expect(html).toMatch(/aria-hidden="true" data-value="true">--</);
    }
    expect(BLANK).toBe(NO_PACE);
  });
  it('no unit, no unit line', () => {
    expect(text(renderToStaticMarkup(<DataField label="Reps" value="12" />))).toBe('Reps12');
  });
  it('PLAN M2: a spoken line replaces the printed parts for VoiceOver; label and number take test ids and data', () => {
    const html = renderToStaticMarkup(<DataField label="Distance" value="3.42" unit="km" spoken="3.42 kilometers" labelTestId="l" numberTestId="n" numberData={{ 'data-metric': 'distance' }} />);
    expect(text(html)).toBe('3.42 kilometersDistance3.42km');
    expect(html).toContain('data-testid="l"');
    expect(html).toMatch(/data-testid="n" data-metric="distance">3\.42</);
    expect((html.match(/aria-hidden="true"/g) ?? []).length).toBe(2);
  });
  it('PLAN M2: every size uses the looser figure tracking, so glyphs never touch', () => {
    expect(new Set(Object.values(TRACKING))).toEqual(new Set([-0.02]));
  });
});
