import { spawn, type ChildProcess } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';
// The deterministic simulation doubles as the test's aiming brain: a probe engine replays
// the observed match history (exactly like a third mirror) to find REAL hitting solutions
// on the live seeded terrain, so the complete-cycle test finishes matches reliably.
import { GameEngine } from '../../packages/simulation/src/index.ts';
import { FULL_DEPOT_CATALOG } from '../../packages/content/src/index.ts';
type GamePage = Page;

interface ShotRecord {
  readonly angle: number;
  readonly power: number;
  /** Weapon selected before this shot; omitted = keep the current selection. */
  readonly weaponId?: string;
}

/** Big-blast weapons the hunting player cycles through to finish matches quickly. */
const HEAVY_WEAPONS = ['mega-nuke', 'nuke', 'crater-maker', 'lava-cannon', 'fireball'];

const settleProbe = (engine: GameEngine): void => {
  for (
    let tick = 0;
    tick < 3600 && !engine.acceptsInput && engine.state.phase !== 'game-over';
    tick++
  ) {
    engine.update(1 / 60);
  }
  engine.drainEvents();
};

/** Rebuilds the match state by replaying every shot taken so far (mirror semantics). */
const replayProbe = (seed: number, history: readonly ShotRecord[]): GameEngine => {
  const engine = new GameEngine({ terrainSeed: seed, weapons: FULL_DEPOT_CATALOG });
  for (const shot of history) {
    if (engine.state.phase === 'game-over') break;
    if (shot.weaponId !== undefined) engine.selectWeapon(shot.weaponId);
    engine.setAim(shot.angle, shot.power / 100);
    engine.fire();
    settleProbe(engine);
  }
  return engine;
};

/** Damage dealt to each side by firing (angle, power%) from the current replayed state. */
const probeShot = (
  seed: number,
  history: readonly ShotRecord[],
  shot: ShotRecord,
): { opponent: number; self: number } => {
  const engine = replayProbe(seed, history);
  const me = engine.state.activePlayerId;
  const opponent = me === 'player1' ? 'player2' : 'player1';
  const before = { me: engine.tank(me).health, opponent: engine.tank(opponent).health };
  if (shot.weaponId !== undefined && !engine.selectWeapon(shot.weaponId)) {
    return { opponent: -1, self: 0 }; // out of ammo in this line; skip the candidate
  }
  engine.setAim(shot.angle, shot.power / 100);
  engine.fire();
  settleProbe(engine);
  return {
    opponent: before.opponent - engine.tank(opponent).health,
    self: before.me - engine.tank(me).health,
  };
};

/** Finds a shot for the active player: damaging for the hunter, harmless for the decoy. */
const chooseShot = (
  seed: number,
  history: readonly ShotRecord[],
  wantHit: boolean,
  previous: ShotRecord | undefined,
): ShotRecord => {
  const candidates: ShotRecord[] = [];
  if (previous !== undefined) candidates.push(previous);
  if (wantHit) {
    // Compact sweep: heavy single-ammo weapons first (big per-shot damage finishes the
    // match within the round budget), then the unlimited Single Shot at common angles.
    for (const weaponId of HEAVY_WEAPONS) {
      for (const angle of [45, 52, 38]) candidates.push({ angle, power: 100, weaponId });
    }
    for (const power of [100, 92, 84]) {
      for (const angle of [45, 52, 38, 60, 32])
        candidates.push({ angle, power, weaponId: 'single-shot' });
    }
  } else {
    // A short, flat poke: lands well away from the firing tank, far from the opponent.
    for (const shot of [
      { angle: 10, power: 50 },
      { angle: 15, power: 45 },
      { angle: 20, power: 40 },
      { angle: 12, power: 55 },
    ])
      candidates.push(shot);
  }
  let best: ShotRecord | undefined;
  let bestDamage = 0;
  for (const candidate of candidates) {
    const damage = probeShot(seed, history, candidate);
    if (!wantHit) {
      if (damage.opponent === 0 && damage.self === 0) return candidate;
      continue;
    }
    if (damage.self === 0 && damage.opponent > bestDamage) {
      best = candidate;
      bestDamage = damage.opponent;
      if (bestDamage >= 25) break; // strong hit found; stop probing
    }
  }
  return best ?? candidates[candidates.length - 1]!;
};

// Online multiplayer through the REAL game UI: two separate browser contexts (separate
// devices as far as the client code can tell) create/join a private room via code and
// invitation link, ready up, and play synchronized authoritative turns.

let serverProcess: ChildProcess;
const SERVER_PORT = 8491;

test.beforeAll(async () => {
  serverProcess = spawn(
    process.execPath,
    ['apps/server/dist/server.mjs'],
    {
      env: { ...process.env, PORT: String(SERVER_PORT), GRACE_SECONDS: '2' },
      stdio: 'ignore',
    },
  );
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${SERVER_PORT}/health`);
      if (response.ok) return;
    } catch {
      /* booting */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('multiplayer server did not start');
});

test.afterAll(() => {
  serverProcess.kill();
});

const serverParam = `server=${encodeURIComponent(`ws://127.0.0.1:${SERVER_PORT}/`)}`;

const openOnline = async (page: Page): Promise<void> => {
  await page.goto(`/?${serverParam}`);
  await page.getByRole('button', { name: 'Online multiplayer', exact: true }).click();
};

test('two separate clients create/join a private room, ready up and play synchronized turns', async ({
  browser,
}) => {
  // Two isolated contexts: separate storage, separate sockets — different "devices".
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  // Host creates a private room and receives a 4-letter code + invitation link.
  await openOnline(host);
  const hostDialog = host.getByRole('dialog');
  await hostDialog.getByLabel('Your name', { exact: true }).fill('Ada');
  await hostDialog.getByRole('button', { name: 'Create room', exact: false }).click();
  const code = (await hostDialog.locator('[data-room-code]').textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{4}$/);
  const invite = await hostDialog.locator('[data-invite-link]').inputValue();
  expect(invite).toContain(`join=${code}`);

  // Guest joins through the invitation link: lands on the online screen, code prefilled.
  await guest.goto(`${invite}${invite.includes('?') ? '&' : '?'}${serverParam}`);
  const guestDialog = guest.getByRole('dialog');
  await expect(guestDialog.getByLabel('Room code')).toHaveValue(code);
  await guestDialog.getByLabel('Your name for joining').fill('Grace');
  await guestDialog.getByRole('button', { name: 'Join room', exact: false }).click();

  // Both lobbies show both named players; ready states update live.
  await expect(hostDialog.locator('[data-online-player="player2"]')).toContainText('Grace');
  await expect(guestDialog.locator('[data-online-player="player1"]')).toContainText('Ada');
  await hostDialog.getByRole('button', { name: "I'm ready", exact: true }).click();
  await expect(guestDialog.locator('[data-online-player="player1"] [data-ready="true"]')).toBeVisible();
  await guestDialog.getByRole('button', { name: "I'm ready", exact: true }).click();

  // Both clients enter the battlefield with identical terrain.
  for (const page of [host, guest]) {
    await expect(page.locator('body')).toHaveAttribute('data-scene', 'battlefield', {
      timeout: 15000,
    });
  }
  await expect(host.locator('body')).toHaveAttribute('data-online-slot', 'player1');
  await expect(guest.locator('body')).toHaveAttribute('data-online-slot', 'player2');
  const hostSeed = await host.locator('body').getAttribute('data-terrain-seed');
  expect(await guest.locator('body').getAttribute('data-terrain-seed')).toBe(hostSeed);
  const hostTerrain = await host.locator('body').getAttribute('data-terrain-profile');
  expect(await guest.locator('body').getAttribute('data-terrain-profile')).toBe(hostTerrain);

  // Host (player1) aims and moves; the accepted intents replicate onto the guest screen.
  await host.getByRole('slider', { name: 'Firing angle', exact: true }).fill('55');
  await expect(host.locator('body')).toHaveAttribute('data-angle', '55', { timeout: 5000 });
  await expect(guest.locator('body')).toHaveAttribute('data-angle', '55', { timeout: 5000 });
  const guestP1Before = JSON.parse(
    (await guest.locator('body').getAttribute('data-tank-animations'))!,
  ) as { x: number }[];
  await host.getByRole('button', { name: 'Move tank right', exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          JSON.parse(
            (await guest.locator('body').getAttribute('data-tank-animations'))!,
          ) as { x: number }[]
        )[0]!.x,
      { timeout: 5000 },
    )
    .toBeGreaterThan(guestP1Before[0]!.x);

  // The waiting player's inputs cannot drive the match: the mirror ignores them locally
  // and the server would reject the intent anyway.
  await guest.getByRole('slider', { name: 'Firing angle', exact: true }).fill('20');
  await guest.waitForTimeout(400);
  await expect(guest.locator('body')).toHaveAttribute('data-angle', '55');

  // Host fires; BOTH clients watch the same authoritative shot resolve and the turn pass.
  await host.getByRole('button', { name: 'Fire selected weapon', exact: true }).click();
  for (const page of [host, guest]) {
    await expect(page.locator('body')).toHaveAttribute('data-turn', '2', { timeout: 30000 });
    await expect(page.locator('body')).toHaveAttribute('data-active-player', 'player2');
    await expect(page.locator('body')).toHaveAttribute('data-projectiles', '0');
  }
  // The shot deformed terrain identically on both screens (data-terrain-profile is a
  // once-per-match ORIGINAL-map snapshot by design, so revisions carry the crater proof).
  const hostRevision = Number(await host.locator('body').getAttribute('data-terrain-revision'));
  expect(hostRevision).toBeGreaterThan(0);
  await expect
    .poll(async () => Number(await guest.locator('body').getAttribute('data-terrain-revision')))
    .toBe(hostRevision);

  // Now the guest (player2) can act and the host sees it.
  await guest.getByRole('slider', { name: 'Firing angle', exact: true }).fill('62');
  await expect(host.locator('body')).toHaveAttribute('data-angle', '62', { timeout: 5000 });
  await guest.getByRole('button', { name: 'Fire selected weapon', exact: true }).click();
  for (const page of [host, guest]) {
    await expect(page.locator('body')).toHaveAttribute('data-turn', '3', { timeout: 30000 });
    await expect(page.locator('body')).toHaveAttribute('data-active-player', 'player1');
  }

  // Connection status strip is live with a measured latency on both screens.
  await expect(host.locator('body')).toHaveAttribute('data-online-status', 'connected');
  await expect
    .poll(async () => Number(await host.locator('body').getAttribute('data-online-latency')))
    .toBeGreaterThanOrEqual(0);

  // Departure: the guest leaves mid-match; the host first sees the disconnect notice and
  // the held seat, then the server (not any client) declares the forfeit after the grace.
  await guestContext.close();
  await expect(host.locator('body')).toHaveAttribute('data-opponent-connected', 'false', {
    timeout: 10000,
  });
  await expect(host.locator('.online-status-strip')).toContainText('Opponent disconnected');
  await expect(host.locator('body')).toHaveAttribute('data-online-ended', 'forfeit', {
    timeout: 15000,
  });
  await expect(host.locator('body')).toHaveAttribute('data-online-winner', 'player1');
  // The results panel announces the forfeit win with a disabled rematch (no opponent).
  await expect(host.locator('.online-results h2')).toHaveText('VICTORY!');
  await expect(host.locator('[data-action="rematch"]')).toBeDisabled();
  await hostContext.close();
});

test('complete online cycle: match to a winner, results, rematch vote, fresh second match', async ({
  browser,
}) => {
  // A full match + rematch with real probe-engine aiming is inherently long.
  test.setTimeout(300_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await openOnline(host);
  const hostDialog = host.getByRole('dialog');
  await hostDialog.getByLabel('Your name', { exact: true }).fill('Ada');
  await hostDialog.getByRole('button', { name: 'Create room', exact: false }).click();
  const code = (await hostDialog.locator('[data-room-code]').textContent())!.trim();
  await openOnline(guest);
  const guestDialog = guest.getByRole('dialog');
  await guestDialog.getByLabel('Your name for joining').fill('Grace');
  await guestDialog.getByLabel('Room code').fill(code);
  await guestDialog.getByRole('button', { name: 'Join room', exact: false }).click();
  await hostDialog.getByRole('button', { name: "I'm ready", exact: true }).click();
  await guestDialog.getByRole('button', { name: "I'm ready", exact: true }).click();
  for (const page of [host, guest]) {
    await expect(page.locator('body')).toHaveAttribute('data-scene', 'battlefield', {
      timeout: 15000,
    });
  }
  const firstSeed = await host.locator('body').getAttribute('data-terrain-seed');

  // Play alternating turns until the server announces a winner. The deterministic probe
  // engine (a third mirror of the same seed + shot history) finds REAL hitting angles for
  // the host on the live seeded terrain; the guest fires deliberate short misses.
  const seed = Number(firstSeed);
  const fire = async (page: GamePage, shot: ShotRecord) => {
    if (shot.weaponId !== undefined) {
      await page.locator(`[data-weapon-id="${shot.weaponId}"]`).click();
      await expect(page.locator('body')).toHaveAttribute('data-weapon', shot.weaponId);
    }
    await page.getByRole('slider', { name: 'Firing angle', exact: true }).fill(String(shot.angle));
    await page.getByRole('slider', { name: 'Power level', exact: true }).fill(String(shot.power));
    await page.getByRole('button', { name: 'Fire selected weapon', exact: true }).click();
  };
  const history: ShotRecord[] = [];
  let hostShot: ShotRecord | undefined;
  let ended = false;
  for (let round = 0; round < 48 && !ended; round++) {
    const hostTurn =
      (await host.locator('body').getAttribute('data-active-player')) === 'player1';
    const page = hostTurn ? host : guest;
    const shot = chooseShot(seed, history, hostTurn, hostTurn ? hostShot : undefined);
    if (hostTurn) hostShot = shot;
    history.push(shot);
    const turnBefore = await host.locator('body').getAttribute('data-turn');
    await fire(page, shot);
    // Wait until this shot fully hands over or the match ends. The fire intent is only
    // applied once the server echoes it, so "aiming with no projectiles" is still true for
    // a moment after the click; require the authoritative turn counter to advance first.
    await expect
      .poll(
        async () =>
          (await host.locator('body').getAttribute('data-online-ended')) !== null ||
          ((await host.locator('body').getAttribute('data-turn')) !== turnBefore &&
            (await host.locator('body').getAttribute('data-phase')) === 'aiming' &&
            (await host.locator('body').getAttribute('data-projectiles')) === '0'),
        { timeout: 30000 },
      )
      .toBe(true);
    ended = (await host.locator('body').getAttribute('data-online-ended')) !== null;
  }
  expect(ended).toBe(true);

  // Results panel on BOTH screens with a definite winner announcement.
  for (const page of [host, guest]) {
    await expect(page.locator('.online-results')).toBeVisible();
    await expect(page.locator('.online-results h2')).toHaveText(/VICTORY!|WINS|DRAW/);
  }

  // Rematch voting: host votes, guest sees the vote, guest votes, a NEW match starts for
  // both players with full state reset — no page refresh anywhere.
  await host.locator('[data-action="rematch"]').click();
  await expect(guest.locator('[data-rematch-status]')).toContainText('wants a rematch', {
    timeout: 10000,
  });
  await guest.locator('[data-action="rematch"]').click();
  for (const page of [host, guest]) {
    await expect(page.locator('body')).toHaveAttribute('data-turn', '1', { timeout: 20000 });
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'aiming');
    await expect(page.locator('body')).toHaveAttribute('data-active-player', 'player1');
    await expect(page.locator('body')).toHaveAttribute('data-health', '100,100');
    await expect(page.locator('body')).toHaveAttribute('data-projectiles', '0');
    await expect(page.locator('body')).toHaveAttribute('data-terrain-revision', '0');
    await expect(page.locator('.online-results')).toHaveCount(0);
  }
  // Fresh terrain: the rematch seed differs and matches on both clients.
  const secondSeedHost = await host.locator('body').getAttribute('data-terrain-seed');
  const secondSeedGuest = await guest.locator('body').getAttribute('data-terrain-seed');
  expect(secondSeedHost).toBe(secondSeedGuest);
  expect(secondSeedHost).not.toBe(firstSeed);
  // The second match is genuinely playable on the same sockets.
  await fire(host, { angle: 45, power: 80 });
  for (const page of [host, guest]) {
    await expect(page.locator('body')).toHaveAttribute('data-turn', '2', { timeout: 30000 });
  }
  await hostContext.close();
  await guestContext.close();
});

test('a brief network interruption reconnects automatically and preserves the match', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await openOnline(host);
  const hostDialog = host.getByRole('dialog');
  await hostDialog.getByLabel('Your name', { exact: true }).fill('Ada');
  await hostDialog.getByRole('button', { name: 'Create room', exact: false }).click();
  const code = (await hostDialog.locator('[data-room-code]').textContent())!.trim();
  await openOnline(guest);
  const guestDialog = guest.getByRole('dialog');
  await guestDialog.getByLabel('Your name for joining').fill('Grace');
  await guestDialog.getByLabel('Room code').fill(code);
  await guestDialog.getByRole('button', { name: 'Join room', exact: false }).click();
  await hostDialog.getByRole('button', { name: "I'm ready", exact: true }).click();
  await guestDialog.getByRole('button', { name: "I'm ready", exact: true }).click();
  for (const page of [host, guest]) {
    await expect(page.locator('body')).toHaveAttribute('data-scene', 'battlefield', {
      timeout: 15000,
    });
  }
  // Host makes progress that must survive the interruption.
  await host.getByRole('slider', { name: 'Firing angle', exact: true }).fill('58');
  await expect(guest.locator('body')).toHaveAttribute('data-angle', '58', { timeout: 5000 });

  // Simulated network blip on the GUEST (no page reload): the diagnostic hook abruptly
  // severs the live transport exactly as a dropped connection would; the client then
  // auto-reconnects with its resume token.
  await guest.evaluate(() => window.dispatchEvent(new Event('artillery-drop-transport')));
  // Host sees the disconnect notice while the seat is held.
  await expect(host.locator('body')).toHaveAttribute('data-opponent-connected', 'false', {
    timeout: 20000,
  });
  // The guest auto-reconnects and the match state is rebuilt from the accepted-command log.
  await expect(guest.locator('body')).toHaveAttribute('data-online-resumed', 'true', {
    timeout: 30000,
  });
  await expect(host.locator('body')).toHaveAttribute('data-opponent-connected', 'true', {
    timeout: 10000,
  });
  // The rebuilt mirror carries the pre-drop aim, and the match continues normally.
  await expect(guest.locator('body')).toHaveAttribute('data-angle', '58');
  await host.getByRole('button', { name: 'Fire selected weapon', exact: true }).click();
  for (const page of [host, guest]) {
    await expect(page.locator('body')).toHaveAttribute('data-turn', '2', { timeout: 30000 });
  }
  await hostContext.close();
  await guestContext.close();
});

test('room departure from the lobby frees the seat for another player', async ({ browser }) => {
  const first = await (await browser.newContext()).newPage();
  const second = await (await browser.newContext()).newPage();
  await openOnline(first);
  const firstDialog = first.getByRole('dialog');
  await firstDialog.getByLabel('Your name', { exact: true }).fill('Host');
  await firstDialog.getByRole('button', { name: 'Create room', exact: false }).click();
  const code = (await firstDialog.locator('[data-room-code]').textContent())!.trim();

  await openOnline(second);
  const secondDialog = second.getByRole('dialog');
  await secondDialog.getByLabel('Your name for joining').fill('Visitor');
  await secondDialog.getByLabel('Room code').fill(code);
  await secondDialog.getByRole('button', { name: 'Join room', exact: false }).click();
  await expect(secondDialog.locator('[data-room-code]')).toContainText(code);

  // Visitor departs; their lobby returns to the entry forms and the seat reopens.
  await secondDialog.getByRole('button', { name: 'Leave room', exact: true }).click();
  await expect(secondDialog.getByRole('button', { name: 'Create room', exact: false })).toBeVisible();
  await expect(firstDialog.locator('[data-online-player="player2"]')).toContainText(
    'Waiting for a challenger',
  );
  await secondDialog.getByLabel('Your name for joining').fill('Returning');
  await secondDialog.getByLabel('Room code').fill(code);
  await secondDialog.getByRole('button', { name: 'Join room', exact: false }).click();
  await expect(firstDialog.locator('[data-online-player="player2"]')).toContainText('Returning');
});
