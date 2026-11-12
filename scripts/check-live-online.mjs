/* global process, console, window, URL, Event */
// Public-host multiplayer smoke: no local server, no ?server= override. This exercises
// the exact build-time VITE_MULTIPLAYER_URL used by real players on Vercel.
//   node scripts/check-live-online.mjs [https://arc-armour.vercel.app]
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const site = process.argv[2] ?? 'https://arc-armour.vercel.app';
const browser = await chromium.launch();
const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const guestContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const host = await hostContext.newPage();
const guest = await guestContext.newPage();
const errors = [];
const sockets = [];
for (const [label, page] of [
  ['host', host],
  ['guest', guest],
]) {
  page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
  page.on('websocket', (socket) => {
    sockets.push(socket.url());
    if (process.env.LIVE_TRACE !== '1') return;
    // Optional protocol trace deliberately excludes session IDs and resume tokens.
    for (const direction of ['framesent', 'framereceived']) {
      socket.on(direction, ({ payload }) => {
        try {
          const message = JSON.parse(String(payload));
          if (
            [
              'welcome',
              'reconnect',
              'resumed',
              'rejected',
              'opponent-disconnected',
              'opponent-reconnected',
            ].includes(message.type)
          ) {
            console.log(label, direction, {
              type: message.type,
              reason: message.reason,
              seq: message.seq,
            });
          }
        } catch {
          /* not a JSON protocol frame */
        }
      });
    }
    socket.on('close', () => console.log(label, 'transport closed'));
  });
}

try {
  await host.goto(site);
  await host.getByRole('button', { name: 'Online multiplayer', exact: true }).click();
  const lobby = host.getByRole('dialog');
  await expect(lobby.locator('[data-online-unconfigured]')).toHaveCount(0);
  await lobby.getByLabel('Your name', { exact: true }).fill('Live Smoke Host');
  await lobby.getByRole('button', { name: 'Create room', exact: false }).click();
  const codeElement = lobby.locator('[data-room-code]');
  await expect(codeElement).toBeVisible({ timeout: 20000 });
  const code = (await codeElement.textContent()).trim();
  assert.match(code, /^[A-Z0-9]{4}$/);
  const invite = await lobby.locator('[data-invite-link]').inputValue();
  assert.equal(new URL(invite).searchParams.get('join'), code);
  assert.equal(new URL(invite).searchParams.has('server'), false);
  console.log('PASS: Create Room returned a four-character code and a public invitation link.');

  await guest.goto(invite);
  const guestLobby = guest.getByRole('dialog');
  await expect(guestLobby.getByLabel('Room code')).toHaveValue(code);
  await guestLobby.getByLabel('Your name for joining').fill('Live Smoke Guest');
  await guestLobby.getByRole('button', { name: 'Join room', exact: false }).click();
  await expect(lobby.locator('[data-online-player="player2"]')).toContainText('Live Smoke Guest', {
    timeout: 20000,
  });
  await expect(guestLobby.locator('[data-online-player="player1"]')).toContainText(
    'Live Smoke Host',
  );
  console.log('PASS: Guest joined via the invitation link; both lobbies display both players.');

  await lobby.getByRole('button', { name: "I'm ready", exact: true }).click();
  await expect(
    guestLobby.locator('[data-online-player="player1"] [data-ready="true"]'),
  ).toBeVisible();
  await guestLobby.getByRole('button', { name: "I'm ready", exact: true }).click();
  for (const page of [host, guest]) {
    await expect(page.locator('body')).toHaveAttribute('data-scene', 'battlefield', {
      timeout: 20000,
    });
    await expect(page.locator('body')).toHaveAttribute('data-online-status', 'connected');
  }
  for (const attribute of [
    'data-terrain-seed',
    'data-terrain-profile',
    'data-health',
    'data-turn',
  ]) {
    assert.equal(
      await host.locator('body').getAttribute(attribute),
      await guest.locator('body').getAttribute(attribute),
    );
  }
  assert.ok(sockets.length >= 2);
  assert.ok(sockets.every((url) => url === 'wss://arc-armour-server.onrender.com/'));
  console.log(
    'PASS: Both ready → identical battlefield; both clients use the deployed Render WSS server.',
  );

  await host.getByRole('slider', { name: 'Firing angle', exact: true }).fill('55');
  await expect(host.locator('body')).toHaveAttribute('data-angle', '55', { timeout: 10000 });
  await expect(guest.locator('body')).toHaveAttribute('data-angle', '55', { timeout: 10000 });
  await host.getByRole('button', { name: 'Fire selected weapon', exact: true }).click();
  for (const page of [host, guest]) {
    await expect(page.locator('body')).toHaveAttribute('data-turn', '2', { timeout: 45000 });
    await expect(page.locator('body')).toHaveAttribute('data-active-player', 'player2');
  }
  const revision = await host.locator('body').getAttribute('data-terrain-revision');
  assert.ok(Number(revision) > 0);
  await expect(guest.locator('body')).toHaveAttribute('data-terrain-revision', revision);
  assert.equal(
    await host.locator('body').getAttribute('data-health'),
    await guest.locator('body').getAttribute('data-health'),
  );
  console.log('PASS: Host fired a real shot; turn, health and crater revisions synchronized.');

  await guest.getByRole('slider', { name: 'Firing angle', exact: true }).fill('62');
  await expect(host.locator('body')).toHaveAttribute('data-angle', '62', { timeout: 10000 });
  await guest.getByRole('button', { name: 'Fire selected weapon', exact: true }).click();
  for (const page of [host, guest]) {
    await expect(page.locator('body')).toHaveAttribute('data-turn', '3', { timeout: 45000 });
    await expect(page.locator('body')).toHaveAttribute('data-active-player', 'player1');
  }
  console.log('PASS: Guest fired the second synchronized turn.');

  // Real transport interruption: resume without refreshing, within the 30-second grace.
  await guest.evaluate(() => window.dispatchEvent(new Event('artillery-drop-transport')));
  await expect(guest.locator('body')).toHaveAttribute('data-online-resumed', 'true', {
    timeout: 20000,
  });
  await expect(host.locator('body')).toHaveAttribute('data-opponent-connected', 'true', {
    timeout: 10000,
  });
  await expect(guest.locator('body')).toHaveAttribute('data-turn', '3');
  assert.equal(
    await host.locator('body').getAttribute('data-health'),
    await guest.locator('body').getAttribute('data-health'),
  );
  console.log('PASS: Brief transport drop reconnected and resumed the same match.');

  await mkdir('artifacts/ui/online', { recursive: true });
  await host.screenshot({ path: 'artifacts/ui/online/live-battlefield.png' });
  assert.deepEqual(errors, [], 'Unexpected browser runtime errors');
  console.log(
    'PASS: No browser runtime exceptions. Screenshot: artifacts/ui/online/live-battlefield.png',
  );
} finally {
  await hostContext.close();
  await guestContext.close();
  await browser.close();
}
