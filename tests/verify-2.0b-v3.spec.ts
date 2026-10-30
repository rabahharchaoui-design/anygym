import { expect, test } from './fixtures';
import { runPlateAudit } from './helpers/plateAudit';

// Tester audit (2.0b round 3, updated for PLAN 2.0d): the plates drawn vs the exact math.
const DEVICES = ['iPhone SE', 'iPhone 17 Pro Max', '320 floor'];

test.describe('verify 2.0b v3', () => {
  for (const unit of ['lb', 'kg'] as const) {
    test(`plate audit ${unit} @matrix`, async ({ page }) => {
      test.skip(!DEVICES.includes(test.info().project.name));
      test.setTimeout(180_000);
      const errs: string[] = [];
      page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
      page.on('pageerror', (e) => errs.push(String(e)));
      await runPlateAudit(page, unit, 'reports/shots/2.0b/v3', test.info().project.name.replace(/ /g, '-'));
      expect(errs).toEqual([]);
    });
  }
});
