import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from './fixtures';
import type { Load, Session, WorkoutSet } from '../src/db/types';
import { add, heldWeightOf } from '../src/lib/load';

// PLAN 1.11: the owner's real history file, imported through the UI from a temp copy made at test
// time (SPEC 0.6: never in the repo, never in a fixture). Skipped when the file is not on this
// machine. Prints counts only: no names, no weights. No screenshots.
const SOURCE = join(os.homedir(), 'anygym-private', 'g-history.json');

type RawSet = { reps: number; weight?: number; dropTo?: { reps?: number; weight?: number } };
type Raw = { exercises: Array<{ loadType: string; sessions: Array<{ sets: RawSet[] }> }> };

async function dbAll<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const c = req.result;
          const tx = c.transaction(name, 'readonly');
          const r = tx.objectStore(name).getAll();
          tx.oncomplete = () => {
            c.close();
            resolve(r.result as T[]);
          };
          tx.onabort = () => {
            c.close();
            reject(tx.error);
          };
        };
      }),
    store,
  );
}

/** The file number a stored load was built from. */
function fileNumberOf(load: Load): number {
  switch (load.kind) {
    case 'barbell':
    case 'plate_machine':
      return add(...(load.perSide ?? []));
    case 'dumbbell_each':
      return heldWeightOf(load)!;
    case 'stack':
      return load.stackValue ?? load.total;
    case 'bodyweight':
      return load.added ?? 0;
    default:
      return load.total;
  }
}

test.describe('1.11 private history import (temp copy)', () => {
  test.skip(!existsSync(SOURCE), 'no private history file on this machine');

  test('every set written, no invented loads, order kept, no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));

    const dir = mkdtempSync(join(os.tmpdir(), 'anygym-import-'));
    try {
      const copy = join(dir, 'history.private.json');
      copyFileSync(SOURCE, copy);
      const raw = JSON.parse(readFileSync(copy, 'utf8')) as Raw;
      const lines = raw.exercises.flatMap((e) => e.sessions.flatMap((s) => s.sets));
      const fileSets = lines.length + lines.filter((x) => x.dropTo).length;
      const numbers = new Set<number>(lines.flatMap((x) => [x.weight, x.dropTo?.weight]).filter((w): w is number => w !== undefined));

      await page.goto('./#/settings');
      await page.getByTestId('import-file').setInputFiles(copy);
      await expect(page).toHaveURL(/#\/settings\/import$/);
      const confirm = page.getByTestId('import-confirm');
      await expect(confirm).not.toHaveText('Checking…');
      // Questions: an unknown load type gets "One weight" (the file's number is kept as is); a name
      // the app cannot match would be skipped (then the count check below fails loudly).
      for (let i = 0; i < 20 && (await confirm.textContent())?.startsWith('Answer'); i++) {
        await confirm.tap();
        const kind = page.getByRole('dialog', { name: 'How do you load this?' });
        const pick = page.getByRole('dialog', { name: 'Pick the exercise' });
        await expect(kind.or(pick)).toBeVisible();
        if (await kind.isVisible()) await kind.getByRole('button', { name: /One weight/ }).tap();
        else await pick.getByRole('button', { name: /^Skip (these \d+ sets|this set)$/ }).tap();
        await expect(kind.or(pick)).toHaveCount(0);
      }
      await expect(confirm).toHaveText(`Import ${fileSets} sets`);
      await confirm.tap();
      await expect(page.getByRole('status').filter({ hasText: `Imported ${fileSets} sets` })).toBeVisible();

      const sessions = (await dbAll<Session>(page, 'sessions')).sort((a, b) => a.importSeq! - b.importSeq!);
      const sets = await dbAll<WorkoutSet>(page, 'sets');
      expect(sets).toHaveLength(fileSets);
      expect(sessions.every((s) => s.imported && s.startedAt === s.importSeq)).toBe(true);

      const withLoad = sets.filter((s) => s.load);
      const invented = withLoad.filter((s) => !(s.load!.kind === 'bodyweight' && !s.load!.added) && !numbers.has(fileNumberOf(s.load!)));
      expect(invented).toHaveLength(0);

      // Order: sessions in importSeq order carry the file's reps, exercise by exercise, oldest first.
      const writtenReps = sessions.map((s) =>
        sets
          .filter((x) => x.sessionId === s.id && x.kind !== 'drop')
          .sort((a, b) => a.order - b.order)
          .map((x) => x.reps),
      );
      const fileReps = raw.exercises.flatMap((e) => e.sessions.map((s) => s.sets.map((x) => x.reps)));
      expect(writtenReps).toEqual(fileReps);
      expect(errors).toEqual([]);

      console.log(
        `private import (UI): sessions ${sessions.length}, file sets ${fileSets}, written ${sets.length}, with load ${withLoad.length}, unsure ${sets.filter((s) => s.uncertain).length}, invented ${invented.length}, console errors ${errors.length}`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
