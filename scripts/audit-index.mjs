// PLAN M11 (1): builds reports/monolith/audit-before/INDEX.md from .index.jsonl (one line per screenshot).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const DIR = process.env.AUDIT_DIR ?? 'reports/monolith/audit-before';
const TITLE = DIR.endsWith('audit-after') ? 'M16 audit, after: every screen on the Nov 24 build' : 'M11 (1) audit, before: every screen as it is now';
const rows = new Map();
for (const l of readFileSync(`${DIR}/.index.jsonl`, 'utf8').split('\n').filter(Boolean)) {
  const r = JSON.parse(l);
  if (existsSync(`${DIR}/${r.file}`)) rows.set(r.file, r);
}
const list = [...rows.values()].sort((a, b) => a.file.localeCompare(b.file));
const out = [`# ${TITLE}`, '', 'file | screen | route or taps to reach it', '--- | --- | ---'];
for (const r of list) out.push(`${r.file} | ${r.group}: ${r.name.replace(/^\d+[a-z]?-/, '').replace(/-/g, ' ')} | ${r.how}`);
writeFileSync(`${DIR}/INDEX.md`, `${out.join('\n')}\n`);
console.log(list.length, 'rows');
