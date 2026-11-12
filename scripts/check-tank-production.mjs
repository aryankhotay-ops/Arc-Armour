// Reproducible built-game qualification: original separated tank sprites, not the dev loader.
// Run after pnpm build: node scripts/check-tank-production.mjs (Chromium + WebKit installed).
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import console from 'node:console';
import { setTimeout } from 'node:timers/promises';
import process from 'node:process';
import { chromium, webkit, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '4280',
    '--strictPort',
  ],
  { cwd: `${root}/apps/client`, stdio: 'ignore' },
);
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await globalThis.fetch('http://127.0.0.1:4280/')).ok) {
        ready = true;
        break;
      }
    } catch {
      /* server startup */
    }
    await setTimeout(200);
  }
  if (!ready) throw new Error('Production preview failed to start');
  await mkdir(`${root}/artifacts/ui/tanks`, { recursive: true });
  for (const [name, engine] of [
    ['chromium', chromium],
    ['webkit', webkit],
  ]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({
        viewport: name === 'webkit' ? { width: 844, height: 390 } : { width: 1440, height: 1000 },
      });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('http://127.0.0.1:4280/');
      await page.getByRole('button', { name: 'Play local', exact: true }).click();
      await page.getByRole('radio', { name: 'Player 1: Panther', exact: true }).check();
      await page.getByRole('button', { name: 'Choose Player 2 tank', exact: true }).click();
      await page.getByRole('radio', { name: 'Player 2: T-34/85', exact: true }).check();
      await page.getByLabel('Full-arsenal practice', { exact: false }).check();
      await page.getByRole('button', { name: 'Start local game' }).click();
      const body = page.locator('body');
      await expect(body).toHaveAttribute('data-tank-designs', 'panther,t34-85');
      await expect(body).toHaveAttribute('data-weapon-arsenal', 'full-depot');
      await expect(page.locator('[data-weapon-id]')).toHaveCount(194);
      await expect(page.locator('[data-weapon-id="single-shot"]')).toBeVisible();
      await expect(page.locator('[data-weapon-id="nuke"]')).toHaveCount(1);
      await expect(page.locator('[data-weapon-id="standard-shell"]')).toHaveCount(0);
      for (const angle of [15, 75]) {
        await page.getByRole('slider', { name: 'Firing angle', exact: true }).fill(String(angle));
        await expect
          .poll(async () =>
            Math.abs(JSON.parse(await body.getAttribute('data-tank-barrels'))[0].angle - angle),
          )
          .toBeLessThan(0.1);
        const observations = JSON.parse(await body.getAttribute('data-tank-barrels'));
        for (const gun of observations) {
          expect(gun.layer).toBe('separate-sprite');
          expect(Math.hypot(gun.tip.x - gun.expected.x, gun.tip.y - gun.expected.y)).toBeLessThan(
            0.2,
          );
        }
        await page.screenshot({
          path: `${root}/artifacts/ui/tanks/panther-t34-${angle}-production-${name}.png`,
        });
      }
      await page.getByRole('button', { name: 'Fire selected weapon', exact: true }).click();
      await expect(body).toHaveAttribute('data-phase', 'projectile');
      await page.keyboard.press('Escape');
      await expect(body).toHaveAttribute('data-paused', 'true');
      const before = await body.getAttribute('data-tank-barrels');
      await page.waitForTimeout(150);
      expect(await body.getAttribute('data-tank-barrels')).toBe(before);
      await page.getByRole('button', { name: 'Resume game', exact: true }).click();
      await expect(body).toHaveAttribute('data-turn', '2', { timeout: 20000 });
      await page.getByRole('slider', { name: 'Firing angle', exact: true }).fill('60');
      await expect
        .poll(async () =>
          Math.abs(JSON.parse(await body.getAttribute('data-tank-barrels'))[1].angle - 60),
        )
        .toBeLessThan(0.1);
      expect(errors).toEqual([]);
      await page.locator('[data-weapon-id="magic-wall"]').click();
      await page.getByRole('slider', { name: 'Firing angle', exact: true }).fill('45');
      await page.getByRole('button', { name: 'Fire selected weapon', exact: true }).click();
      await expect(body).toHaveAttribute('data-turn', '3', { timeout: 20000 });
      await page.screenshot({
        path: `${root}/artifacts/ui/tanks/refined-original-deluxe-production-${name}.png`,
      });
      console.log(
        `${name}: production refined tanks, full 194-weapon depot roster, true gun rotation, muzzle parity, pause and terrain-tool shot passed`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill('SIGTERM');
}
