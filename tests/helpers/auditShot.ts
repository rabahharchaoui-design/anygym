import { appendFileSync, mkdirSync } from 'node:fs';
import { test, type Page } from '../fixtures';

// PLAN M11 (1): shots of every screen into reports/monolith/audit-before/ (see tests/audit-m11.spec.ts).
// File <group>-<screen>-<device>.jpg, an index line in .index.jsonl (scripts/audit-index.mjs makes INDEX.md).
export const DIR = process.env.AUDIT_DIR ?? 'reports/monolith/audit-before';
const STATUS = process.env.AUDIT_STATUS ?? '/tmp/m11-status.md';
export const DEVICE: Record<string, string> = { 'iPhone SE': 'iPhone-SE', 'iPhone 15': 'iPhone-15-Pro' };

export async function shot(page: Page, group: string, name: string, how: string, full = false) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(700);
  const dev = DEVICE[test.info().project.name]!;
  const file = `${group}-${name}-${dev}.jpg`;
  await page.screenshot({ path: `${DIR}/${file}`, type: 'jpeg', quality: 70, fullPage: full });
  appendFileSync(`${DIR}/.index.jsonl`, `${JSON.stringify({ file, group, name, dev, how })}\n`);
  appendFileSync(STATUS, `${group}/${name} ${dev} ok\n`);
}
export const note = (line: string) => appendFileSync(STATUS, `${line}\n`);
