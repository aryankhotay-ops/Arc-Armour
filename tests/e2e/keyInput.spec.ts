import { expect, test, type Page } from '@playwright/test';

// Regression: Phaser re-processes its per-frame keyboard queue whenever a new key event arrives
// in the same frame, which once delivered a single key press to one-shot actions twice. Fire
// several key presses inside one animation frame and require exactly one action per press.

const burst = async (page: Page, key: string, code: string, keyCode: number, presses: number) => {
  await page.evaluate(
    ({ key, code, keyCode, presses }) => {
      for (let index = 0; index < presses; index += 1) {
        for (const type of ['keydown', 'keyup'] as const) {
          window.dispatchEvent(
            new KeyboardEvent(type, {
              key,
              code,
              keyCode,
              which: keyCode,
              bubbles: true,
            } as KeyboardEventInit),
          );
        }
      }
    },
    { key, code, keyCode, presses },
  );
};

test('several key presses in one frame cycle the weapon exactly once each', async ({ page }) => {
  await page.goto('/?draft=off');
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-weapon', 'standard-shell');
  await burst(page, 'x', 'KeyX', 88, 3);
  // standard-shell → heavy-shell → cluster-bloom → trident-shot
  await expect(body).toHaveAttribute('data-weapon', 'trident-shot');
  await page.waitForTimeout(150);
  await expect(body).toHaveAttribute('data-weapon', 'trident-shot');
});

test('several draft key presses in one frame make exactly one pick each', async ({ page }) => {
  await page.goto('/?draft=on&seed=3');
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-scene', 'draft');
  await burst(page, 'r', 'KeyR', 82, 3);
  await expect
    .poll(
      async () =>
        (JSON.parse((await body.getAttribute('data-draft-picks')) ?? '[]') as unknown[]).length,
    )
    .toBe(3);
  await page.waitForTimeout(150);
  expect(
    (JSON.parse((await body.getAttribute('data-draft-picks')) ?? '[]') as unknown[]).length,
  ).toBe(3);
});
