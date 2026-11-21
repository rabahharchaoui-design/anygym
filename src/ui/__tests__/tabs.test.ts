import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { activeTab, TABS } from '../tabs';

describe('tabs (SPEC 23.1, PLAN M1)', () => {
  it('five tabs in the boards order (PLAN M14), the old routes kept', () => {
    expect(TABS.map((t) => [t.to, t.label])).toEqual([
      ['/', 'Today'],
      ['/plans', 'Plan'],
      ['/run', 'Run'],
      ['/history', 'History'],
      ['/settings', 'You'],
    ]);
  });
  it('a path lights its own tab, a listed route, or anything below it', () => {
    expect(activeTab('/')).toBe('/');
    expect(activeTab('/settings')).toBe('/settings');
    expect(activeTab('/run')).toBe('/run');
    expect(activeTab('/history/abc')).toBe('/history');
    expect(activeTab('/plans/five-day')).toBe('/plans');
    expect(activeTab('/settings/gyms')).toBeNull();
    expect(activeTab('/workout/1')).toBeNull();
  });
});

describe('tab bar look (Monolith style sheet)', () => {
  const css = readFileSync(join(__dirname, '../TabBar.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  it('docked and flat: solid graphite, a hairline on top, no blur, no shadow, no pill, no fade', () => {
    expect(css).toMatch(/\.bar \{[^}]*bottom: 0;[^}]*background: var\(--glass-bg-bar\);[^}]*border-top: var\(--divider\)/);
    expect(css).not.toMatch(/backdrop-filter|box-shadow|gradient|radius-pill|::before/);
  });
  it('the active tab: white, bold, a 20 x 3 ice blue mark; the rest secondary text', () => {
    expect(css).toMatch(/\.tab \{[^}]*color: var\(--text-2\)/);
    expect(css).toMatch(/\.tab\[data-active\] \{\s*color: var\(--text\)/);
    expect(css).toMatch(/\.tab\[data-active\] \.label \{\s*font-weight: 700/);
    expect(css).toMatch(/\.pill \{[^}]*width: var\(--tab-mark-w\);\s*height: var\(--tab-mark-h\);[^}]*background: var\(--accent\)/);
    const tokens = readFileSync(join(__dirname, '../../styles/tokens.css'), 'utf8');
    expect(tokens).toMatch(/--tab-mark-w: 20px;\s*--tab-mark-h: 3px;/);
    expect(tokens).toMatch(/--tabbar-gap: var\(--safe-bottom\);/);
  });
  it('every tab is at least 44 pt and the label 13 px', () => {
    expect(css).toMatch(/\.tab \{[^}]*min-height: var\(--tap-min\);\s*min-width: var\(--tap-min\)/);
    expect(css).toMatch(/\.label \{[^}]*font-size: var\(--text-mono-tab\)/);
  });
});
