import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// PLAN M1 (SPEC 23.1): a sheet is solid graphite with a hairline top edge and 0 to 4 px top corners,
// no blur, no shadow, no fade; the grabber is a flat bar. The grabber's hit area rules stay as they were.
const css = readFileSync(join(__dirname, '../Sheet.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (selector: string) => {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};

describe('Sheet look (M1)', () => {
  it('solid, hairline top, square top corners', () => {
    expect(rule('.sheet')).toMatch(/background: var\(--sheet-bg\);\s*border-top: var\(--divider\);\s*border-radius: var\(--radius-md\) var\(--radius-md\) 0 0;/);
  });
  it('no shadow, no blur, no gradient anywhere in the sheet', () => {
    expect(css).not.toMatch(/box-shadow|backdrop-filter|gradient/);
  });
  it('the app behind steps back with square corners', () => {
    expect(css).toMatch(/html\[data-sheets\]\) :global\(#root\) \{[^}]*border-radius: var\(--radius-md\)/);
  });
  it('the grabber is a flat bar; its hit area keeps the old geometry (48 pt or more)', () => {
    expect(rule('.grabber')).toMatch(/width: var\(--grabber-w\);\s*height: var\(--grabber-h\);\s*border-radius: var\(--radius-none\)/);
    expect(rule('.grabberZone')).toMatch(/height: 52px;\s*margin-top: -32px;\s*padding: 32px 0 0;/);
    expect(css).toMatch(/\.sheet\[data-scroll='true'\] \.grabberZone \{\s*height: 49px;\s*padding-top: 36px;/);
    expect(css).toMatch(/@media \(max-height: 600px\) \{\s*\.sheet\[data-scroll='true'\] \.grabberZone \{\s*margin-bottom: -8px;/);
  });
});
