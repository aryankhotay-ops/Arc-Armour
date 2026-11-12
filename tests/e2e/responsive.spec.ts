import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ hasTouch: true });
const ready = async (page: Page) => {
  await page.goto('/?draft=off');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'battlefield');
};
const value = async (page: Page, field: string) =>
  Number(await page.locator('body').getAttribute(`data-${field}`));
const center = async (locator: Locator) => {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const stableLayout = async (page: Page) => {
  await expect
    .poll(() =>
      page.locator('canvas').evaluate((canvas) => {
        const rect = canvas.getBoundingClientRect();
        const parent = document.getElementById('app')!.getBoundingClientRect();
        const header = document.querySelector('.battle-hud-top')!.getBoundingClientRect();
        const dock = document.querySelector('.battle-hud-dock')!.getBoundingClientRect();
        const fire = document.querySelector('.hud-fire')!.getBoundingClientRect();
        return (
          // The status strip overlays the arena sky (Pocket Tanks-style) instead of
          // reserving its own row above the canvas.
          header.top <= rect.top + 8 &&
          (rect.bottom <= dock.top + 1 || rect.right <= dock.left + 1) &&
          Math.abs(rect.width / rect.height - 16 / 9) < 0.03 &&
          Math.abs(rect.width - Math.min(parent.width, (parent.height * 16) / 9)) < 3 &&
          fire.top >= dock.top &&
          fire.bottom <= dock.bottom + 1 &&
          fire.right <= innerWidth &&
          rect.height > 100
        );
      }),
    )
    .toBe(true);
};

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
  { width: 667, height: 375 },
  { width: 568, height: 320 },
]) {
  test(`responsive touch targets and clear battlefield at ${viewport.width}×${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await ready(page);
    for (const expanded of [false, true]) {
      if (expanded) await page.locator('.hud-weapon-info summary').tap();
      await stableLayout(page);
      const targets = await page
        .locator(
          '[data-control], .hud-fire, #hud-angle, #hud-power, .battle-menu-trigger, .hud-weapon-info summary',
        )
        .evaluateAll((elements) =>
          elements.map((element) => {
            const r = element.getBoundingClientRect();
            return { width: r.width, height: r.height };
          }),
        );
      for (const rect of targets) {
        expect(rect.width).toBeGreaterThanOrEqual(44);
        expect(rect.height).toBeGreaterThanOrEqual(44);
      }
      await expect(
        page.getByRole('slider', { name: 'Firing angle', exact: true }),
      ).toBeInViewport();
      await expect(page.getByRole('slider', { name: 'Power level', exact: true })).toBeInViewport();
      const overflow = await page.evaluate(() => ({
        width: document.body.scrollWidth,
        x: scrollX,
        y: scrollY,
      }));
      expect(overflow).toEqual({ width: viewport.width, x: 0, y: 0 });
    }
    if (viewport.width > viewport.height && viewport.height <= 600) {
      const box = (await page.locator('canvas').boundingBox())!;
      expect(box.width).toBeGreaterThan(viewport.width * 0.45);
      await expect(page.locator('.hud-orientation-hint')).toBeHidden();
    }
    await page.locator('[data-weapon-id="rail-punch"]').tap();
    await expect(page.locator('body')).toHaveAttribute('data-weapon', 'rail-punch');
    await expect(page.locator('body')).toHaveAttribute('data-angle', '30');
    await page.screenshot({ path: testInfo.outputPath('responsive-game.png') });
  });
}

test('touch movement, barrel/power steps, selection and fire use the real engine on a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const body = page.locator('body');
  await page.getByRole('button', { name: 'Move tank right', exact: true }).tap();
  await expect.poll(() => value(page, 'movement-remaining')).toBeLessThan(320);
  await page.getByRole('button', { name: 'Increase firing angle', exact: true }).tap();
  await expect.poll(() => value(page, 'angle')).toBeGreaterThan(45);
  await page.getByRole('button', { name: 'Decrease power', exact: true }).tap();
  await expect.poll(() => value(page, 'power')).toBeLessThan(75);
  const beforeAim = await value(page, 'angle');
  await page.locator('[data-weapon-id="trident-shot"]').tap();
  await expect(body).toHaveAttribute('data-weapon', 'trident-shot');
  expect(await value(page, 'angle')).toBe(beforeAim);
  await page.getByRole('button', { name: 'Fire selected weapon', exact: true }).tap();
  await expect(body).toHaveAttribute('data-projectiles', '3');
  await expect(page.locator('[data-weapon-ammo]')).toHaveText('AMMO 2');
  await expect(page.getByRole('button', { name: 'Move tank right', exact: true })).toBeDisabled();
  await expect(body).toHaveAttribute('data-turn', '2', { timeout: 20_000 });
  await expect(body).toHaveAttribute('data-active-player', 'player2');
  await expect(page.locator('[data-movement]')).toHaveText('320 / 320');
});

test('rotation/resize keeps live aim, ammo and turn while growing the landscape battlefield', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.locator('[data-weapon-id="heavy-shell"]').tap();
  await page.getByRole('button', { name: 'Decrease power', exact: true }).tap();
  await expect.poll(() => value(page, 'power')).toBeLessThan(75);
  const snapshot = await page
    .locator('body')
    .evaluate((body) => [
      body.dataset.angle,
      body.dataset.power,
      body.dataset.weapon,
      body.dataset.ammo,
      body.dataset.turn,
      body.dataset.health,
    ]);
  const portraitWidth = (await page.locator('canvas').boundingBox())!.width;
  await page.setViewportSize({ width: 844, height: 390 });
  await stableLayout(page);
  expect((await page.locator('canvas').boundingBox())!.width).toBeGreaterThan(portraitWidth * 1.3);
  expect(
    await page
      .locator('body')
      .evaluate((body) => [
        body.dataset.angle,
        body.dataset.power,
        body.dataset.weapon,
        body.dataset.ammo,
        body.dataset.turn,
        body.dataset.health,
      ]),
  ).toEqual(snapshot);
  await page.setViewportSize({ width: 390, height: 844 });
  await stableLayout(page);
  await expect(page.locator('.hud-orientation-hint')).toBeVisible();
  await expect(page.locator('.battle-shell')).toHaveCount(1);
});

test('pointer cancel and rotation release held input, including a finger that ends outside the button', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const move = page.getByRole('button', { name: 'Move tank right', exact: true });
  const at = await center(move);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await expect.poll(() => value(page, 'movement-remaining')).toBeLessThan(300);
  await move.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const cancelled = await value(page, 'movement-remaining');
  await page.waitForTimeout(160);
  expect(await value(page, 'movement-remaining')).toBe(cancelled);
  await page.mouse.down();
  await expect.poll(() => value(page, 'movement-remaining')).toBeLessThan(cancelled - 5);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.mouse.up();
  await stableLayout(page);
  const rotated = await value(page, 'movement-remaining');
  await page.waitForTimeout(200);
  expect(await value(page, 'movement-remaining')).toBe(rotated);
});

test('native mobile draft is touch sized, exclusive and resumable across orientation changes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?draft=on&seed=1234');
  const body = page.locator('body');
  const draft = page.locator('.responsive-draft');
  await expect(draft).toBeVisible();
  await draft.locator('[data-draft-weapon="heavy-shell"]').tap();
  await expect(body).toHaveAttribute('data-draft-picker', 'player1');
  await expect(draft.locator('[data-draft-weapon="heavy-shell"]')).toBeDisabled();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(draft.getByRole('button', { name: 'Randomize rest', exact: true })).toBeInViewport();
  await draft.getByRole('button', { name: 'Randomize rest', exact: true }).tap();
  await expect(body).toHaveAttribute('data-draft-complete', 'true');
  const p1 = (await body.getAttribute('data-draft-p1'))!.split(',');
  const p2 = (await body.getAttribute('data-draft-p2'))!.split(',');
  expect(p1.filter((id) => p2.includes(id))).toHaveLength(0);
  const buttons = await draft
    .locator('button')
    .evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect().height));
  expect(buttons.every((height) => height >= 48)).toBe(true);
  await draft.getByRole('button', { name: 'Start battle', exact: true }).tap();
  await expect(body).toHaveAttribute('data-scene', 'battlefield');
  await expect(draft).toHaveCount(0);
  await stableLayout(page);
  expect((await body.getAttribute('data-p1-weapons'))!.split(',').sort()).toEqual(
    ['standard-shell', ...p1].sort(),
  );
});

// Chrome DevTools sends trusted multi-touch and swipe events, not scripted HUD state edits.
test('two real touch contacts can move and aim independently; releasing aim does not stop movement', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'CDP touch injection is Chromium-only; native tap/layout tests run on all engines.',
  );
  await page.setViewportSize({ width: 844, height: 390 });
  await ready(page);
  const cdp = await page.context().newCDPSession(page);
  const move = await center(page.getByRole('button', { name: 'Move tank right', exact: true }));
  const angle = await center(
    page.getByRole('button', { name: 'Increase firing angle', exact: true }),
  );
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { id: 1, ...move },
      { id: 2, ...angle },
    ],
  });
  await expect.poll(() => value(page, 'angle')).toBeGreaterThan(49);
  await expect.poll(() => value(page, 'movement-remaining')).toBeLessThan(300);
  // CDP touchEnd lists the contacts to release, not the remaining contacts.
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [{ id: 2, ...angle }],
  });
  const remaining = await value(page, 'movement-remaining');
  await expect.poll(() => value(page, 'movement-remaining')).toBeLessThan(remaining - 10);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(80);
  const stopped = await value(page, 'movement-remaining'),
    stoppedAngle = await value(page, 'angle');
  await page.waitForTimeout(160);
  expect(await value(page, 'movement-remaining')).toBe(stopped);
  expect(await value(page, 'angle')).toBe(stoppedAngle);
});

test('native slider drags and battlefield touch aiming do not scroll the page or trigger a shot', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Trusted touch drags use CDP; taps and keyboard sliders also have cross-engine coverage.',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const cdp = await page.context().newCDPSession(page);
  for (const label of ['Firing angle', 'Power level']) {
    const slider = (await page.getByRole('slider', { name: label, exact: true }).boundingBox())!;
    const start = { x: slider.x + slider.width * 0.7, y: slider.y + slider.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 1, ...start }],
    });
    for (let step = 0; step < 8; step++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ id: 1, x: start.x - (slider.width * 0.5 * step) / 7, y: start.y }],
      });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await expect.poll(() => value(page, 'angle')).toBeLessThan(35);
  await expect.poll(() => value(page, 'power')).toBeLessThan(50);
  const before = await value(page, 'angle');
  const canvas = (await page.locator('canvas').boundingBox())!;
  await page.touchscreen.tap(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.3);
  await expect.poll(() => value(page, 'angle')).not.toBe(before);
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'aiming');
  expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0]);
  await expect(page.locator('body')).toHaveAttribute('data-terrain-revision', '0');
});

test('swiping the arsenal scrolls weapons rather than selecting/firing/aiming or dragging the page', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'CDP native swipe; cross-engine selection is separately covered.',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const cdp = await page.context().newCDPSession(page);
  const strip = page.locator('.hud-weapon-strip');
  const rect = (await strip.boundingBox())!;
  const y = rect.y + 25;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ id: 1, x: rect.x + rect.width - 24, y }],
  });
  for (let step = 0; step <= 12; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ id: 1, x: rect.x + rect.width - 24 - ((rect.width - 48) * step) / 12, y }],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => strip.evaluate((strip) => strip.scrollLeft)).toBeGreaterThan(80);
  await expect(page.locator('body')).toHaveAttribute('data-weapon', 'standard-shell');
  await expect(page.locator('body')).toHaveAttribute('data-angle', '45');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'aiming');
  expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0]);
  await page.locator('[data-weapon-id="rail-punch"]').tap();
  await expect(page.locator('body')).toHaveAttribute('data-weapon', 'rail-punch');
});

test('vertical swipes reach weapon information on the smallest phone without moving the page or hiding FIRE', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Trusted touch swipes use CDP.');
  await page.setViewportSize({ width: 320, height: 568 });
  await ready(page);
  const cdp = await page.context().newCDPSession(page);
  const arsenal = page.locator('.hud-arsenal');
  const rect = (await arsenal.boundingBox())!;
  const x = rect.x + rect.width / 2,
    y = rect.y + rect.height - 8;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ id: 1, x, y }],
  });
  for (let step = 0; step <= 10; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ id: 1, x, y: y - (65 * step) / 10 }],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => arsenal.evaluate((element) => element.scrollTop)).toBeGreaterThan(20);
  await page.locator('.hud-weapon-info summary').tap();
  await expect(page.locator('.hud-weapon-info')).toHaveAttribute('open', '');
  await stableLayout(page);
  expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0]);
  await expect(page.locator('body')).toHaveAttribute('data-weapon', 'standard-shell');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'aiming');
});
