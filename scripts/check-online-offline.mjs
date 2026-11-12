// Pre-hosting connectivity qualification (2026-11-10), run against the PRODUCTION build:
// 1. No request ever leaves the local preview origin (fully offline-capable local play).
// 2. No WebSocket is opened (no phantom multiplayer connection).
// 3. The Online Multiplayer destination truthfully reports no server and routes to local play.
// 4. A real local shot resolves while the browser network is restricted to the local origin.
import { spawn } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import console from 'node:console';
import { setTimeout } from 'node:timers/promises';
import process from 'node:process';
import { chromium, webkit, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4281', '--strictPort'],
  { cwd: `${root}/apps/client`, stdio: 'ignore' },
);
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await globalThis.fetch('http://127.0.0.1:4281/')).ok) { ready = true; break; }
    } catch { /* startup */ }
    await setTimeout(200);
  }
  if (!ready) throw new Error('Production preview failed to start');
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const external = [];
      const sockets = [];
      page.on('websocket', (socket) => sockets.push(socket.url()));
      // Hard-block everything that is not the local preview origin: simulates a user with
      // no internet. The game must not even try.
      await page.route('**/*', (route) => {
        const url = new URL(route.request().url());
        // blob:/data: never leave the browser (WebKit routes them; Chromium does not):
        // they are the game's own locally rasterized sprite textures, not network traffic.
        const local =
          url.protocol === 'blob:' || url.protocol === 'data:' || url.host === '127.0.0.1:4281';
        if (!local) { external.push(route.request().url()); return route.abort(); }
        return route.continue();
      });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('http://127.0.0.1:4281/');
      // Online destination: truthful unavailable-server status, local-play route works.
      await page.getByRole('button', { name: 'Online multiplayer', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText(/rooms, joining and matchmaking are not implemented/)).toBeVisible();
      await dialog.getByRole('button', { name: 'Play on this device instead' }).click();
      await expect(dialog.getByRole('heading', { name: 'Play local' })).toBeVisible();
      // Complete a real offline practice shot through to turn handoff.
      await page.keyboard.press('Escape');
      await page.goto('http://127.0.0.1:4281/?draft=off&terrainSeed=2');
      const body = page.locator('body');
      await expect(body).toHaveAttribute('data-scene', 'battlefield');
      await page.getByRole('button', { name: 'Fire selected weapon', exact: true }).click();
      await expect(body).toHaveAttribute('data-turn', '2', { timeout: 20000 });
      await expect(body).toHaveAttribute('data-projectiles', '0');
      expect(external).toEqual([]);
      expect(sockets).toEqual([]);
      expect(errors).toEqual([]);
      console.log(`${name}: offline local play, truthful online status, zero external requests/sockets passed`);
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill();
}
