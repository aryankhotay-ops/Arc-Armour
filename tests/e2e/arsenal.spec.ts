import { expect, test, type Locator, type Page } from '@playwright/test';

// Browser coverage for weapon selection and firing. Game state is read from the data-*
// attributes the battlefield scene mirrors onto <body>.

const WEAPON_IDS = [
  'standard-shell',
  'heavy-shell',
  'cluster-bloom',
  'trident-shot',
  'ricochet-orb',
  'skyburst',
  'burrower',
  'landbreaker',
  'needle-dart',
  'time-capsule',
  'forking-star',
  'rail-punch',
] as const;
const SLOT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

const ready = async (page: Page): Promise<Locator> => {
  await page.goto('/?draft=off');
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-game-ready', 'true');
  return body;
};

const ammo = async (body: Locator): Promise<Record<string, number | string>> =>
  JSON.parse((await body.getAttribute('data-ammo')) ?? '{}') as Record<string, number | string>;

const eventCounts = async (body: Locator): Promise<Record<string, number>> =>
  JSON.parse((await body.getAttribute('data-event-counts')) ?? '{}') as Record<string, number>;

test('selects all twelve weapons with number keys and cycles with Z/X', async ({ page }) => {
  const body = await ready(page);
  for (const [index, id] of WEAPON_IDS.entries()) {
    await page.keyboard.press(SLOT_KEYS[index] ?? '1');
    await expect(body).toHaveAttribute('data-weapon', id);
  }
  await page.keyboard.press('x');
  await expect(body).toHaveAttribute('data-weapon', 'standard-shell');
  await page.keyboard.press('z');
  await expect(body).toHaveAttribute('data-weapon', 'rail-punch');
});

test('selects weapons by clicking arsenal slots', async ({ page }) => {
  const body = await ready(page);
  for (const index of [2, 5, 9, 0]) {
    await page.locator(`[data-weapon-id="${WEAPON_IDS[index]}"]`).click();
    await expect(body).toHaveAttribute('data-weapon', WEAPON_IDS[index] ?? '');
  }
});

test('clamps a flat-fire weapon to its elevation limit', async ({ page }) => {
  const body = await ready(page);
  await page.keyboard.down('w');
  await page.waitForTimeout(900);
  await page.keyboard.up('w');
  await expect.poll(async () => Number(await body.getAttribute('data-angle'))).toBeGreaterThan(60);
  await page.keyboard.press('=');
  await expect(body).toHaveAttribute('data-weapon', 'rail-punch');
  await expect(body).toHaveAttribute('data-angle', '30');
});

test('firing consumes one round, locks selection, then hands the turn over', async ({ page }) => {
  const body = await ready(page);
  await page.keyboard.press('4'); // Trident Shot: three warheads, one round.
  await expect(body).toHaveAttribute('data-weapon', 'trident-shot');
  expect((await ammo(body))['trident-shot']).toBe(3);

  await page.keyboard.press('Space');
  await expect(body).toHaveAttribute('data-phase', 'projectile');
  await expect(body).toHaveAttribute('data-projectiles', '3');
  await expect.poll(async () => (await ammo(body))['trident-shot']).toBe(2);

  // Selection is locked while the shot is in flight.
  await page.keyboard.press('2');
  await expect(body).toHaveAttribute('data-weapon', 'trident-shot');

  await expect(body).toHaveAttribute('data-turn', '2', { timeout: 20_000 });
  await expect(body).toHaveAttribute('data-active-player', 'player2');
  // Player 2 has an untouched inventory.
  expect((await ammo(body))['trident-shot']).toBe(3);
});

test('a depleted weapon cannot be selected again', async ({ page }) => {
  const body = await ready(page);
  for (let round = 0; round < 2; round += 1) {
    await page.keyboard.press('=');
    await expect(body).toHaveAttribute('data-weapon', 'rail-punch');
    await page.keyboard.press('Space');
    await expect(body).toHaveAttribute('data-active-player', 'player2', { timeout: 20_000 });
    await page.keyboard.press('Space');
    await expect(body).toHaveAttribute('data-active-player', 'player1', { timeout: 20_000 });
  }
  expect((await ammo(body))['rail-punch']).toBe(0);
  const depleted = page.locator('[data-weapon-id="rail-punch"]');
  await expect(depleted).toBeDisabled();
  await expect(depleted).toHaveAttribute('data-depleted', 'true');
  await expect(depleted.locator('.hud-slot-ammo')).toHaveText('EMPTY');
  await page.keyboard.press('=');
  await expect(body).not.toHaveAttribute('data-weapon', 'rail-punch');
});

test('advanced projectiles resolve and release every trail', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const body = await ready(page);

  // Cluster Bloom: one launch, one split into bomblets, several explosions.
  await page.keyboard.press('3');
  await page.keyboard.press('Space');
  await expect(body).toHaveAttribute('data-turn', '2', { timeout: 20_000 });
  const afterCluster = await eventCounts(body);
  expect(afterCluster['projectile-spawned']).toBe(1);
  expect(afterCluster.explosion).toBeGreaterThanOrEqual(2);

  // Time Capsule: sticks, then detonates on its fuse.
  await page.keyboard.press('0');
  await page.keyboard.press('Space');
  await expect(body).toHaveAttribute('data-turn', '3', { timeout: 20_000 });
  expect((await eventCounts(body))['projectile-stuck']).toBe(1);

  // Every trail fades out and is released once its projectiles are gone.
  await expect(body).toHaveAttribute('data-projectiles', '0');
  await expect(body).toHaveAttribute('data-trails', '0', { timeout: 5_000 });
  expect(errors).toEqual([]);
});
