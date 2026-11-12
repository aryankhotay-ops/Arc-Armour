import { expect, test } from '@playwright/test';

test('opens on the main menu without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');
  await expect(page).toHaveTitle('Arc & Armor');
  await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'menu');
  await expect(page.getByRole('button', { name: 'Play local', exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('loads the responsive Phaser battlefield without browser errors', async ({ page }) => {
  const errors: string[] = [];

  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });

  await page.goto('/?draft=off');
  await expect(page).toHaveTitle('Arc & Armor');
  await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'battlefield');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  const desktopBox = await canvas.boundingBox();
  expect(desktopBox).not.toBeNull();
  expect(desktopBox?.width).toBeLessThanOrEqual(1280);
  expect(desktopBox?.height).toBeLessThanOrEqual(720);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(canvas).toBeVisible();
  const mobileBox = await canvas.boundingBox();
  expect(mobileBox).not.toBeNull();
  expect(mobileBox?.width).toBeLessThanOrEqual(390);
  expect(mobileBox?.height).toBeLessThanOrEqual(844);

  expect(errors).toEqual([]);
});
