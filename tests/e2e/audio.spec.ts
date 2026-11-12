import { expect, test, type Locator, type Page } from '@playwright/test';

const ready = async (page: Page): Promise<Locator> => {
  await page.goto('/?draft=off');
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-scene', 'battlefield');
  return body;
};

const cues = async (body: Locator): Promise<{ fired: number; explosions: number }> =>
  JSON.parse((await body.getAttribute('data-audio-cues')) ?? '{}') as {
    fired: number;
    explosions: number;
  };

test('audio stays locked until a user gesture, then runs', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const body = await ready(page);
  // Page load alone must not create a playing context (autoplay policy).
  await expect(body).toHaveAttribute('data-audio-state', 'locked');
  await page.keyboard.press('w');
  await expect(body).toHaveAttribute('data-audio-state', 'running');
  expect(errors).toEqual([]);
});

test('firing and explosions produce audio cues without touching simulation results', async ({
  page,
}) => {
  const body = await ready(page);
  await page.keyboard.press('x'); // Gesture unlock + weapon select cue.
  await expect(body).toHaveAttribute('data-audio-state', 'running');
  expect(await cues(body)).toEqual({ fired: 0, explosions: 0 });
  await page.keyboard.press('Space');
  await expect(body).toHaveAttribute('data-phase', 'projectile');
  await expect.poll(async () => (await cues(body)).fired).toBe(1);
  await expect(body).toHaveAttribute('data-turn', '2', { timeout: 20000 });
  expect((await cues(body)).explosions).toBeGreaterThan(0);
  // Same deterministic outcome as the no-audio runs in other specs.
  await expect(body).toHaveAttribute('data-health', '100,100');
  expect(Number(await body.getAttribute('data-terrain-revision'))).toBeGreaterThan(0);
});

test('volume and mute controls persist and silence new cues', async ({ page }) => {
  const body = await ready(page);
  await page.keyboard.press('Escape');
  const menu = page.getByRole('dialog');
  await menu.getByLabel('Mute all audio').check();
  await menu.getByLabel('Master volume').fill('40');
  await menu.getByLabel('Music', { exact: true }).fill('0');
  await menu.getByRole('button', { name: 'Resume game' }).click();
  await expect(body).toHaveAttribute('data-muted', 'true');
  await expect(body).toHaveAttribute('data-master-volume', '40');
  await expect(body).toHaveAttribute('data-audio-state', 'muted');
  // Muted matches still fire and resolve identically, with zero cues actually played.
  await page.keyboard.press('Space');
  await expect(body).toHaveAttribute('data-turn', '2', { timeout: 20000 });
  expect(await cues(body)).toEqual({ fired: 0, explosions: 0 });
  await page.reload();
  await expect(body).toHaveAttribute('data-muted', 'true');
  await expect(body).toHaveAttribute('data-master-volume', '40');
  await page.keyboard.press('Escape');
  await expect(menu.getByLabel('Mute all audio')).toBeChecked();
  await expect(menu.getByLabel('Master volume')).toHaveValue('40');
  await menu.getByLabel('Mute all audio').uncheck();
  await menu.getByRole('button', { name: 'Resume game' }).click();
  await expect(body).toHaveAttribute('data-audio-state', 'running');
});

test('a missing Web Audio API never blocks the match', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'AudioContext', { value: undefined });
    Object.defineProperty(window, 'webkitAudioContext', { value: undefined });
  });
  const body = await ready(page);
  await page.keyboard.press('w');
  await expect(body).toHaveAttribute('data-audio-state', 'locked');
  await page.keyboard.press('Space');
  await expect(body).toHaveAttribute('data-turn', '2', { timeout: 20000 });
  expect(errors).toEqual([]);
});
