import { expect, test, type Locator, type Page } from './fixtures';

// PLAN 1.7b: SPEC 13.6 plain picker labels, one picker per exercise, no debug text in user
// screens, and the SPEC 13.7 ⓘ info sheets.

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
};

const shot = async (page: Page, name: string, target?: Locator) => {
  if (test.info().project.name !== 'iPhone 15 Pro') return;
  await page.waitForTimeout(450); // let springs settle
  await (target ?? page).screenshot({ path: `reports/shots/1.7b/${name}.png` });
};

const addExercise = async (page: Page, query: string, name: string) => {
  await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill(query);
  await sheet.getByRole('button', { name, exact: true }).tap();
  await expect(sheet).toHaveCount(0);
};

const answerLoadType = async (page: Page, choice: RegExp) => {
  const ask = page.getByRole('dialog', { name: 'How do you load this?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: choice }).tap();
  await expect(ask).toHaveCount(0);
};

/** No raw JSON or debug words anywhere on a user screen (SPEC 13.6). */
const expectNoDebugText = async (page: Page) => {
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/JSON|\{"|"kind"|undefined|NaN|\[object/);
};

/** SPEC 13.6: old labels are gone. The helper line "You hold one in each hand" is the new copy. */
const expectNoOldLabels = async (scope: Locator) => {
  for (const word of ['each hand', 'held', 'stack', '+ added', '+ added weight']) {
    await expect(scope.getByText(word, { exact: true })).toHaveCount(0);
  }
};

/** The one expanded card shows exactly one picker. */
const expectOnePicker = async (page: Page, title: string) => {
  const titles = page.locator('main [data-testid="picker-title"]:visible');
  await expect(titles).toHaveCount(1);
  await expect(titles).toHaveText(title);
};

test('workout: each exercise shows only its own picker with the SPEC 13.6 labels', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();

  // Dumbbells.
  await addExercise(page, 'dumbbell bench', 'Dumbbell Bench Press');
  const db = page.getByTestId('exercise-dumbbell-bench-press');
  await expectOnePicker(page, 'Dumbbells · weight of one');
  await expect(db.getByText('You hold one in each hand', { exact: true })).toBeVisible();
  await expect(db.locator('[data-picture]')).toHaveCount(1);
  await expect(db.locator('[data-picture="dumbbell"]')).toBeVisible();
  await expect(page.getByTestId('timer-clock')).toHaveCount(0); // timer only on timed exercises
  await expectNoOldLabels(page.locator('main'));
  await expectNoDebugText(page);
  await db.getByRole('option', { name: '30 lb', exact: true }).tap();
  await shot(page, 'picker-dumbbells');

  // One weight, both hands: a kettlebell move gets the kettlebell picture.
  await addExercise(page, 'goblet', 'Kettlebell Goblet Squat');
  await answerLoadType(page, /One weight/);
  const kb = page.getByTestId('exercise-kettlebell-goblet-squat');
  await expectOnePicker(page, 'One weight · both hands');
  await expect(kb.getByText('Goblet squat, kettlebell swing', { exact: true })).toBeVisible();
  await expect(kb.locator('[data-picture="kettlebell"]')).toBeVisible();
  await kb.getByRole('option', { name: '35 lb', exact: true }).tap();
  await shot(page, 'picker-one-weight');

  // A one arm dumbbell move gets the upright dumbbell.
  await addExercise(page, 'single arm dumbbell row', 'Single Arm Dumbbell Row');
  await expectOnePicker(page, 'One weight · both hands');
  await expect(page.getByTestId('exercise-single-arm-dumbbell-row').locator('[data-picture="upright dumbbell"]')).toBeVisible();

  // Machine · pick the pin.
  await addExercise(page, 'cable tricep pushdown', 'Cable Tricep Pushdown');
  const cable = page.getByTestId('exercise-cable-tricep-pushdown');
  await expectOnePicker(page, 'Machine · pick the pin');
  await expect(cable.getByTestId('stack-sub')).toHaveText('Use the number next to the pin on the weight stack');
  await cable.getByRole('radio', { name: 'Pin at 50 lb' }).tap();
  await shot(page, 'picker-machine-pin');

  // Machine · plates per side, with the ⓘ next to "Set starting weight".
  await addExercise(page, 'angled machine leg press', 'Angled Machine Leg Press');
  await answerLoadType(page, /Plates on a machine/);
  const press = page.getByTestId('exercise-angled-machine-leg-press');
  await expectOnePicker(page, 'Machine · plates per side');
  await expect(press.getByRole('button', { name: 'What is Plate loaded machine?' })).toBeVisible();
  await press.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  // Breathing room: the plate label sits at least 8px above the title.
  const label = (await press.locator('[data-under-label]').first().boundingBox())!;
  const title = (await press.getByTestId('picker-title').boundingBox())!;
  expect(title.y - (label.y + label.height)).toBeGreaterThanOrEqual(8);
  // The last tray tile does not touch the card edge.
  const cardBox = (await press.boundingBox())!;
  const tiles = press.getByRole('group', { name: 'Plates' }).getByRole('button');
  const last = (await tiles.last().boundingBox())!;
  const first = (await tiles.first().boundingBox())!;
  expect(cardBox.x + cardBox.width - (last.x + last.width)).toBeGreaterThanOrEqual(4);
  expect(first.x - cardBox.x).toBeGreaterThanOrEqual(4);
  await press.getByTestId('picker-title').scrollIntoViewIfNeeded();
  await shot(page, 'picker-machine-plates');

  // Your bodyweight + Add weight.
  await addExercise(page, 'wide grip pull up', 'Wide Grip Pull Up');
  await expectOnePicker(page, 'Your bodyweight');
  await expect(page.getByTestId('exercise-wide-grip-pull-up').getByRole('button', { name: 'Add weight' })).toBeVisible();
  await shot(page, 'picker-bodyweight');

  // Hold for: the timer, only here.
  await addExercise(page, 'plank', 'Plank');
  await expectOnePicker(page, 'Hold for');
  await expect(page.getByTestId('timer-clock')).toHaveCount(1);
  await shot(page, 'picker-hold-for');

  await expectNoOldLabels(page.locator('main'));
  await expectNoDebugText(page);
  expect(errors).toEqual([]);
});

test('Smith machine: ⓘ in the first use prompt opens the info sheet; 48 pt hit area', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await addExercise(page, 'smith', 'Smith Machine Upright Row');
  await answerLoadType(page, /Plates on a bar/);
  const card = page.getByTestId('exercise-smith-machine-upright-row');
  await expect(card.getByRole('button', { name: 'What is Smith machine?' })).toBeVisible();
  await expectNoDebugText(page);

  await card.getByRole('button', { name: 'Set bar weight' }).tap();
  const prompt = page.getByRole('dialog', { name: 'Smith machine bar' });
  await expect(prompt).toBeVisible();
  const info = prompt.getByRole('button', { name: 'What is Smith machine?' });
  await expect(info).toBeVisible();
  const box = (await info.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(48);
  expect(box.height).toBeGreaterThanOrEqual(48);
  const glyph = (await info.locator('svg').boundingBox())!;
  expect(Math.round(glyph.width)).toBe(24);
  await shot(page, 'smith-prompt', prompt);

  await info.tap();
  const sheet = page.getByRole('dialog', { name: 'Smith machine', exact: true });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('info-art').locator('svg[data-illustration]')).toBeVisible();
  await expect(sheet.getByTestId('info-weight')).toHaveText('Check the sticker or stamp, it varies');
  await expect(sheet.getByText('A barbell fixed to two rails, so it only moves straight up and down.')).toBeVisible();
  await shot(page, 'info-smith-machine');

  // Got it closes only the info sheet; the prompt is still there.
  await sheet.getByRole('button', { name: 'Got it' }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Count plates only' }).tap();
  await expect(prompt).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('first use prompts on #/dev/loads carry an ⓘ; the Olympic bar sheet shows the standard weight', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./?dev#/dev/loads');
  const prompts = page.getByTestId('section-prompts');
  for (const [label, title, term] of [
    ['EZ curl', 'EZ curl bar', 'EZ curl bar'],
    ['Trap bar', 'Trap bar', 'Trap (hex) bar'],
    ['Smith', 'Smith machine bar', 'Smith machine'],
  ] as const) {
    await prompts.getByRole('button', { name: label, exact: true }).tap();
    const sheet = page.getByRole('dialog', { name: title });
    await expect(sheet.getByRole('button', { name: `What is ${term}?` })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  }

  await page.goto('./?dev#/dev/info');
  await expect(page.getByRole('heading', { level: 1, name: 'Glossary' })).toBeVisible();
  await expect(page.locator('[data-testid^="entry-"]')).toHaveCount(34);
  await page.getByTestId('entry-olympic-barbell').getByRole('button', { name: 'What is Olympic barbell?' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Olympic barbell' });
  await expect(sheet.getByTestId('info-weight')).toHaveText('Olympic bar: 45 lb / 20 kg');
  await shot(page, 'info-olympic-barbell');
  await sheet.getByRole('button', { name: 'Got it' }).tap();
  if (test.info().project.name === 'iPhone 15 Pro') {
    // The page scrolls inside a fixed layer: grow the viewport to see every drawing at once.
    await page.setViewportSize({ width: 393, height: 6300 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'reports/shots/1.7b/dev-info-all.png' });
  }
  expect(errors).toEqual([]);
});

test('dev pages stay hidden without the dev flag', async ({ page }) => {
  await page.goto('./#/dev/info');
  await expect(page.getByRole('heading', { level: 1, name: 'Glossary' })).toHaveCount(0);
});
