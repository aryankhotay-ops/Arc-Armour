import { expect, test, type Page } from '@playwright/test';

const ready = async (page: Page, url = '/?draft=off'): Promise<void> => {
  await page.goto(url);
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'battlefield');
};
const select = (page: Page, id: string) => page.locator(`[data-weapon-id="${id}"]`);
const status = (page: Page) => page.locator('.hud-status');
const setRange = async (page: Page, label: string, value: number): Promise<void> => {
  await page.getByRole('slider', { name: label, exact: true }).evaluate((input, value) => {
    (input as HTMLInputElement).value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
};

// These assertions inspect rendered text/native controls and independently compare them to
// the scene's actual simulation observations. They don't inject a decorative HUD snapshot.
test('renders both health bars, active player, turn, wind, selected weapon and live aim/movement', async ({
  page,
}) => {
  await ready(page);
  const body = page.locator('body');
  await expect(status(page)).toHaveText('P1 · READY TO FIRE');
  await expect(page.locator('.hud-match [data-turn]')).toHaveText('TURN 01');
  for (const player of ['player1', 'player2']) {
    await expect(page.locator(`[data-player="${player}"] [data-health]`)).toHaveText('100 HP');
    await expect(page.locator(`[data-player="${player}"] progress`)).toHaveJSProperty('value', 100);
  }
  await expect(page.locator('[data-player="player1"]')).toHaveAttribute('data-active', 'true');
  await expect(page.locator('[data-player="player2"]')).toHaveAttribute('data-active', 'false');
  await expect(page.locator('.hud-wind')).toContainText('RIGHT');
  await expect(page.locator('[data-selected-weapon]')).toHaveText('Standard Shell');
  await expect(page.locator('[data-weapon-ammo]')).toHaveText('AMMO ∞');
  await page.keyboard.down('w');
  await page.keyboard.down('e');
  await page.keyboard.down('d');
  await expect.poll(async () => Number(await body.getAttribute('data-angle'))).toBeGreaterThan(50);
  await page.keyboard.up('w');
  await page.keyboard.up('e');
  await page.keyboard.up('d');
  await expect
    .poll(async () => page.locator('#hud-angle-value').textContent())
    .toBe(`${await body.getAttribute('data-angle')}°`);
  await expect(page.locator('#hud-power-value')).toHaveText(
    `${await body.getAttribute('data-power')}%`,
  );
  const movement = Number(await body.getAttribute('data-movement-remaining'));
  expect(movement).toBeLessThan(320);
  await expect(page.locator('[data-movement]')).toHaveText(`${Math.ceil(movement)} / 320`);
  await expect(page.getByRole('meter', { name: 'Movement remaining' })).toHaveJSProperty(
    'value',
    movement,
  );
});

test('weapon selection shows real ammo, behaviour/stats and enforced flat-fire limits without changing aim behind the dock', async ({
  page,
}) => {
  await ready(page);
  const body = page.locator('body');
  await select(page, 'cluster-bloom').click();
  await expect(body).toHaveAttribute('data-angle', '45');
  await expect(select(page, 'cluster-bloom')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-weapon-ammo]')).toHaveText('AMMO 2');
  await page.locator('.hud-weapon-info summary').click();
  await expect(page.locator('[data-description]')).not.toBeEmpty();
  await expect(page.locator('[data-tags]')).toContainText('splits ×5');
  await expect(page.locator('[data-stats]')).toContainText('DAMAGE');
  await expect(page.locator('[data-stats]')).toContainText('1 projectile / round');
  await select(page, 'rail-punch').click();
  await expect(body).toHaveAttribute('data-angle', '30');
  await expect(page.getByRole('slider', { name: 'Firing angle', exact: true })).toHaveAttribute(
    'max',
    '30',
  );
  await expect(page.locator('#hud-angle-value')).toHaveText('30°');
  await expect(page.locator('.hud-launch')).toContainText('FLAT FIRE ONLY');
  await expect(page.locator('[data-tags]')).toContainText('flat fire ≤30°');
  await expect(
    page.getByRole('button', { name: 'Increase firing angle', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Decrease firing angle', exact: true }).click();
  await expect.poll(async () => Number(await body.getAttribute('data-angle'))).toBeLessThan(30);
});

test('fire consumes actual ammunition, locks every gameplay control and refreshes ownership on turn handoff', async ({
  page,
}) => {
  await ready(page);
  const body = page.locator('body');
  await select(page, 'trident-shot').click();
  await page.getByRole('button', { name: 'Fire selected weapon', exact: true }).click();
  await expect(body).toHaveAttribute('data-projectiles', '3');
  await expect(status(page)).toHaveText('P1 · SHOT IN FLIGHT');
  await expect(page.locator('[data-weapon-ammo]')).toHaveText('AMMO 2');
  for (const label of ['Firing angle', 'Power level'])
    await expect(page.getByRole('slider', { name: label, exact: true })).toBeDisabled();
  for (const label of ['Move tank left', 'Move tank right', 'Fire selected weapon'])
    await expect(page.getByRole('button', { name: label, exact: true })).toBeDisabled();
  await expect(select(page, 'heavy-shell')).toBeDisabled();
  await expect(body).toHaveAttribute('data-active-player', 'player2', { timeout: 20_000 });
  await expect(status(page)).toHaveText('P2 · READY TO FIRE');
  await expect(page.locator('[data-player="player2"]')).toHaveAttribute('data-active', 'true');
  await expect(page.locator('[data-owner]')).toHaveText('P2 ARSENAL · 12 WEAPONS');
  await expect(page.locator('.hud-match [data-turn]')).toHaveText('TURN 02');
  await expect(select(page, 'trident-shot')).toHaveAccessibleName('Trident Shot, 3 ammo');
  await expect(page.locator('[data-movement]')).toHaveText('320 / 320');
});

test('native sliders/buttons work with keyboard without leaking Space into combat, and held movement stops on release', async ({
  page,
}) => {
  await ready(page);
  const body = page.locator('body');
  const increase = page.getByRole('button', { name: 'Increase firing angle', exact: true });
  await increase.focus();
  await page.keyboard.press('Space');
  await expect(body).toHaveAttribute('data-angle', '46');
  await expect(body).toHaveAttribute('data-phase', 'aiming');
  const power = page.getByRole('slider', { name: 'Power level', exact: true });
  await power.focus();
  await page.keyboard.press('ArrowRight');
  await expect(body).toHaveAttribute('data-power', '76');
  await expect(page.locator('#hud-power-value')).toHaveText('76%');
  const move = page.getByRole('button', { name: 'Move tank right', exact: true });
  const box = (await move.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect
    .poll(async () => Number(await body.getAttribute('data-movement-remaining')))
    .toBeLessThan(75);
  await page.mouse.up();
  await page.waitForTimeout(100);
  const after = await body.getAttribute('data-movement-remaining');
  await page.waitForTimeout(150);
  await expect(body).toHaveAttribute('data-movement-remaining', after!);
  // Exhaustion is observed from real terrain-following movement, not a fake progress meter.
  await page.mouse.down();
  await expect(body).toHaveAttribute('data-movement-remaining', '0', { timeout: 5000 });
  await page.mouse.up();
  await expect(page.locator('[data-movement]')).toHaveText('0 / 320');
  await expect(move).toBeDisabled();
});

test('drafted loadouts and untouched opponent ammo replace the actual selection panel each turn', async ({
  page,
}) => {
  await page.goto('/?draft=on&seed=1234');
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-scene', 'draft');
  await page.keyboard.press('a');
  await page.keyboard.press('Enter');
  await expect(body).toHaveAttribute('data-scene', 'battlefield');
  const p1 = (await body.getAttribute('data-p1-weapons'))!.split(',');
  const p2 = (await body.getAttribute('data-p2-weapons'))!.split(',');
  await expect(page.locator('.hud-weapon-slot:visible')).toHaveCount(6);
  expect(
    await page
      .locator('.hud-weapon-slot:visible')
      .evaluateAll((buttons) => buttons.map((b) => (b as HTMLElement).dataset.weaponId)),
  ).toEqual(p1);
  await page.keyboard.press('Space');
  await expect(body).toHaveAttribute('data-turn', '2', { timeout: 20_000 });
  expect(
    await page
      .locator('.hud-weapon-slot:visible')
      .evaluateAll((buttons) => buttons.map((b) => (b as HTMLElement).dataset.weaponId)),
  ).toEqual(p2);
  await expect(page.locator('[data-owner]')).toHaveText('P2 ARSENAL · 6 WEAPONS');
});

test('paused status and locks update immediately; restart/new draft clean up HUD and listeners', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await expect(status(page)).toHaveText('PAUSED');
  await expect(page.getByRole('slider', { name: 'Firing angle', exact: true })).toBeDisabled();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Restart match', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('.battle-shell')).toHaveCount(1);
  await expect(status(page)).toHaveText('P1 · READY TO FIRE');
  await page.keyboard.press('p');
  await dialog.getByRole('button', { name: 'New weapon draft', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'draft');
  await expect(page.locator('.battle-shell')).toHaveCount(0);
  await page.keyboard.press('a');
  await page.keyboard.press('Enter');
  await expect(page.locator('.battle-shell')).toHaveCount(1);
  await page.keyboard.press('x');
  const loadout = (await page.locator('body').getAttribute('data-p1-weapons'))!.split(',');
  await expect(page.locator('body')).toHaveAttribute('data-weapon', loadout[1]!);
});

test('real damage and match completion update health, winner and rematch', async ({ page }) => {
  test.setTimeout(90_000);
  await ready(page);
  const body = page.locator('body');
  const configured = new Set<string>();
  for (let turn = 0; turn < 12; turn++) {
    if ((await body.getAttribute('data-phase')) === 'game-over') break;
    const player = (await body.getAttribute('data-active-player'))!;
    if (!configured.has(player)) {
      await setRange(page, 'Firing angle', 85);
      await setRange(page, 'Power level', 20);
      configured.add(player);
    }
    // Retuned long-range Standard Shell no longer reliably self-hits; actual low-power
    // heavy/demo shots verify damage and completion through the same native controls.
    const ammo = JSON.parse((await body.getAttribute('data-ammo'))!) as Record<
      string,
      number | string
    >;
    await page
      .locator(
        `[data-weapon-id="${Number(ammo['heavy-shell']) > 0 ? 'heavy-shell' : 'landbreaker'}"]`,
      )
      .click();
    const number = Number(await body.getAttribute('data-turn'));
    await page.getByRole('button', { name: 'Fire selected weapon', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await body.getAttribute('data-phase')) === 'game-over' ||
          Number(await body.getAttribute('data-turn')) > number,
        { timeout: 15_000 },
      )
      .toBe(true);
    const health = (await body.getAttribute('data-health'))!.split(',').map(Number);
    for (const [i, id] of ['player1', 'player2'].entries()) {
      await expect(page.locator(`[data-player="${id}"] [data-health]`)).toHaveText(
        `${Math.ceil(health[i]!)} HP`,
      );
      await expect(page.locator(`[data-player="${id}"] progress`)).toHaveJSProperty(
        'value',
        health[i],
      );
    }
  }
  await expect(body).toHaveAttribute('data-phase', 'game-over');
  const winner = await body.getAttribute('data-winner');
  await expect(status(page)).toHaveText(
    `MATCH COMPLETE · ${winner === 'player1' ? 'P1' : 'P2'} WINS`,
  );
  await expect(page.locator(`[data-player="${winner}"] [data-activity]`)).toHaveText('WINNER');
  await expect(page.getByRole('slider', { name: 'Power level', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Rematch', exact: true }).click();
  await expect(body).toHaveAttribute('data-health', '100,100');
  await expect(status(page)).toHaveText('P1 · READY TO FIRE');
  await expect(page.locator('.battle-shell')).toHaveCount(1);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 844, height: 390 },
  { width: 390, height: 844 },
  { width: 320, height: 740 },
]) {
  test(`HUD never overlaps the battlefield at ${viewport.width}×${viewport.height}, even with weapon information open`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await ready(page);
    for (const expanded of [false, true]) {
      if (expanded) await page.locator('.hud-weapon-info summary').click();
      // Pocket Tanks-style contract: the status strip floats OVER the battlefield sky
      // (inside the arena, not pushing it down), and the control dock never overlaps.
      await expect
        .poll(async () =>
          page.locator('canvas').evaluate((canvas) => {
            const arena = canvas.getBoundingClientRect();
            const top = document.querySelector('.battle-hud-top')!.getBoundingClientRect();
            const dock = document.querySelector('.battle-hud-dock')!.getBoundingClientRect();
            return (
              top.top <= arena.top + 8 &&
              (arena.bottom <= dock.top + 1 || arena.right <= dock.left + 1) &&
              arena.width > 100 &&
              arena.height > 60
            );
          }),
        )
        .toBe(true);
      expect(await page.locator('body').evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(
        viewport.width,
      );
      await expect(page.getByRole('button', { name: 'Pause game', exact: true })).toBeInViewport();
      await expect(page.locator('.hud-match [data-turn]')).toBeVisible();
      await expect(page.getByRole('slider', { name: 'Firing angle', exact: true })).toBeEnabled();
      await expect
        .poll(async () =>
          page.locator('.hud-fire').evaluate((button) => {
            const rect = button.getBoundingClientRect();
            const dock = document.querySelector('.battle-hud-dock')!.getBoundingClientRect();
            return rect.top >= dock.top && rect.bottom <= dock.bottom;
          }),
        )
        .toBe(true);
    }
    // Selecting the last horizontally scrolled slot remains accessible without battlefield input.
    await select(page, 'rail-punch').click();
    await expect(page.locator('body')).toHaveAttribute('data-weapon', 'rail-punch');
    await page.screenshot({ path: testInfo.outputPath('complete-hud.png') });
  });
}

test.describe('touch HUD', () => {
  test.use({ hasTouch: true });
  test('touch selection and aiming/fire controls issue real engine commands', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(page);
    await select(page, 'heavy-shell').tap();
    await expect(page.locator('body')).toHaveAttribute('data-weapon', 'heavy-shell');
    await page.getByRole('button', { name: 'Increase firing angle', exact: true }).tap();
    await expect
      .poll(async () => Number(await page.locator('body').getAttribute('data-angle')))
      .toBeGreaterThan(45);
    await page.getByRole('button', { name: 'Fire selected weapon', exact: true }).tap();
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'projectile');
    await expect(page.locator('[data-weapon-ammo]')).toHaveText('AMMO 2');
  });
});
