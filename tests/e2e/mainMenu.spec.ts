import { expect, test, type Page } from '@playwright/test';

const home = async (page: Page): Promise<void> => {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'menu');
};
const openLocal = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Play local', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
};
const returnFromBattle = async (page: Page): Promise<void> => {
  await page.keyboard.press('Escape');
  const menu = page.getByRole('dialog', { name: 'Paused game' });
  await menu.getByRole('button', { name: 'Main menu', exact: true }).click();
  await menu.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'menu');
};

test('default menu exposes all six functional destinations without autoplay or browser errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await home(page);
  await expect(page.locator('body')).toHaveAttribute('data-audio-state', 'locked');
  await expect(
    page.getByRole('navigation', { name: 'Game modes and options' }).getByRole('button'),
  ).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Play local', exact: true })).toBeFocused();
  for (const label of ['Online multiplayer', 'Controls', 'Settings', 'Credits']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: label, exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Back to main menu' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: label, exact: true })).toBeFocused();
  }
  expect(errors).toEqual([]);
});

test('keyboard arrows, enter, space, tab focus wrap and Escape all work', async ({ page }) => {
  await home(page);
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Online multiplayer', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Create a private room' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('End');
  await expect(page.getByRole('button', { name: 'Credits', exact: true })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Credits', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Play local' })).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Start local game' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Back to main menu' })).toBeFocused();
  for (let n = 0; n < 12; n++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
});

test('local draft route forwards the chosen seed and enters real combat', async ({ page }) => {
  await home(page);
  await openLocal(page);
  await page.getByLabel('Draft seed', { exact: true }).fill('1234');
  await page.getByRole('button', { name: 'Start local game' }).click();
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-scene', 'draft');
  await expect(body).toHaveAttribute('data-draft-seed', '1234');
  await expect(page.locator('.front-shell')).toHaveCount(0);
  await page.keyboard.press('a');
  await page.keyboard.press('Enter');
  await expect(body).toHaveAttribute('data-scene', 'battlefield');
  await expect(body).toHaveAttribute('data-drafted', 'true');
  await page.keyboard.press('Space');
  await expect(body).toHaveAttribute('data-phase', 'projectile');
  await returnFromBattle(page);
  await expect(page.locator('.front-shell')).toHaveCount(1);
  await expect(page.locator('dialog')).toHaveCount(1);
  await expect(page.locator('.battle-menu-trigger')).toHaveCount(0);
});

test('quick random match is exclusive and reproducible through repeated menu round trips', async ({
  page,
}) => {
  await home(page);
  let p1 = '',
    p2 = '';
  for (let n = 0; n < 3; n++) {
    await openLocal(page);
    await page.getByLabel('Quick random match', { exact: false }).check();
    await page.getByLabel('Draft seed', { exact: true }).fill('7654');
    await page.getByRole('button', { name: 'Start local game' }).click();
    const body = page.locator('body');
    await expect(body).toHaveAttribute('data-scene', 'battlefield');
    await expect(body).toHaveAttribute('data-drafted', 'true');
    const weapons1 = (await body.getAttribute('data-p1-weapons'))!;
    const weapons2 = (await body.getAttribute('data-p2-weapons'))!;
    expect(weapons1.split(',')).toHaveLength(6);
    expect(weapons1.split(',').filter((w) => weapons2.split(',').includes(w))).toEqual([
      'standard-shell',
    ]);
    if (n === 0) {
      p1 = weapons1;
      p2 = weapons2;
    } else {
      expect(weapons1).toBe(p1);
      expect(weapons2).toBe(p2);
    }
    await page.keyboard.press('x');
    await expect(body).not.toHaveAttribute('data-weapon', 'standard-shell');
    await returnFromBattle(page);
    await expect(page.locator('.front-shell')).toHaveCount(1);
    await expect(page.locator('.draft-home')).toHaveCount(0);
  }
});

test('full arsenal practice skips the draft and supports a confirmed return home', async ({
  page,
}) => {
  await home(page);
  await openLocal(page);
  await page.getByLabel('Full-arsenal practice', { exact: false }).check();
  await page.getByRole('button', { name: 'Start local game' }).click();
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-scene', 'battlefield');
  await expect(body).toHaveAttribute('data-drafted', 'false');
  expect((await body.getAttribute('data-p1-weapons'))!.split(',')).toHaveLength(12);
  await page.keyboard.press('Escape');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Main menu', exact: true }).click();
  await dialog.getByRole('button', { name: 'Keep playing' }).click();
  await expect(body).toHaveAttribute('data-scene', 'battlefield');
  await dialog.getByRole('button', { name: 'Main menu', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(body).toHaveAttribute('data-scene', 'menu');
});

test('weapon catalog browses actual data and connects to the playable draft', async ({ page }) => {
  await home(page);
  await page.getByRole('button', { name: 'Weapon selection', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('[data-weapon]')).toHaveCount(12);
  await dialog.getByRole('button', { name: /Rail Punch/ }).click();
  await expect(
    dialog.getByRole('region', { name: 'Weapon details' }).getByRole('heading'),
  ).toHaveText('Rail Punch');
  await expect(dialog.getByRole('button', { name: /Rail Punch/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(dialog.getByText(/Flat-fire slug/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Choose loadouts in the draft' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'draft');
  await page.getByRole('button', { name: /Main menu/ }).click();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'menu');
  await openLocal(page);
  await page.getByRole('button', { name: 'Start local game' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'draft');
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'menu');
});

test('online destination offers the lobby without opening sockets until requested', async ({
  page,
}) => {
  const sockets: string[] = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await home(page);
  await page.getByRole('button', { name: 'Online multiplayer', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Create a private room' })).toBeVisible();
  await expect(dialog.getByText('Join with a room code')).toBeVisible();
  await dialog.getByRole('button', { name: 'Play on this device instead' }).click();
  await expect(dialog.getByRole('heading', { name: 'Play local' })).toBeVisible();
  // Browsing the online screen opens NO game sockets; only Vite's own HMR socket exists.
  // A connection is attempted only when the player actually creates or joins a room.
  expect(sockets.every((url) => new URL(url).host === new URL(page.url()).host)).toBe(true);
  // With no server running, creating a room reports the failure without crashing the menu.
  await dialog.getByRole('button', { name: 'Back to main menu' }).click();
  await page.getByRole('button', { name: 'Online multiplayer', exact: true }).click();
  await dialog.getByRole('button', { name: 'Create room', exact: false }).click();
  await expect(dialog.locator('[data-online-error]')).toBeVisible({ timeout: 10000 });
  await expect(dialog.getByRole('heading', { name: 'Create a private room' })).toBeVisible();
});

test('menu settings persist, propagate into battle and can be restored', async ({ page }) => {
  await home(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Mute all audio', { exact: true }).check();
  await dialog.getByLabel('Master volume', { exact: true }).fill('40');
  await dialog.getByLabel('Show trajectory preview').uncheck();
  await expect(dialog.getByText('40%', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Unmute audio', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Unmute audio', exact: true })).toBeVisible();
  await openLocal(page);
  await page.getByLabel('Full-arsenal practice', { exact: false }).check();
  await page.getByRole('button', { name: 'Start local game' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-master-volume', '40');
  await expect(page.locator('body')).toHaveAttribute('data-muted', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-trajectory-preview', 'false');
  await returnFromBattle(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await dialog.getByRole('button', { name: 'Restore defaults' }).click();
  await expect(dialog.getByLabel('Mute all audio')).not.toBeChecked();
  await expect(dialog.getByLabel('Master volume')).toHaveValue('80');
  // Global Phaser captures from the previous battle must not eat native slider/checkbox keys.
  await dialog.getByLabel('Master volume').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByLabel('Master volume')).toHaveValue('75');
  await dialog.getByLabel('Mute all audio').focus();
  await page.keyboard.press('Space');
  await expect(dialog.getByLabel('Mute all audio')).toBeChecked();
});

test('quick mute is keyboard accessible and survives reload', async ({ page }) => {
  await home(page);
  await page.getByRole('button', { name: 'Mute audio', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Unmute audio', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Unmute audio', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mute audio', exact: true })).toBeVisible();
});

test('denied storage and missing audio never block menu navigation or gameplay', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Denied', 'SecurityError');
      },
    });
    Object.defineProperty(window, 'AudioContext', { value: undefined });
    Object.defineProperty(window, 'webkitAudioContext', { value: undefined });
  });
  await home(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Mute all audio').check();
  await page.keyboard.press('Escape');
  await openLocal(page);
  await page.getByLabel('Full-arsenal practice', { exact: false }).check();
  await page.getByRole('button', { name: 'Start local game' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'battlefield');
  await page.keyboard.press('Space');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'projectile');
  expect(errors).toEqual([]);
});

test.describe('touch navigation', () => {
  test.use({ hasTouch: true });
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    test(`all buttons and dialogs work at ${viewport.width} x ${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await home(page);
      const mute = page.getByRole('button', { name: 'Mute audio', exact: true });
      const muteBox = (await mute.boundingBox())!;
      expect(muteBox.x + muteBox.width).toBeLessThanOrEqual(viewport.width);
      await mute.tap();
      await expect(page.getByRole('button', { name: 'Unmute audio', exact: true })).toBeVisible();
      for (const name of [
        'Weapon selection',
        'Controls',
        'Settings',
        'Credits',
        'Online multiplayer',
      ]) {
        await page.getByRole('button', { name, exact: true }).tap();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        const box = (await dialog.boundingBox())!;
        expect(box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.height).toBeLessThanOrEqual(viewport.height);
        await dialog.getByRole('button', { name: 'Back to main menu' }).tap();
      }
      await page.getByRole('button', { name: 'Play local', exact: true }).tap();
      await page.getByLabel('Full-arsenal practice', { exact: false }).tap();
      await page.getByRole('button', { name: 'Start local game' }).tap();
      await expect(page.locator('body')).toHaveAttribute('data-scene', 'battlefield');
      await expect(page.locator('.front-shell')).toHaveCount(0);
    });
  }
});
