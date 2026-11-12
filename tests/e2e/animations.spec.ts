import { expect, test, type Locator, type Page } from '@playwright/test';

interface TankAnimationState {
  x: number;
  y: number;
  angle: number;
  trackDistance: number;
  recoil: number;
  hitAlpha: number;
  destroyed: boolean;
  destructionAge: number;
}
const ready = async (page: Page): Promise<Locator> => {
  await page.goto('/?draft=off');
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-scene', 'battlefield');
  return body;
};
const tanks = async (body: Locator): Promise<TankAnimationState[]> =>
  JSON.parse((await body.getAttribute('data-tank-animations')) ?? '[]') as TankAnimationState[];
const counts = async (body: Locator): Promise<Record<string, number>> =>
  JSON.parse((await body.getAttribute('data-animation-counts')) ?? '{}') as Record<string, number>;

test('tracks follow accepted movement, stop at rest, and the barrel smoothly reaches the real aim', async ({
  page,
}) => {
  const body = await ready(page);
  const start = (await tanks(body))[0]!;
  await page.keyboard.down('d');
  await expect.poll(async () => (await tanks(body))[0]!.trackDistance).toBeGreaterThan(15);
  await page.keyboard.up('d');
  // Let the final input frame complete before checking that tracks stop with the tank.
  await page.waitForTimeout(80);
  const moved = (await tanks(body))[0]!;
  expect(moved.x).toBeGreaterThan(start.x);
  expect((await counts(body))['movement-dust']).toBeGreaterThan(0);
  await page.waitForTimeout(180);
  expect((await tanks(body))[0]!.trackDistance).toBe(moved.trackDistance);
  const box = (await page.locator('canvas').boundingBox())!;
  const previousAim = await body.getAttribute('data-angle');
  await page.mouse.click(box.x + (650 / 1280) * box.width, box.y + (340 / 720) * box.height);
  // Pointer commands publish on the next Phaser frame, not during Playwright's click call.
  // Wait for the new authoritative target instead of accidentally testing against stale aim.
  await expect(body).not.toHaveAttribute('data-angle', previousAim!);
  const aim = Number(await body.getAttribute('data-angle'));
  await expect.poll(async () => Math.abs((await tanks(body))[0]!.angle - aim)).toBeLessThan(1);
  expect((await tanks(body))[0]!.x).toBe(moved.x);
});

test('live projectile animation remains on real physics samples and ends on impact', async ({
  page,
}) => {
  const body = await ready(page);
  await page.keyboard.press('Space');
  await expect(body).toHaveAttribute('data-phase', 'projectile');
  const samples = await page.evaluate(async () => {
    const frames: { error: number; lag: number; count: number }[] = [];
    for (let i = 0; i < 70; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const d = document.body.dataset;
      const physics = JSON.parse(d.projectilePositions ?? '[]') as number[][];
      const visual = JSON.parse(d.renderedProjectiles ?? '[]') as {
        id: number;
        x: number;
        y: number;
        targetAge: number;
      }[];
      for (const p of physics) {
        const v = visual.find((v) => v.id === p[0]);
        if (v !== undefined)
          frames.push({
            error: Math.hypot(v.x - p[1]!, v.y - p[2]!),
            lag: p[3]! - v.targetAge,
            count: visual.length,
          });
      }
    }
    return frames;
  });
  expect(samples.length).toBeGreaterThan(10);
  for (const frame of samples) {
    expect(frame.error).toBeLessThan(14);
    expect(frame.lag).toBeGreaterThanOrEqual(-1e-9);
    expect(frame.lag).toBeLessThanOrEqual(1 / 60 + 1e-9);
  }
  await expect(body).toHaveAttribute('data-turn', '2', { timeout: 20_000 });
  await expect(body).toHaveAttribute('data-rendered-projectiles', '[]');
  expect((await counts(body)).explosion).toBeGreaterThan(0);
  expect((await counts(body))['terrain-impact']).toBeGreaterThan(0);
  await expect(body).toHaveAttribute('data-trails', '0', { timeout: 5000 });
  await expect(body).toHaveAttribute('data-particles', '0', { timeout: 5000 });
});

test('recoil and all animation clocks freeze while paused, then recover', async ({ page }) => {
  const body = await ready(page);
  // Observe inside the browser, not via polling round trips that can miss a 320 ms recoil
  // under concurrent test load. Pause through the normal P key listener on its first frame.
  await page.evaluate(() => {
    let frames = 0;
    const pauseOnRecoil = (): void => {
      const state = JSON.parse(document.body.dataset.tankAnimations ?? '[]') as {
        recoil: number;
      }[];
      if ((state[0]?.recoil ?? 0) > 0) {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'p', code: 'KeyP', bubbles: true }),
        );
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'p', code: 'KeyP', bubbles: true }));
      } else if (++frames < 240) requestAnimationFrame(pauseOnRecoil);
    };
    requestAnimationFrame(pauseOnRecoil);
  });
  await page.keyboard.press('Space');
  await expect(body).toHaveAttribute('data-paused', 'true');
  expect((await tanks(body))[0]!.recoil).toBeGreaterThan(0);
  const tankState = await body.getAttribute('data-tank-animations');
  const particles = await body.getAttribute('data-particles');
  const projectiles = await body.getAttribute('data-rendered-projectiles');
  await page.waitForTimeout(300);
  await expect(body).toHaveAttribute('data-tank-animations', tankState!);
  await expect(body).toHaveAttribute('data-particles', particles!);
  await expect(body).toHaveAttribute('data-rendered-projectiles', projectiles!);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await tanks(body))[0]!.recoil).toBe(0);
});

test('real tank damage triggers one destruction sequence, a persistent wreck and clean rematch', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const body = await ready(page);
  // Real high-elevation/low-power heavy rounds, not a debug kill. Standard Shell's increased
  // reach no longer reliably self-hits at its minimum power; use the close-range arsenal.
  const initialSeed = await body.getAttribute('data-terrain-seed');
  const initialMap = await body.getAttribute('data-terrain-profile');
  const configured = new Set<string>();
  for (let turn = 0; turn < 12; turn++) {
    if ((await body.getAttribute('data-phase')) === 'game-over') break;
    const player = (await body.getAttribute('data-active-player'))!;
    if (!configured.has(player)) {
      await page.keyboard.down('w');
      await page.keyboard.down('q');
      await expect(body).toHaveAttribute('data-angle', '85');
      await expect(body).toHaveAttribute('data-power', '20');
      await page.keyboard.up('w');
      await page.keyboard.up('q');
      configured.add(player);
    }
    const ammo = JSON.parse((await body.getAttribute('data-ammo'))!) as Record<
      string,
      number | string
    >;
    await page.keyboard.press(Number(ammo['heavy-shell']) > 0 ? '2' : '8');
    const number = Number(await body.getAttribute('data-turn'));
    await page.keyboard.press('Space');
    await expect
      .poll(
        async () =>
          (await body.getAttribute('data-phase')) === 'game-over' ||
          Number(await body.getAttribute('data-turn')) > number,
        { timeout: 15_000 },
      )
      .toBe(true);
  }
  await expect(body).toHaveAttribute('data-phase', 'game-over');
  expect((await counts(body))['tank-hit']).toBeGreaterThan(0);
  expect((await counts(body))['tank-destruction']).toBe(1);
  expect((await tanks(body)).filter((t) => t.destroyed)).toHaveLength(1);
  await page.screenshot({ path: testInfo.outputPath('tank-destruction.png') });
  await page.waitForTimeout(1800);
  expect((await counts(body))['tank-destruction']).toBe(1);
  await expect(body).toHaveAttribute('data-particles', '0', { timeout: 5000 });
  await page.screenshot({ path: testInfo.outputPath('tank-wreck.png') });
  await page.keyboard.press('r');
  await expect(body).toHaveAttribute('data-turn', '1');
  expect(await body.getAttribute('data-terrain-seed')).not.toBe(initialSeed);
  expect(await body.getAttribute('data-terrain-profile')).not.toBe(initialMap);
  expect((await tanks(body)).every((t) => !t.destroyed && t.recoil === 0)).toBe(true);
  expect((await counts(body))['tank-destruction']).toBeUndefined();
  expect(errors).toEqual([]);
});

test('reduced motion disables recoil without changing the shot or event feedback', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const body = await ready(page);
  await page.keyboard.press('Space');
  await expect(body).toHaveAttribute('data-phase', 'projectile');
  await page.waitForTimeout(80);
  expect((await tanks(body))[0]!.recoil).toBe(0);
  expect((await counts(body))['muzzle-flash']).toBe(1);
  await expect(body).toHaveAttribute('data-turn', '2', { timeout: 20_000 });
  expect((await counts(body)).explosion).toBeGreaterThan(0);
  await expect(body).toHaveAttribute('data-screen-shake', 'false');
});
