// GOLDEN 4: a hotel gym. Settings, + New gym, Hotel gym, Make active, then Quick workout fits that gym.
import { expect, test } from '../fixtures';
import { dbAll } from '../workout-helpers';
import { pastIntake, readIdeas } from '../helpers/quick';

test.describe.configure({ retries: 0 });

type Gym = { id: string; name: string; isActive: boolean; equipment: string[] };
type Sess = { id: string; gymId: string; endedAt?: number; exerciseIds: string[] };

test('golden: switch to a hotel gym and Quick workout fits what is there', async ({ page }) => {
  await pastIntake(page);
  const home = (await dbAll<Gym>(page, 'gyms')).find((g) => g.isActive)!;
  await page.getByRole('link', { name: 'Settings' }).or(page.getByRole('button', { name: 'Settings' })).first().tap();
  await page.getByTestId('settings-gyms').tap();
  await expect(page.getByTestId('gyms-list')).toBeVisible();
  await page.getByTestId('settings-new-gym').tap();
  await page.getByTestId('preset-hotel').tap();
  await expect(page.getByTestId('new-gym-equipment')).toBeVisible();
  await page.getByTestId('add-gym').tap();
  await expect(page.getByTestId('gyms-list')).toContainText('Hotel gym');
  await page.getByRole('button', { name: 'Make active' }).tap();
  await expect.poll(async () => (await dbAll<Gym>(page, 'gyms')).find((g) => g.isActive)?.name).toBe('Hotel gym');
  const hotel = (await dbAll<Gym>(page, 'gyms')).find((g) => g.isActive)!;
  expect(hotel.id).not.toBe(home.id);
  expect(hotel.equipment).not.toContain('barbell');

  await page.goto('./');
  await page.getByTestId('build-card').tap();
  await expect(page.getByRole('heading', { name: 'Quick workout' })).toBeVisible();
  await page.getByTestId('min-30').tap();
  await expect(page.getByTestId('min-30')).toHaveAttribute('aria-pressed', 'true');
  const ideas = await readIdeas(page);
  expect(ideas.length).toBeGreaterThan(0);
  for (const idea of ideas) for (const g of idea.gearIcons) expect(hotel.equipment, `${idea.id} uses ${g}`).toContain(g);

  await page.locator('[data-concept]').first().tap();
  await page.getByTestId('quick-start').tap();
  await expect(page.getByTestId('check-current')).toBeVisible();
  const started = (await dbAll<Sess>(page, 'sessions')).find((s) => s.endedAt === undefined)!;
  expect(started.gymId).toBe(hotel.id);
  expect(started.exerciseIds.length).toBeGreaterThan(0);
  // Nothing that needs a barbell or a rack in a hotel room.
  for (const id of started.exerciseIds) expect(id, id).not.toMatch(/^barbell-/);
});
