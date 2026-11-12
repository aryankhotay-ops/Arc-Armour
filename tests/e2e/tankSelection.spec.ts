import { expect, test, type Page } from '@playwright/test';

const ids = [
  'tiger-i',
  'panther',
  't34-85',
  'is-2',
  'amx-13',
  'strv-103',
  'churchill',
  'abrams',
  'merkava-mk4',
  'leopard-2a7',
  'renault-ft17',
  'mark-v',
];
const ready = async (page: Page): Promise<void> => {
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'battlefield');
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
};
interface Barrel {
  modelId: string;
  angle: number;
  tip: { x: number; y: number };
  expected: { x: number; y: number };
  pivot: { x: number; y: number };
  length: number;
  recoil: number;
  layer: string;
}

test('gun keeps its world joint on sloping movement, recoils on a real shot, and player two can rotate independently', async ({
  page,
}) => {
  await page.goto('/?draft=off&terrainSeed=2&tank1=is-2&tank2=strv-103');
  await ready(page);
  const body = page.locator('body');
  await page.keyboard.down('d');
  await expect(body).toHaveAttribute('data-movement-remaining', '0', { timeout: 15000 });
  await page.keyboard.up('d');
  await setAngle(page, 50);
  let gun = (await barrels(page))[0]!;
  expect(Math.hypot(gun.tip.x - gun.expected.x, gun.tip.y - gun.expected.y)).toBeLessThan(0.2);
  await page.getByRole('button', { name: 'Fire selected weapon', exact: true }).click();
  await expect.poll(async () => (await barrels(page))[0]!.recoil).toBeGreaterThan(0);
  await expect(body).toHaveAttribute('data-turn', '2', { timeout: 15000 });
  await setAngle(page, 20, 1);
  const first = (await barrels(page))[1]!.tip;
  await setAngle(page, 80, 1);
  gun = (await barrels(page))[1]!;
  expect(Math.hypot(gun.tip.x - first.x, gun.tip.y - first.y)).toBeGreaterThan(40);
  expect(Math.hypot(gun.tip.x - gun.expected.x, gun.tip.y - gun.expected.y)).toBeLessThan(0.2);
  await page.screenshot({ path: 'artifacts/ui/tanks/sloped-is2-rotated-strv103.png' });
});
const barrels = (page: Page): Promise<Barrel[]> =>
  page.locator('body').evaluate((b) => JSON.parse(b.dataset.tankBarrels!));
const setAngle = async (page: Page, angle: number, player = 0): Promise<void> => {
  await page.getByRole('slider', { name: 'Firing angle', exact: true }).fill(String(angle));
  await expect
    .poll(async () => Math.abs((await barrels(page))[player]!.angle - angle))
    .toBeLessThan(0.1);
};

for (const id of ids) {
  test(`${id}: separate rotating gun stays on its physics muzzle for either facing`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/?draft=off&terrainSeed=2&tank1=${id}&tank2=${id}`);
    await ready(page);
    await expect(page.locator('body')).toHaveAttribute('data-tank-designs', `${id},${id}`);
    for (const angle of [15, 75, 35]) {
      await setAngle(page, angle);
      const observations = await barrels(page);
      for (const gun of observations) {
        expect(gun.layer).toBe('separate-sprite');
        expect(Math.hypot(gun.tip.x - gun.expected.x, gun.tip.y - gun.expected.y)).toBeLessThan(
          0.2,
        );
        expect(Math.hypot(gun.tip.x - gun.pivot.x, gun.tip.y - gun.pivot.y)).toBeCloseTo(
          gun.length,
          3,
        );
      }
    }
    await page.locator('canvas').screenshot({ path: `artifacts/ui/tanks/${id}-battlefield.png` });
    // Focus is still on a native range input; Space deliberately must NOT fire from there.
    await page.getByRole('button', { name: 'Fire selected weapon', exact: true }).click();
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'projectile');
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).toHaveAttribute('data-paused', 'true');
    const before = await page.locator('body').getAttribute('data-tank-barrels');
    await page.waitForTimeout(100);
    expect(await page.locator('body').getAttribute('data-tank-barrels')).toBe(before);
    expect(errors).toEqual([]);
  });
}

test('visual tank picker chooses independent players, previews only the gun, persists and reaches real battle', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1800 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Play local', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Tank selection', exact: true });
  await expect(picker.locator('[data-tank-roster="0"] input')).toHaveCount(14);
  await picker.getByRole('radio', { name: 'Player 1: Tiger I', exact: true }).check();
  await picker.getByRole('button', { name: 'Choose Player 2 tank', exact: true }).click();
  await picker.getByRole('radio', { name: 'Player 2: Renault FT-17', exact: true }).check();
  await expect(picker.locator('[data-tank-preview="0"] [data-tank-name]')).toHaveText('Tiger I');
  await expect(picker.locator('[data-tank-preview="1"] [data-tank-name]')).toHaveText(
    'Renault FT-17',
  );
  const hullBefore = await picker
    .locator('[data-tank-preview="0"] [data-preview-hull]')
    .innerHTML();
  await picker.getByRole('slider', { name: 'Tank preview gun angle', exact: true }).fill('80');
  await expect(picker.locator('[data-tank-preview="0"] [data-preview-gun]')).toHaveAttribute(
    'transform',
    /rotate\(-80\)/,
  );
  expect(await picker.locator('[data-tank-preview="0"] [data-preview-hull]').innerHTML()).toBe(
    hullBefore,
  );
  await picker.screenshot({ path: 'artifacts/ui/tanks/selection-roster.png' });
  await page.getByLabel('Full-arsenal practice', { exact: false }).check();
  await page.getByRole('button', { name: 'Start local game' }).click();
  await ready(page);
  await expect(page.locator('body')).toHaveAttribute('data-tank-designs', 'tiger-i,renault-ft17');
  await expect(page.locator('[data-player="player1"] .hud-player-heading strong')).toHaveText(
    'P1 / TIGER I',
  );
  await page.goto('/?draft=off');
  await ready(page);
  await expect(page.locator('body')).toHaveAttribute('data-tank-designs', 'tiger-i,renault-ft17');
});

test('mobile radio cards and player tabs have real touch sizes and support same-model matches', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Play local', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Tank selection', exact: true });
  await picker.getByRole('radio', { name: 'Player 1: Strv 103', exact: true }).check();
  await picker.getByRole('button', { name: 'Choose Player 2 tank', exact: true }).click();
  await picker.getByRole('radio', { name: 'Player 2: Strv 103', exact: true }).check();
  for (const tab of await picker.locator('[data-tank-tab]').all())
    expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  const card = picker.locator('[data-tank-roster="1"] label').first();
  expect((await card.boundingBox())!.height).toBeGreaterThanOrEqual(90);
  await picker.screenshot({ path: 'artifacts/ui/tanks/selection-phone.png' });
  await page.getByLabel('Full-arsenal practice', { exact: false }).check();
  await page.getByRole('button', { name: 'Start local game' }).click();
  await ready(page);
  await expect(page.locator('body')).toHaveAttribute('data-tank-designs', 'strv-103,strv-103');
});

test('denied storage, real weapon draft, restart and rematch paths retain the chosen models', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('Denied');
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Play local', exact: true }).click();
  await page.getByRole('radio', { name: 'Player 1: Mark V', exact: true }).check();
  await page.getByRole('button', { name: 'Choose Player 2 tank', exact: true }).click();
  await page.getByRole('radio', { name: 'Player 2: AMX-13', exact: true }).check();
  await page.getByRole('button', { name: 'Start local game' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'draft');
  await page.keyboard.press('a');
  await page.keyboard.press('Enter');
  await ready(page);
  await expect(page.locator('body')).toHaveAttribute('data-tank-designs', 'mark-v,amx-13');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Restart match', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await ready(page);
  await expect(page.locator('body')).toHaveAttribute('data-tank-designs', 'mark-v,amx-13');
  await page.screenshot({ path: 'artifacts/ui/tanks/mark-v-amx-13-drafted.png' });
});
