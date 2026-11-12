import { expect, test, type Page } from '@playwright/test';

const ready = async (page: Page): Promise<void> => {
  await page.goto('/?draft=off');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'battlefield');
};

test('shows a larger battlefield with smaller, widely separated targets and unchanged UI', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page);
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-world-width', '3200');
  await expect(body).toHaveAttribute('data-world-height', '1800');
  await expect(body).toHaveAttribute('data-spawn-separation', '2688');
  await expect(body).toHaveAttribute('data-aim-preview-seconds', '0.55');
  const scale = Number(await body.getAttribute('data-battlefield-scale'));
  expect(106 * scale).toBeLessThan(44);
  const tanks = JSON.parse((await body.getAttribute('data-tank-animations'))!) as {
    x: number;
    y: number;
  }[];
  expect(tanks[0]!.x * scale).toBeLessThan(140);
  expect(tanks[1]!.x * scale).toBeGreaterThan(1140);
  // The canvas keeps its projection; native HUD controls reflow outside it.
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 844, height: 390 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    // Phaser's resize pass runs on its next frame; do not sample the transient old CSS size.
    await expect
      .poll(async () => {
        const canvas = (await page.locator('canvas').boundingBox())!;
        return Math.abs(canvas.width / canvas.height - 1280 / 720);
      })
      .toBeLessThan(0.05);
    await expect(page.getByRole('button', { name: 'Pause game', exact: true })).toBeInViewport();
  }
  expect(errors).toEqual([]);
});

test('pointer aim round-trips the world projection while arsenal buttons stay in screen space', async ({
  page,
}) => {
  await ready(page);
  const body = page.locator('body');
  const tank = JSON.parse((await body.getAttribute('data-tank-animations'))!)[0] as {
    x: number;
    y: number;
  };
  const scale = Number(await body.getAttribute('data-battlefield-scale'));
  // At the wider-world projection a short 400-unit pointer is vulnerable to CSS-pixel
  // rounding across the half-degree output boundary. A long drag tests the same inverse
  // transform without asserting subpixel browser-input precision.
  const distance = 800;
  const angle = Math.PI / 6;
  const x = (tank.x + 3 + Math.cos(angle) * distance) * scale;
  const y = (tank.y - 56 - Math.sin(angle) * distance) * scale;
  const canvas = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(
    canvas.x + (x / 1280) * canvas.width,
    canvas.y + (y / 720) * canvas.height,
  );
  await expect(body).toHaveAttribute('data-angle', '30');
  // The engine's (distance - 40) / 735 power mapping clamps this long drag to full power.
  await expect(body).toHaveAttribute('data-power', '100');
  // The native arsenal selects a weapon without aiming behind the HUD.
  await page.getByRole('button', { name: 'Heavy Shell, 3 ammo', exact: true }).click();
  await expect(body).toHaveAttribute('data-weapon', 'heavy-shell');
  await expect(body).toHaveAttribute('data-angle', '30');
});

test('the old default shot no longer damages the opponent automatically and still resolves', async ({
  page,
}) => {
  await ready(page);
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-angle', '45');
  await expect(body).toHaveAttribute('data-power', '75');
  await page.keyboard.press('Space');
  await expect(body).toHaveAttribute('data-turn', '2', { timeout: 20000 });
  await expect(body).toHaveAttribute('data-health', '100,100');
  await expect(body).toHaveAttribute('data-projectiles', '0');
  expect(Number(await body.getAttribute('data-terrain-revision'))).toBeGreaterThan(0);
});
