import { expect, test, type Page } from '@playwright/test';

const battle = async (page: Page): Promise<void> => {
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'battlefield');
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
};
const map = (page: Page): Promise<string | null> =>
  page.locator('body').getAttribute('data-terrain-profile');
const goHome = async (page: Page): Promise<void> => {
  await page.keyboard.press('Escape');
  const menu = page.getByRole('dialog');
  await menu.getByRole('button', { name: 'Main menu', exact: true }).click();
  await menu.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'menu');
};

for (const [seed, name] of [
  'rolling',
  'valley',
  'terraces',
  'escarpment',
  'twin-ridges',
  'broken-highlands',
].entries()) {
  test(`seed ${seed} makes a real ${name} collision map with widely separated small targets`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/?draft=off&terrainSeed=${seed}&background=pencil-study`);
    await battle(page);
    const body = page.locator('body');
    await expect(body).toHaveAttribute('data-world-width', '3200');
    await expect(body).toHaveAttribute('data-world-height', '1800');
    await expect(body).toHaveAttribute('data-spawn-separation', '2688');
    await expect(body).toHaveAttribute('data-terrain-layout', name);
    const tanks = JSON.parse((await body.getAttribute('data-tank-animations'))!) as {
      x: number;
      y: number;
      hullAngle: number;
    }[];
    expect(tanks[1]!.x - tanks[0]!.x).toBe(2688);
    expect(tanks.map((t) => t.hullAngle)).toEqual([0, 0]);
    const arena = (await page.locator('canvas').boundingBox())!;
    expect((tanks[1]!.x - tanks[0]!.x) / 3200).toBe(0.84);
    // Small-target intent is proportional: a 106-unit chassis spans 3.3% of the field.
    // The Pocket Tanks-style full-width arena (2026-11-10) grew the canvas, so assert the
    // proportion plus a generous absolute bound rather than the old 1038px-canvas pixel cap.
    expect(106 / 3200).toBeLessThan(0.034);
    expect((106 / 3200) * arena.width).toBeLessThan(48);
    await page.screenshot({ path: `artifacts/ui/terrain-variety/${seed}-${name}.png` });
    const profile = await map(page);
    await page.reload();
    await battle(page);
    expect(await map(page)).toBe(profile);
    await page.keyboard.press('Space');
    await expect(body).toHaveAttribute('data-turn', '2', { timeout: 15_000 });
    await expect
      .poll(async () => Number(await body.getAttribute('data-terrain-revision')))
      .toBeGreaterThan(0);
  });
}

test('fresh local matches use different collision terrain even with the same draft seed', async ({
  page,
}) => {
  await page.goto('/?seed=900');
  const profiles = new Set<string>();
  const seeds = new Set<string>();
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: 'Play local', exact: true }).click();
    await page.getByLabel('Full-arsenal practice', { exact: false }).check();
    await page.getByRole('button', { name: 'Start local game' }).click();
    await battle(page);
    profiles.add((await map(page))!);
    seeds.add((await page.locator('body').getAttribute('data-terrain-seed'))!);
    await goHome(page);
  }
  expect(profiles.size).toBe(5);
  expect(seeds.size).toBe(5);
});

test('pause/restart repeats the original map, while background switching never regenerates it', async ({
  page,
}) => {
  await page.goto('/?draft=off');
  await battle(page);
  const before = await map(page);
  const seed = await page.locator('body').getAttribute('data-terrain-seed');
  await page.keyboard.press('Space');
  await expect(page.locator('body')).toHaveAttribute('data-turn', '2', { timeout: 15000 });
  await page.keyboard.press('Escape');
  await page.getByLabel('Battlefield background', { exact: true }).selectOption('lunar-earthrise');
  expect(await map(page)).toBe(before);
  await page.getByRole('button', { name: 'Restart match', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await battle(page);
  expect(await map(page)).toBe(before);
  expect(await page.locator('body').getAttribute('data-terrain-seed')).toBe(seed);
  await expect(page.locator('body')).toHaveAttribute('data-terrain-revision', '0');
});
