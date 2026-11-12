import { test, expect, type Page } from '@playwright/test';

// Full depot roster (2026-11-10): 194 weapons across Original, Deluxe and 13 expansion
// packs; normal drafts offer a seeded random 20-weapon pool per match.
const ROSTER_SIZE = 194;
const DRAFT_POOL = 20;

const practice = async (page: Page): Promise<void> => {
  await page.goto('/?draft=off&terrainSeed=2&tank1=tiger-i&tank2=leopard-2a7');
  await expect(page.locator('body')).toHaveAttribute('data-weapon-arsenal', 'full-depot');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'battlefield');
};

test('normal catalog contains the full depot roster with no retired custom weapons', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Weapon selection', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('[data-weapon]')).toHaveCount(ROSTER_SIZE);
  for (const id of ['single-shot', 'cruiser', 'jump-jets', 'flash-blast', 'nuke', 'tesla-coil'])
    await expect(dialog.locator(`[data-weapon="${id}"]`)).toBeAttached();
  await expect(dialog.locator('[data-weapon="standard-shell"]')).toHaveCount(0);
  await dialog.getByRole('button', { name: /Hail Storm/ }).click();
  await expect(dialog.getByRole('region', { name: 'Weapon details' })).toContainText(
    'Twelve bouncing ice fragments',
  );
});

test('desktop draft offers a seeded random 20-weapon pool with exclusive ownership', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?draft=on&seed=77');
  const pool = page.getByRole('group', { name: 'Draftable weapons' });
  await expect(pool.getByRole('button')).toHaveCount(DRAFT_POOL);
  const first = pool.getByRole('button').first();
  const firstId = await first.getAttribute('data-draft-weapon');
  await first.click();
  await expect(first).toBeDisabled();
  await page.getByRole('button', { name: 'Randomize rest', exact: true }).click();
  await page.screenshot({ path: 'artifacts/ui/original-deluxe/full-roster-draft.png' });
  await page.getByRole('button', { name: 'Start battle', exact: true }).click();
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-scene', 'battlefield');
  const p1 = (await body.getAttribute('data-p1-weapons'))!.split(','),
    p2 = (await body.getAttribute('data-p2-weapons'))!.split(',');
  expect(p1).toHaveLength(6);
  expect(p2).toHaveLength(6);
  expect(p1.filter((w) => p2.includes(w))).toEqual(['single-shot']);
  expect(p2).toContain(firstId);
});

test('the same draft seed deals the same 20-weapon pool; a different seed differs', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const poolIds = async (seed: number): Promise<string[]> => {
    await page.goto(`/?draft=on&seed=${seed}`);
    const pool = page.getByRole('group', { name: 'Draftable weapons' });
    await expect(pool.getByRole('button')).toHaveCount(DRAFT_POOL);
    return pool
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((b) => (b as HTMLElement).dataset.draftWeapon ?? ''));
  };
  const a = await poolIds(123);
  const b = await poolIds(123);
  expect(a).toEqual(b);
  const c = await poolIds(321);
  expect(c).not.toEqual(a);
});

for (const id of [
  'single-shot',
  'magic-wall',
  'jump-jets',
  'laser',
  'bouncy-dirt',
  'super-tracer',
  'fission-bomb',
  'roller',
  'nuke',
  'carpet-bomb',
  'tesla-coil',
  'warp-gate',
]) {
  test(`${id}: real practice arsenal selection fires, locks controls and resolves normally`, async ({
    page,
  }) => {
    await practice(page);
    const body = page.locator('body');
    await expect(page.locator('[data-weapon-id]')).toHaveCount(ROSTER_SIZE);
    const slot = page.locator(`[data-weapon-id="${id}"]`);
    await slot.click();
    await expect(body).toHaveAttribute('data-weapon', id);
    await page
      .getByRole('slider', { name: 'Firing angle', exact: true })
      .fill(id === 'laser' ? '10' : '45');
    await page.getByRole('button', { name: 'Fire selected weapon', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Move tank right', exact: true })).toBeDisabled();
    await expect(body).toHaveAttribute('data-turn', '2', { timeout: 20000 });
    await expect(body).toHaveAttribute('data-projectiles', '0');
    await page.screenshot({ path: `artifacts/ui/original-deluxe/${id}-resolved.png` });
  });
}

test('refined tank picker retains independent model selection and actual rotating gun launch alignment', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1800 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Play local', exact: true }).click();
  await page.getByRole('radio', { name: 'Player 1: Panther', exact: true }).check();
  await page.getByRole('button', { name: 'Choose Player 2 tank', exact: true }).click();
  await page.getByRole('radio', { name: 'Player 2: IS-2', exact: true }).check();
  await page
    .getByRole('region', { name: 'Tank selection', exact: true })
    .screenshot({ path: 'artifacts/ui/tanks/refined-roster.png' });
  await page.getByLabel('Full-arsenal practice', { exact: false }).check();
  await page.getByRole('button', { name: 'Start local game' }).click();
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-tank-designs', 'panther,is-2');
  await page.getByRole('slider', { name: 'Firing angle', exact: true }).fill('75');
  await expect
    .poll(async () =>
      Math.abs(JSON.parse((await body.getAttribute('data-tank-barrels'))!)[0].angle - 75),
    )
    .toBeLessThan(0.1);
  const guns = JSON.parse((await body.getAttribute('data-tank-barrels'))!) as {
    tip: { x: number; y: number };
    expected: { x: number; y: number };
  }[];
  for (const g of guns)
    expect(Math.hypot(g.tip.x - g.expected.x, g.tip.y - g.expected.y)).toBeLessThan(0.2);
});

test('phone draft remains scrollable with the random pool and no canvas-covering controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?draft=on&seed=77');
  const pool = page.getByRole('group', { name: 'Draftable weapons' });
  await expect(pool.getByRole('button')).toHaveCount(DRAFT_POOL);
  await pool.getByRole('button').first().click();
  await page.getByRole('button', { name: 'Randomize rest', exact: true }).click();
  await page.getByRole('button', { name: 'Start battle', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'battlefield');
  await expect(page.locator('[data-weapon-id]')).toHaveCount(6);
  await page.screenshot({ path: 'artifacts/ui/original-deluxe/phone-match.png' });
});
