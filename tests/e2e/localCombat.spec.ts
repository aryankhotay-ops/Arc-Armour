import { expect, test } from '@playwright/test';

test('fires a local shot, deforms terrain, and advances the turn', async ({ page }) => {
  await page.goto('/?draft=off');
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-game-ready', 'true');
  await expect(body).toHaveAttribute('data-turn', '1');
  await expect(body).toHaveAttribute('data-active-player', 'player1');
  await expect(body).toHaveAttribute('data-terrain-revision', '0');

  await page.keyboard.press('Space');
  await expect(body).toHaveAttribute('data-phase', 'projectile');
  await expect(body).toHaveAttribute('data-turn', '2', { timeout: 15_000 });
  await expect(body).toHaveAttribute('data-active-player', 'player2');
  await expect(body).toHaveAttribute('data-phase', 'aiming');
  await expect
    .poll(async () => Number(await body.getAttribute('data-terrain-revision')))
    .toBeGreaterThan(0);
});

test('keyboard aiming and weapon selection update shared game state', async ({ page }) => {
  await page.goto('/?draft=off');
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-angle', '45');
  await expect(body).toHaveAttribute('data-weapon', 'standard-shell');

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(250);
  await page.keyboard.up('KeyW');
  await expect.poll(async () => Number(await body.getAttribute('data-angle'))).toBeGreaterThan(45);

  await page.keyboard.press('Tab');
  await expect(body).toHaveAttribute('data-weapon', 'heavy-shell');
});
