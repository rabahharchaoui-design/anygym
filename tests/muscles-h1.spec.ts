import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';
import { watchErrors } from './workout-helpers';
import { exercisesForRegion, type NamedCatalogMuscles } from '../src/lib/muscleExercises';
import { resolveMuscles, type MuscleOverrides } from '../src/lib/muscles';
import type { Region } from '../src/lib/bodyArt';

// PLAN H1 (3): on a shape that stands for more than one muscle, the tap line, the title of the sheet
// it opens and the exercises listed all use the exercise's own word: a hip abduction's glute shape
// is "Outer hips" throughout, a pull up's upper back shape is "Lats", never "Glutes" or "Upper back".

const json = <T>(p: string): T => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')) as T;
const CATALOG = json<{ exercises: NamedCatalogMuscles[] }>('data/catalog.json').exercises;
const OVERRIDES = json<MuscleOverrides>('data/muscle-overrides.json');
const primaryHere = (id: string, region: Region) => resolveMuscles(CATALOG.find((e) => e.id === id), OVERRIDES)!.primary.filter((t) => t.regions.includes(region)).map((t) => t.label);

const CASES = [
  { exercise: 'Thigh_Abductor', view: 'back', region: 'gluteal', word: 'Outer hips', label: 'outer hips' },
  { exercise: 'Pullups', view: 'back', region: 'upper-back', word: 'Lats', label: 'lats' },
] as const;

for (const c of CASES) {
  test(`${c.exercise}: the tap line, the sheet title and the list agree on ${c.word}`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./?dev#/dev/muscles');
    await page.getByLabel('Exercise').selectOption(`cat:${c.exercise}`);
    const map = page.getByTestId('muscle-map');
    await map.locator(`svg[data-view="${c.view}"] [data-region="${c.region}"]`).first().click();
    await expect(page.getByTestId('muscle-pick')).toHaveText(`${c.word} · primary`);
    const listed = exercisesForRegion(c.region, CATALOG, OVERRIDES, new Set(), c.label);
    expect(listed.length).toBeGreaterThan(0);
    await map.getByRole('button', { name: `${listed.length} ${listed.length === 1 ? 'exercise' : 'exercises'} for ${c.word}` }).click();
    const list = page.getByRole('dialog', { name: `${c.word} exercises` });
    await expect(list.getByRole('heading', { name: c.word, exact: true })).toBeVisible();
    const rows = list.getByTestId('muscle-exercise');
    await expect(rows).toHaveCount(listed.length);
    // The first listed exercise (and every one) has that muscle as its main muscle on the shape.
    const first = await rows.first().getAttribute('data-id');
    expect(primaryHere(first!, c.region)).toContain(c.label);
    for (const e of listed) expect(primaryHere(e.id, c.region), e.id).toContain(c.label);
    expect(errors).toEqual([]);
  });
}
