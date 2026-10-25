import { expect, test, type Page } from './fixtures';
import { monkey } from './helpers/monkey';
import { bar185, dbAll, seedFinished, usePlan } from './workout-helpers';

// SPEC 13.3 monkey test: 90 seconds of random taps and swipes on each main screen, no console
// errors, no stuck sheet, the app still responds (tests/helpers/monkey.ts). One test per screen
// so the seven screens run in parallel workers. By default only the iPhone projects run it (90 s
// each is long); PW_FULL_MATRIX=1 runs it on the Android widths and the 320 floor too.

const DURATION = Number(process.env.MONKEY_MS ?? 90_000);

test.describe.configure({ retries: 0 });
test.beforeEach(() => test.setTimeout(DURATION + 90_000));

/** A started plan day with some history, so every screen has real content to poke at. */
async function workout(page: Page): Promise<string> {
  await usePlan(page);
  await seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout\/[\w-]+$/);
  return (await dbAll<{ id: string; endedAt?: number }>(page, 'sessions')).find((s) => s.endedAt === undefined)!.id;
}

const SCREENS: Array<[name: string, seed: number, setup: (page: Page) => Promise<string>]> = [
  [
    'Today',
    11,
    async (page) => {
      await usePlan(page);
      return './';
    },
  ],
  ['Plans', 12, async () => './#/plans'],
  ['plan viewer', 13, async () => './#/plans/five-day-split'],
  ['day list', 14, async (page) => `./#/workout/${await workout(page)}`],
  ['exercise view', 15, async (page) => `./#/workout/${await workout(page)}/barbell-back-squat`],
  [
    'History',
    16,
    async (page) => {
      await page.goto('./');
      await seedFinished(page, { 'barbell-back-squat': [{ reps: 8, load: bar185 }] }, 3);
      await seedFinished(page, { 'barbell-back-squat': [{ reps: 9, load: bar185 }] }, 1);
      return './#/history';
    },
  ],
  ['Settings', 17, async () => './#/settings'],
];

for (const [name, seed, setup] of SCREENS) {
  test(`monkey: ${DURATION / 1000} s of random taps and swipes on ${name}`, async ({ page }) => {
    await page.goto('./');
    const home = await setup(page);
    await page.goto(home);
    await page.waitForTimeout(300);
    const stats = await monkey(page, { home, durationMs: DURATION, seed });
    console.log(`monkey ${name}: ${JSON.stringify(stats)}`);
    expect(stats.taps + stats.swipes).toBeGreaterThan(50);
  });
}
