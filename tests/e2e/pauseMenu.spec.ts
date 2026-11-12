import { expect, test, type Page } from '@playwright/test';

const ready = async (page: Page, url = '/?draft=off'): Promise<void> => {
  await page.goto(url);
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'battlefield');
  await expect(page.locator('body')).toHaveAttribute('data-paused', 'false');
};

const snapshot = async (page: Page): Promise<Record<string, string | undefined>> =>
  page.locator('body').evaluate((body) => {
    const d = body.dataset;
    return {
      phase: d.phase,
      turn: d.turn,
      player: d.activePlayer,
      positions: d.projectilePositions,
      angle: d.angle,
      power: d.power,
      ammo: d.ammo,
      weapon: d.weapon,
      health: d.health,
      terrain: d.terrainRevision,
      events: d.eventCounts,
    };
  });

test('pauses a live shot, rejects gameplay input and resumes the same projectile', async ({
  page,
}) => {
  await ready(page);
  const body = page.locator('body');
  await page.keyboard.press('Space');
  await expect(body).toHaveAttribute('data-phase', 'projectile');
  await page.keyboard.press('p');
  const menu = page.getByRole('dialog', { name: 'Paused game' });
  await expect(menu).toBeVisible();
  await expect(body).toHaveAttribute('data-paused', 'true');
  const frozen = await snapshot(page);
  expect(frozen.positions).not.toBe('[]');
  // Space may activate a focused native control, but must never fire the tank.
  await menu.getByText('How to play', { exact: true }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('2');
  await page.keyboard.press('x');
  await page.keyboard.down('w');
  await page.waitForTimeout(700);
  await page.keyboard.up('w');
  expect(await snapshot(page)).toEqual(frozen);
  await page.keyboard.press('Escape');
  await expect(menu).not.toBeVisible();
  await expect(body).toHaveAttribute('data-paused', 'false');
  await expect.poll(async () => (await snapshot(page)).positions).not.toBe(frozen.positions);
  await expect(body).toHaveAttribute('data-turn', '2', { timeout: 15_000 });
});

test('help pauses aiming, traps focus and clears held keys on resume', async ({ page }) => {
  await ready(page);
  const body = page.locator('body');
  await page.keyboard.down('w');
  await page.keyboard.press('h');
  await expect(body).toHaveAttribute('data-paused', 'true');
  const menu = page.getByRole('dialog');
  await expect(menu.locator('details')).toHaveAttribute('open', '');
  const frozen = await snapshot(page);
  await page.keyboard.up('w');
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await menu.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('p');
  await expect(body).toHaveAttribute('data-paused', 'false');
  await page.waitForTimeout(250);
  expect(await snapshot(page)).toEqual(frozen);
});

test('native menu buttons and settings work with keyboard only without firing', async ({
  page,
}) => {
  await ready(page);
  const before = await snapshot(page);
  await page.getByRole('button', { name: 'Pause game', exact: true }).focus();
  await page.keyboard.press('Space');
  const menu = page.getByRole('dialog');
  await expect(menu).toBeVisible();
  await menu.getByLabel('Show trajectory preview').focus();
  await page.keyboard.press('Space');
  await expect(menu.getByLabel('Show trajectory preview')).not.toBeChecked();
  await menu.getByRole('button', { name: 'Resume game' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(menu.getByRole('button', { name: 'New weapon draft' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(menu.getByRole('button', { name: 'Resume game' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(menu).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-paused', 'false');
  expect(await snapshot(page)).toEqual(before);
  await page.keyboard.press('Space');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'projectile');
});

test('visual preferences persist across reloads', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  const menu = page.getByRole('dialog');
  await menu.getByLabel('Show trajectory preview').uncheck();
  await menu.getByLabel('Screen shake', { exact: true }).uncheck();
  await menu.getByRole('button', { name: 'Resume game' }).click();
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-trajectory-preview', 'false');
  await expect(body).toHaveAttribute('data-screen-shake', 'false');
  await page.reload();
  await expect(body).toHaveAttribute('data-trajectory-preview', 'false');
  await expect(body).toHaveAttribute('data-screen-shake', 'false');
  await page.keyboard.press('Escape');
  await expect(menu.getByLabel('Show trajectory preview')).not.toBeChecked();
  await expect(menu.getByLabel('Screen shake', { exact: true })).not.toBeChecked();
});

test('reduced motion overrides saved screen shake', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Screen shake', { exact: true })).toBeChecked();
  await expect(page.locator('body')).toHaveAttribute('data-screen-shake', 'false');
});

test('restart confirms before clearing progress and preserves drafted loadouts', async ({
  page,
}) => {
  await page.goto('/?draft=on&seed=1234');
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-scene', 'draft');
  await page.keyboard.press('a');
  await page.keyboard.press('Enter');
  await expect(body).toHaveAttribute('data-scene', 'battlefield');
  const p1 = await body.getAttribute('data-p1-weapons');
  const p2 = await body.getAttribute('data-p2-weapons');
  await page.keyboard.press('Space');
  await expect(body).toHaveAttribute('data-turn', '2', { timeout: 15_000 });
  const menu = page.getByRole('dialog');
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape');
    await menu.getByRole('button', { name: 'Restart match', exact: true }).click();
    await expect(menu.getByRole('button', { name: 'Confirm', exact: true })).toBeVisible();
    // Escape cancels confirmation, not the paused match.
    await page.keyboard.press('Escape');
    await expect(body).toHaveAttribute('data-paused', 'true');
    await expect(menu.getByRole('button', { name: 'Confirm', exact: true })).toBeHidden();
    await menu.getByRole('button', { name: 'Restart match', exact: true }).click();
    await menu.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(body).toHaveAttribute('data-paused', 'false');
    await expect(body).toHaveAttribute('data-turn', '1');
    await expect(body).toHaveAttribute('data-terrain-revision', '0');
    await expect(body).toHaveAttribute('data-health', '100,100');
    await expect(body).toHaveAttribute('data-p1-weapons', p1!);
    await expect(body).toHaveAttribute('data-p2-weapons', p2!);
    await expect(page.getByRole('button', { name: 'Pause game', exact: true })).toHaveCount(1);
    await expect(page.locator('dialog')).toHaveCount(1);
  }
  // Repeated scene restarts must not multiply one-shot keyboard handlers.
  await page.keyboard.press('x');
  await expect(body).toHaveAttribute('data-weapon', p1!.split(',')[1]!);
});

test('new draft requires confirmation and cleans up the old menu', async ({ page }) => {
  await ready(page);
  await page.keyboard.press('Escape');
  const menu = page.getByRole('dialog');
  await menu.getByRole('button', { name: 'New weapon draft' }).click();
  await menu.getByRole('button', { name: 'Keep playing' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'battlefield');
  await menu.getByRole('button', { name: 'New weapon draft' }).click();
  await menu.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'draft');
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause game', exact: true })).toHaveCount(0);
  await page.keyboard.press('a');
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'battlefield');
  await page.keyboard.press('Escape');
  await expect(menu).toBeVisible();
});

test('window focus loss pauses without automatically resuming', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-paused', 'true');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(body).toHaveAttribute('data-paused', 'true');
  await page.getByRole('button', { name: 'Resume game' }).click();
  await expect(body).toHaveAttribute('data-paused', 'false');
});

test.describe('touch menu', () => {
  test.use({ hasTouch: true });
  test('pause and help work on a small touch viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(page);
    const trigger = page.getByRole('button', { name: 'Pause game', exact: true });
    const bounds = await trigger.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await trigger.tap();
    const menu = page.getByRole('dialog');
    await menu.getByText('How to play', { exact: true }).tap();
    await expect(menu.getByText('Pause / help', { exact: true })).toBeVisible();
    await menu.getByLabel('Show trajectory preview').tap();
    await expect(menu.getByLabel('Show trajectory preview')).not.toBeChecked();
    await menu.getByRole('button', { name: 'Resume game' }).tap();
    await expect(page.locator('body')).toHaveAttribute('data-paused', 'false');
  });
});

test('denied browser storage does not prevent play or changing settings', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Storage disabled', 'SecurityError');
      },
    });
  });
  await ready(page);
  await page.keyboard.press('Escape');
  await page.getByLabel('Show trajectory preview').uncheck();
  await page.getByRole('button', { name: 'Resume game' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-trajectory-preview', 'false');
  await page.keyboard.press('Space');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'projectile');
  expect(errors).toEqual([]);
});
