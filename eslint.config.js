// ESLint, structure rules only (PLAN 3.6x). No style rules and no auto fixing: this file exists to
// hold two lines of the repo rules in CLAUDE.md.
//   1. max-lines 400 per source file. Files already over are held at their recorded size from
//      scripts/size-baseline.json (the size guard keeps that ratchet, scripts/size-guard.mjs).
//   2. screens (src/screens/**) do not import src/db/** directly; they go through src/hooks/**.
//      Files that still do are listed in scripts/boundary-allow.json (scripts/boundary-baseline.mjs).
// Parsed with Babel because the project uses TypeScript 7, which typescript-eslint cannot read yet.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import babelParser from '@babel/eslint-parser';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const sizeBaseline = read('./scripts/size-baseline.json').files;
const allowed = process.env.BOUNDARY_NO_ALLOW === '1' ? [] : read('./scripts/boundary-allow.json').files;
const LIMIT = read('./scripts/size-baseline.json').limit;

const SRC = ['src/**/*.ts', 'src/**/*.tsx'];
const NOT_CHECKED = ['src/**/__tests__/**', 'src/**/*.test.ts', 'src/**/*.test.tsx', 'src/data/**', 'src/**/*.d.ts'];

const parserFor = (jsx) => ({
  parser: babelParser,
  sourceType: 'module',
  parserOptions: { requireConfigFile: false, babelOptions: { babelrc: false, configFile: false, parserOpts: { plugins: jsx ? ['typescript', 'jsx'] : ['typescript'] } } },
});

/** A screen file may not import (value imports only) anything inside src/db/. */
const screensNoDb = {
  meta: { type: 'problem', schema: [], messages: { db: 'Screens do not import src/db/ directly ({{ source }}). Go through a hook in src/hooks/.' } },
  create(context) {
    const here = dirname(context.filename);
    const dbDir = resolve(context.cwd, 'src/db');
    const check = (node, source) => {
      if (typeof source !== 'string' || !source.startsWith('.')) return;
      const target = resolve(here, source);
      if (target === dbDir || target.startsWith(`${dbDir}/`)) context.report({ node, messageId: 'db', data: { source } });
    };
    return {
      ImportDeclaration: (n) => n.importKind !== 'type' && check(n, n.source.value),
      ExportNamedDeclaration: (n) => n.source && n.exportKind !== 'type' && check(n, n.source.value),
      ExportAllDeclaration: (n) => n.exportKind !== 'type' && check(n, n.source.value),
      ImportExpression: (n) => n.source.type === 'Literal' && check(n, n.source.value),
    };
  },
};

export default [
  { ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', 'coverage/**', 'reports/**', 'test-results/**', 'playwright-report/**', '.jscpd-report/**'] },
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  { files: ['src/**/*.ts'], languageOptions: parserFor(false) },
  { files: ['src/**/*.tsx'], languageOptions: parserFor(true) },
  {
    files: SRC,
    ignores: NOT_CHECKED,
    // react-hooks is a stub: the source has `eslint-disable ... react-hooks/exhaustive-deps` comments left
    // from an editor setup, and ESLint errors on a rule it has never heard of. It checks nothing.
    plugins: { anygym: { rules: { 'screens-no-db': screensNoDb } }, 'react-hooks': { rules: { 'exhaustive-deps': { create: () => ({}) } } } },
    rules: { 'max-lines': ['error', { max: LIMIT, skipBlankLines: false, skipComments: false }] },
  },
  // Files already over the limit: held at the size recorded in the baseline.
  ...Object.entries(sizeBaseline)
    .filter(([path]) => /\.tsx?$/.test(path))
    .map(([path, lines]) => ({ files: [path], rules: { 'max-lines': ['error', { max: lines, skipBlankLines: false, skipComments: false }] } })),
  {
    files: ['src/screens/**/*.ts', 'src/screens/**/*.tsx'],
    ignores: [...NOT_CHECKED, ...allowed],
    rules: { 'anygym/screens-no-db': 'error' },
  },
  // The offenders still listed are checked by scripts/boundary-baseline.mjs, which fails when one of
  // them stops importing src/db/ so the list can only shrink.
];
