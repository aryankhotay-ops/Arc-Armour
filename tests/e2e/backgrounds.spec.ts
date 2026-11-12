import { expect, test, type Page } from '@playwright/test';

const themes = [
  'golden-valley',
  'desert-canyon',
  'moonlit-alpine',
  'pencil-study',
  'lunar-earthrise',
] as const;
const waitBattle = async (page: Page): Promise<void> => {
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'battlefield');
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
};
const state = (page: Page): Promise<Record<string, string | undefined>> =>
  page.locator('body').evaluate((body) => {
    const data = body.dataset;
    return Object.fromEntries(
      [
        'phase',
        'turn',
        'activePlayer',
        'terrainRevision',
        'health',
        'ammo',
        'projectilePositions',
        'angle',
        'power',
        'movementRemaining',
        'tankAnimations',
        'eventCounts',
      ].map((key) => [key, data[key]]),
    );
  });

for (const mobile of [false, true]) {
  for (const id of themes) {
    test(`${id} loads as a real scenery plate at ${mobile ? 'phone landscape' : 'desktop'} size without touching the battlefield`, async ({
      page,
    }) => {
      await page.setViewportSize(
        mobile ? { width: 844, height: 390 } : { width: 1440, height: 900 },
      );
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      let assetUrl = '';
      page.on('response', (response) => {
        if (response.url().includes(`${id}.webp`)) assetUrl = response.url();
      });
      await page.goto(`/?draft=off&background=${id}`);
      await waitBattle(page);
      await expect(page.locator('body')).toHaveAttribute('data-background', id);
      await expect(page.locator('body')).toHaveAttribute('data-background-render', 'webp');
      await expect(page.locator('body')).toHaveAttribute('data-world-width', '3200');
      await expect(page.locator('body')).toHaveAttribute('data-world-height', '1800');
      await expect(page.locator('body')).toHaveAttribute('data-spawn-separation', '2688');
      await expect(page.locator('body')).toHaveAttribute(
        'data-terrain-style',
        id === 'pencil-study' ? 'graphite' : id === 'lunar-earthrise' ? 'regolith' : 'arcade',
      );
      const comparison = await page.evaluate(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const actual = document.querySelector('canvas')!;
        const expected = document.createElement('canvas');
        expected.width = 1280;
        expected.height = 720;
        const c = expected.getContext('2d')!;
        c.drawImage(image, 0, 0, 1280, 720);
        return {
          width: image.naturalWidth,
          height: image.naturalHeight,
          expected: Array.from(c.getImageData(30, 30, 1, 1).data),
          actual: Array.from(actual.getContext('2d')!.getImageData(30, 30, 1, 1).data),
        };
      }, assetUrl);
      expect(comparison.width).toBe(1920);
      expect(comparison.height).toBe(1080);
      for (let i = 0; i < 4; i++)
        expect(Math.abs(comparison.actual[i]! - comparison.expected[i]!)).toBeLessThanOrEqual(3);
      const canvas = page.locator('canvas');
      const rect = (await canvas.boundingBox())!;
      expect(Math.abs(rect.width / rect.height - 16 / 9)).toBeLessThan(0.02);
      await canvas.screenshot({
        path: `artifacts/ui/backgrounds/${id}-${mobile ? 'phone-landscape' : 'desktop'}.png`,
      });
      if (id === 'pencil-study' || id === 'lunar-earthrise')
        await page.screenshot({
          path: `artifacts/ui/backgrounds/${id}-${mobile ? 'phone-landscape' : 'desktop'}-full.png`,
        });
      expect(errors).toEqual([]);
    });
  }
}

test('native selection previews, persists and reaches combat without changing rules', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play local', exact: true }).click();
  const select = page.getByLabel('Battlefield background', { exact: true });
  await select.selectOption('desert-canyon');
  await expect(page.locator('body')).toHaveAttribute('data-background', 'desert-canyon');
  const preview = page.locator('[data-background-preview]');
  await expect(preview).toHaveAttribute('alt', /Desert Canyon/);
  expect(
    await preview.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 1920),
  ).toBe(true);
  expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await page.getByLabel('Full-arsenal practice', { exact: false }).check();
  await page.getByRole('button', { name: 'Start local game' }).click();
  await waitBattle(page);
  await expect(page.locator('body')).toHaveAttribute('data-background', 'desert-canyon');
  await page.goto('/?draft=off');
  await waitBattle(page);
  await expect(page.locator('body')).toHaveAttribute('data-background', 'desert-canyon');
});

test('switching all five backgrounds during a paused live shot preserves the exact match state', async ({
  page,
}) => {
  await page.goto('/?draft=off');
  await waitBattle(page);
  await page.keyboard.press('Space');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'projectile');
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).toHaveAttribute('data-paused', 'true');
  const snapshot = await state(page);
  for (const id of themes) {
    await page.getByLabel('Battlefield background', { exact: true }).selectOption(id);
    await expect(page.locator('body')).toHaveAttribute('data-background', id);
    await expect(page.locator('body')).toHaveAttribute(
      'data-terrain-style',
      id === 'pencil-study' ? 'graphite' : id === 'lunar-earthrise' ? 'regolith' : 'arcade',
    );
    expect(await state(page)).toEqual(snapshot);
  }
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-paused', 'false');
  await expect
    .poll(async () => (await state(page)).projectilePositions)
    .not.toBe(snapshot.projectilePositions);
});

for (const id of ['pencil-study', 'lunar-earthrise']) {
  test(`${id} keeps matching cratered material when changing themes without resetting a played turn`, async ({
    page,
  }) => {
    await page.goto(`/?draft=off&background=${id}`);
    await waitBattle(page);
    const body = page.locator('body');
    await page.keyboard.press('Space');
    await expect(body).toHaveAttribute('data-turn', '2', { timeout: 15_000 });
    await expect
      .poll(async () => Number(await body.getAttribute('data-terrain-revision')))
      .toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect(body).toHaveAttribute('data-paused', 'true');
    const before = await state(page);
    for (const theme of ['golden-valley', id]) {
      await page.getByLabel('Battlefield background', { exact: true }).selectOption(theme);
      expect(await state(page)).toEqual(before);
    }
    await page.getByRole('button', { name: 'Resume game', exact: true }).click();
    const pixel = await page
      .locator('canvas')
      .evaluate((canvas: HTMLCanvasElement) =>
        Array.from(canvas.getContext('2d')!.getImageData(40, 690, 1, 1).data),
      );
    expect(Math.max(...pixel.slice(0, 3)) - Math.min(...pixel.slice(0, 3))).toBeLessThan(25);
    await page.screenshot({ path: `artifacts/ui/backgrounds/${id}-after-crater.png` });
  });
}

test('missing images gracefully fall back to the original landscape and remain playable', async ({
  page,
}) => {
  await page.route('**/*.webp*', (route) => route.abort());
  await page.goto('/?draft=off&background=moonlit-alpine');
  await waitBattle(page);
  await expect(page.locator('body')).toHaveAttribute(
    'data-background-render',
    'procedural-fallback',
  );
  await expect(page.locator('body')).toHaveAttribute('data-background', 'golden-valley');
  await page.keyboard.press('Space');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'projectile');
});

test('denied storage keeps the chosen background across menu-to-battle scenes', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('Denied');
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Play local', exact: true }).click();
  await page.getByLabel('Battlefield background', { exact: true }).selectOption('moonlit-alpine');
  await page.getByLabel('Full-arsenal practice', { exact: false }).check();
  await page.getByRole('button', { name: 'Start local game' }).click();
  await waitBattle(page);
  await expect(page.locator('body')).toHaveAttribute('data-background', 'moonlit-alpine');
});
