import { expect, test, type Locator, type Page } from '@playwright/test';

// Browser coverage for the pre-match weapon draft. State is read from data-* attributes the
// draft and battlefield scenes mirror onto <body>.

// Draft pool in display order (catalog minus the shared Standard Shell) and its keys.
const POOL = [
  'heavy-shell',
  'cluster-bloom',
  'trident-shot',
  'ricochet-orb',
  'skyburst',
  'burrower',
  'landbreaker',
  'needle-dart',
  'time-capsule',
  'forking-star',
  'rail-punch',
] as const;
const POOL_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'];
// Card grid geometry in game coordinates (must match DraftScene).
const CARD_W = 172;
const CARD_H = 112;
const CARD_GAP = 12;
const GRID_X = 640 - (4 * CARD_W + 3 * CARD_GAP) / 2;
const GRID_Y = 118;

const openDraft = async (page: Page, seed = 7): Promise<Locator> => {
  await page.goto(`/?draft=on&seed=${seed}`);
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-scene', 'draft');
  return body;
};

const list = async (body: Locator, attribute: string): Promise<string[]> =>
  ((await body.getAttribute(attribute)) ?? '').split(',').filter((id) => id.length > 0);

const picks = async (body: Locator): Promise<[string, string, string][]> =>
  JSON.parse((await body.getAttribute('data-draft-picks')) ?? '[]') as [string, string, string][];

const clickCard = async (page: Page, poolIndex: number): Promise<void> => {
  const box = await page.locator('canvas').boundingBox();
  if (box === null) throw new Error('canvas not visible');
  const x = GRID_X + (poolIndex % 4) * (CARD_W + CARD_GAP) + CARD_W / 2;
  const y = GRID_Y + Math.floor(poolIndex / 4) * (CARD_H + CARD_GAP) + CARD_H / 2;
  await page.mouse.click(box.x + (x / 1280) * box.width, box.y + (y / 720) * box.height);
};

const expectExclusive = async (body: Locator): Promise<void> => {
  const p1 = await list(body, 'data-draft-p1');
  const p2 = await list(body, 'data-draft-p2');
  expect(p1).toHaveLength(5);
  expect(p2).toHaveLength(5);
  expect(p1.filter((id) => p2.includes(id))).toEqual([]);
};

test('players choose weapons in turn and cannot take a weapon the other owns', async ({ page }) => {
  const body = await openDraft(page);
  await expect(body).toHaveAttribute('data-draft-picker', 'player2');

  await clickCard(page, 10); // Player 2 takes Rail Punch by clicking its card.
  await expect(body).toHaveAttribute('data-draft-p2', 'rail-punch');
  await expect(body).toHaveAttribute('data-draft-picker', 'player1');

  // Player 1 tries the same weapon, by click and by key: both are refused.
  await clickCard(page, 10);
  await page.keyboard.press('-');
  await expect(body).toHaveAttribute('data-draft-picker', 'player1');
  await expect(body).toHaveAttribute('data-draft-p1', '');

  await page.keyboard.press('1'); // Heavy Shell
  await expect(body).toHaveAttribute('data-draft-p1', 'heavy-shell');
  // Snake order: Player 1 picks again.
  await expect(body).toHaveAttribute('data-draft-picker', 'player1');
});

test('a fully hand-chosen draft carries exclusive loadouts into the battle', async ({ page }) => {
  const body = await openDraft(page);
  for (const key of ['-', '1', '2', '5', '8', '9', '6', '4', '3', '7']) {
    await page.keyboard.press(key);
  }
  await expect(body).toHaveAttribute('data-draft-complete', 'true');
  await expectExclusive(body);
  const chosen = await picks(body);
  expect(chosen.every(([, , method]) => method === 'chosen')).toBe(true);
  const p1 = await list(body, 'data-draft-p1');
  const p2 = await list(body, 'data-draft-p2');

  await page.keyboard.press('Enter');
  await expect(body).toHaveAttribute('data-scene', 'battlefield');
  await expect(body).toHaveAttribute('data-drafted', 'true');
  const p1Weapons = await list(body, 'data-p1-weapons');
  const p2Weapons = await list(body, 'data-p2-weapons');
  expect([...p1Weapons].sort()).toEqual(['standard-shell', ...p1].sort());
  expect([...p2Weapons].sort()).toEqual(['standard-shell', ...p2].sort());
  expect(p1Weapons.filter((id) => p2Weapons.includes(id))).toEqual(['standard-shell']);
});

test('deal all random assigns exclusive loadouts reproducibly from the seed', async ({ page }) => {
  const body = await openDraft(page, 12345);
  await page.keyboard.press('a');
  await expect(body).toHaveAttribute('data-draft-complete', 'true');
  await expectExclusive(body);
  const dealt = await picks(body);
  expect(dealt).toHaveLength(10);
  expect(dealt.every(([, , method]) => method === 'random')).toBe(true);
  const firstP1 = await body.getAttribute('data-draft-p1');

  // Same seed in a fresh page deals the same loadouts.
  const again = await openDraft(page, 12345);
  await page.keyboard.press('a');
  await expect(again).toHaveAttribute('data-draft-p1', firstP1 ?? '');
});

test('random pick, randomize rest, undo and reset all respect exclusivity', async ({ page }) => {
  const body = await openDraft(page, 99);
  await page.keyboard.press('3'); // Player 2 chooses Trident Shot.
  await page.keyboard.press('r'); // Player 1 gets a random weapon.
  await expect.poll(async () => (await picks(body)).length).toBe(2);
  const [first, second] = await picks(body);
  expect(first).toEqual(['player2', 'trident-shot', 'chosen']);
  expect(second?.[0]).toBe('player1');
  expect(second?.[2]).toBe('random');
  expect(second?.[1]).not.toBe('trident-shot');

  await page.keyboard.press('u'); // Undo the random pick.
  await expect.poll(async () => (await picks(body)).length).toBe(1);
  await expect(body).toHaveAttribute('data-draft-picker', 'player1');

  await page.keyboard.press('t'); // Randomize everything left.
  await expect(body).toHaveAttribute('data-draft-complete', 'true');
  await expectExclusive(body);
  expect(await list(body, 'data-draft-p2')).toContain('trident-shot');

  await clickCard(page, 0); // Draft is complete: picks are ignored.
  await expect.poll(async () => (await picks(body)).length).toBe(10);
});

test('the battle only offers each player their own drafted weapons', async ({ page }) => {
  const body = await openDraft(page, 2026);
  await page.keyboard.press('a');
  await expect(body).toHaveAttribute('data-draft-complete', 'true');
  const p2Drafted = await list(body, 'data-draft-p2');
  await page.keyboard.press('Enter');
  await expect(body).toHaveAttribute('data-scene', 'battlefield');

  // Player 1 cycles through every weapon they own: none belong to Player 2.
  const p1Weapons = await list(body, 'data-p1-weapons');
  expect(p1Weapons).toHaveLength(6);
  const seen = new Set<string>();
  for (let index = 0; index < p1Weapons.length; index += 1) {
    const current = (await body.getAttribute('data-weapon')) ?? '';
    seen.add(current);
    await page.keyboard.press('x');
    // Wait for the next frame to publish the new selection before reading it.
    await expect(body).not.toHaveAttribute('data-weapon', current);
  }
  expect([...seen].sort()).toEqual([...p1Weapons].sort());
  for (const id of p2Drafted) expect(seen.has(id)).toBe(false);

  // Number keys index Player 1's own six slots; key 6 is their last weapon and 7 does nothing.
  await page.keyboard.press('6');
  await expect(body).toHaveAttribute('data-weapon', p1Weapons[5] ?? '');
  await page.keyboard.press('7');
  await page.waitForTimeout(100);
  await expect(body).toHaveAttribute('data-weapon', p1Weapons[5] ?? '');
});

test('draft order and the start button are enforced', async ({ page }) => {
  const body = await openDraft(page);
  await page.keyboard.press('Enter'); // Cannot start an incomplete draft.
  await expect(body).toHaveAttribute('data-scene', 'draft');
  for (const [index, key] of POOL_KEYS.slice(0, 4).entries()) {
    await page.keyboard.press(key);
    await expect(body).toHaveAttribute(
      'data-draft-picker',
      ['player1', 'player1', 'player2', 'player2'][index] ?? '',
    );
  }
  expect((await picks(body)).map(([player, weapon]) => [player, weapon])).toEqual([
    ['player2', POOL[0]],
    ['player1', POOL[1]],
    ['player1', POOL[2]],
    ['player2', POOL[3]],
  ]);
});
