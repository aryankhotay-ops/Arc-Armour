import { describe, expect, it } from 'vitest';

import { WEAPON_CATALOG } from '@artillery/content';

import { GameEngine } from '../match/GameEngine';
import { SeededRandom } from '../random/SeededRandom';
import { runUntilResolved } from '../testing/harness';
import { validateLoadouts, type Loadouts } from './Loadouts';
import {
  createDefaultDraftConfig,
  dealRandomDraft,
  draftPickOrder,
  validateDraftConfig,
  WeaponDraft,
} from './WeaponDraft';

const config = createDefaultDraftConfig(WEAPON_CATALOG);
const newDraft = (): WeaponDraft => new WeaponDraft(config, WEAPON_CATALOG);

const expectExclusive = (loadouts: Loadouts): void => {
  const overlap = loadouts.player1.filter((id) => loadouts.player2.includes(id));
  expect(overlap).toEqual([]);
  for (const id of loadouts.shared) {
    expect(loadouts.player1).not.toContain(id);
    expect(loadouts.player2).not.toContain(id);
  }
};

describe('default draft rules', () => {
  it('shares the unlimited Standard Shell and drafts the other eleven weapons', () => {
    expect(config.shared).toEqual(['standard-shell']);
    expect(config.pool).toHaveLength(11);
    expect(config.pool).not.toContain('standard-shell');
    expect(config.picksPerPlayer).toBe(5);
    expect(validateDraftConfig(config, WEAPON_CATALOG)).toEqual([]);
  });

  it('uses a snake order with Player 2 picking first (Player 1 fires first)', () => {
    expect(draftPickOrder(config)).toEqual([
      'player2',
      'player1',
      'player1',
      'player2',
      'player2',
      'player1',
      'player1',
      'player2',
      'player2',
      'player1',
    ]);
    expect(draftPickOrder({ ...config, order: 'alternating', firstPicker: 'player1' })).toEqual([
      'player1',
      'player2',
      'player1',
      'player2',
      'player1',
      'player2',
      'player1',
      'player2',
      'player1',
      'player2',
    ]);
  });

  it('gives every player the same number of picks in either order', () => {
    for (const order of ['snake', 'alternating'] as const) {
      const picks = draftPickOrder({ ...config, order });
      expect(picks.filter((id) => id === 'player1')).toHaveLength(5);
      expect(picks.filter((id) => id === 'player2')).toHaveLength(5);
    }
  });

  it('rejects a pool too small for the requested picks, or no shared unlimited weapon', () => {
    expect(validateDraftConfig({ ...config, picksPerPlayer: 6 }, WEAPON_CATALOG).join()).toMatch(
      /needs 12/,
    );
    expect(validateDraftConfig({ ...config, shared: [] }, WEAPON_CATALOG).join()).toMatch(
      /unlimited/,
    );
    expect(() => new WeaponDraft({ ...config, pool: ['nope'] }, WEAPON_CATALOG)).toThrow(/unknown/);
  });
});

describe('manual draft picks', () => {
  it('lets each player choose in turn and never gives one weapon to both players', () => {
    const draft = newDraft();
    expect(draft.currentPicker).toBe('player2');
    expect(draft.pick('player2', 'rail-punch').accepted).toBe(true);

    // Player 1 cannot take the weapon Player 2 already owns.
    const stolen = draft.pick('player1', 'rail-punch');
    expect(stolen).toEqual({ accepted: false, reason: 'already-taken', takenBy: 'player2' });
    expect(draft.currentPicker).toBe('player1');
    expect(draft.pick('player1', 'heavy-shell').accepted).toBe(true);
    expect(draft.ownerOf('rail-punch')).toBe('player2');
    expect(draft.ownerOf('heavy-shell')).toBe('player1');
    expect(draft.available).not.toContain('rail-punch');
    expect(draft.available).not.toContain('heavy-shell');
  });

  it('rejects out-of-turn, shared, unknown, and post-completion picks without changing state', () => {
    const draft = newDraft();
    expect(draft.pick('player1', 'heavy-shell')).toMatchObject({ reason: 'not-your-turn' });
    expect(draft.pick('player2', 'standard-shell')).toMatchObject({ reason: 'shared-weapon' });
    expect(draft.pick('player2', 'banana-cannon')).toMatchObject({ reason: 'unknown-weapon' });
    expect(draft.picks).toHaveLength(0);

    draft.completeRandomly(new SeededRandom(1));
    expect(draft.isComplete).toBe(true);
    expect(draft.currentPicker).toBeUndefined();
    expect(draft.pick('player1', draft.unclaimed[0] ?? '')).toMatchObject({
      reason: 'draft-complete',
    });
  });

  it('undo hands the turn back and returns the weapon to the pool', () => {
    const draft = newDraft();
    draft.pick('player2', 'skyburst');
    draft.pick('player1', 'burrower');
    expect(draft.undo()?.weaponId).toBe('burrower');
    expect(draft.currentPicker).toBe('player1');
    expect(draft.available).toContain('burrower');
    draft.reset();
    expect(draft.picks).toHaveLength(0);
    expect(draft.currentPicker).toBe('player2');
  });

  it('cannot produce loadouts before the draft is complete', () => {
    const draft = newDraft();
    draft.pick('player2', 'skyburst');
    expect(() => draft.loadouts()).toThrow(/not complete/);
  });

  it('produces exclusive catalog-ordered loadouts, leaving exactly one weapon unclaimed', () => {
    const draft = newDraft();
    const choices = [
      'rail-punch',
      'heavy-shell',
      'cluster-bloom',
      'skyburst',
      'needle-dart',
      'time-capsule',
      'burrower',
      'ricochet-orb',
      'trident-shot',
      'landbreaker',
    ];
    for (const weaponId of choices) {
      const picker = draft.currentPicker;
      if (picker === undefined) throw new Error('draft ended early');
      expect(draft.pick(picker, weaponId).accepted).toBe(true);
    }
    const loadouts = draft.loadouts();
    expectExclusive(loadouts);
    expect(loadouts.player1).toHaveLength(5);
    expect(loadouts.player2).toHaveLength(5);
    expect(draft.unclaimed).toEqual(['forking-star']);
    // Catalog order, not pick order.
    const catalogIndex = (id: string) => WEAPON_CATALOG.findIndex((weapon) => weapon.id === id);
    for (const list of [loadouts.player1, loadouts.player2]) {
      expect([...list].sort((a, b) => catalogIndex(a) - catalogIndex(b))).toEqual(list);
    }
    expect(validateLoadouts(loadouts, WEAPON_CATALOG)).toEqual([]);
  });
});

describe('random assignment', () => {
  it('a random pick gives the current picker an unclaimed weapon and records the method', () => {
    const draft = newDraft();
    draft.pick('player2', 'rail-punch');
    const result = draft.pickRandom(new SeededRandom(99));
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.pick.playerId).toBe('player1');
    expect(result.pick.method).toBe('random');
    expect(result.pick.weaponId).not.toBe('rail-punch');
  });

  it('can finish a partially chosen draft at random, keeping the manual picks', () => {
    const draft = newDraft();
    draft.pick('player2', 'rail-punch');
    draft.pick('player1', 'heavy-shell');
    const added = draft.completeRandomly(new SeededRandom(5));
    expect(added).toHaveLength(8);
    expect(added.every((pick) => pick.method === 'random')).toBe(true);
    const loadouts = draft.loadouts();
    expect(loadouts.player2).toContain('rail-punch');
    expect(loadouts.player1).toContain('heavy-shell');
    expectExclusive(loadouts);
  });

  it('deals exclusive loadouts for many different seeds', () => {
    const distributions = new Set<string>();
    for (let seed = 1; seed <= 200; seed += 1) {
      const draft = dealRandomDraft(config, WEAPON_CATALOG, new SeededRandom(seed));
      const loadouts = draft.loadouts();
      expectExclusive(loadouts);
      expect(loadouts.player1).toHaveLength(5);
      expect(loadouts.player2).toHaveLength(5);
      expect(draft.unclaimed).toHaveLength(1);
      distributions.add(loadouts.player1.join(','));
    }
    // Random deals actually vary.
    expect(distributions.size).toBeGreaterThan(150);
  });

  it('is deterministic: the same seed always deals the same loadouts', () => {
    const a = dealRandomDraft(config, WEAPON_CATALOG, new SeededRandom(424242)).loadouts();
    const b = dealRandomDraft(config, WEAPON_CATALOG, new SeededRandom(424242)).loadouts();
    const c = dealRandomDraft(config, WEAPON_CATALOG, new SeededRandom(424243)).loadouts();
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('gives every weapon a fair chance of going to either player', () => {
    const counts = new Map<string, { player1: number; player2: number }>();
    const deals = 2_000;
    for (let seed = 1; seed <= deals; seed += 1) {
      const loadouts = dealRandomDraft(config, WEAPON_CATALOG, new SeededRandom(seed)).loadouts();
      for (const playerId of ['player1', 'player2'] as const) {
        for (const id of loadouts[playerId]) {
          const entry = counts.get(id) ?? { player1: 0, player2: 0 };
          entry[playerId] += 1;
          counts.set(id, entry);
        }
      }
    }
    // Each weapon is drafted with probability 10/11 and splits evenly between the players.
    for (const id of config.pool) {
      const entry = counts.get(id) ?? { player1: 0, player2: 0 };
      expect(entry.player1 / deals).toBeGreaterThan(0.38);
      expect(entry.player1 / deals).toBeLessThan(0.53);
      expect(entry.player2 / deals).toBeGreaterThan(0.38);
      expect(entry.player2 / deals).toBeLessThan(0.53);
    }
  });
});

describe('seeded random generator', () => {
  it('repeats exactly for a seed and stays within range', () => {
    const a = new SeededRandom(7);
    const b = new SeededRandom(7);
    for (let index = 0; index < 1_000; index += 1) {
      const value = a.next();
      expect(value).toBe(b.next());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(() => a.int(0)).toThrow();
    expect(() => a.pick([])).toThrow();
  });

  it('shuffles into a permutation without mutating the input', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = new SeededRandom(3).shuffle(items);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('drafted loadouts in a match', () => {
  const dealt = (): Loadouts =>
    dealRandomDraft(config, WEAPON_CATALOG, new SeededRandom(2026)).loadouts();

  it('gives each tank only its own drafted weapons plus the shared Standard Shell', () => {
    const loadouts = dealt();
    const engine = new GameEngine({ wind: 0, loadouts });
    for (const playerId of ['player1', 'player2'] as const) {
      const carried = engine.carriedWeapons(playerId).map((weapon) => weapon.id);
      expect([...carried].sort()).toEqual(['standard-shell', ...loadouts[playerId]].sort());
    }
    const p1 = engine.carriedWeapons('player1').map((weapon) => weapon.id);
    const p2 = engine.carriedWeapons('player2').map((weapon) => weapon.id);
    expect(p1.filter((id) => p2.includes(id))).toEqual(['standard-shell']);
  });

  it('refuses to select or fire a weapon the opponent drafted', () => {
    const loadouts = dealt();
    const engine = new GameEngine({ wind: 0, loadouts });
    const opponentsWeapon = loadouts.player2[0] ?? '';
    expect(engine.selectWeapon(opponentsWeapon)).toBe(false);
    expect(engine.activeTank.selectedWeaponId).toBe('standard-shell');
    for (const own of loadouts.player1) expect(engine.selectWeapon(own)).toBe(true);
  });

  it('weapon cycling only visits the active player’s own weapons', () => {
    const loadouts = dealt();
    const engine = new GameEngine({ wind: 0, loadouts });
    const visited = new Set<string>([engine.activeTank.selectedWeaponId]);
    for (let index = 0; index < 20; index += 1) {
      engine.cycleWeapon(1);
      visited.add(engine.activeTank.selectedWeaponId);
    }
    expect([...visited].sort()).toEqual(['standard-shell', ...loadouts.player1].sort());
  });

  it('player 2 can fire their own drafted weapons on their turn', () => {
    const loadouts = dealt();
    const engine = new GameEngine({ wind: 0, loadouts });
    engine.fire();
    runUntilResolved(engine);
    expect(engine.state.activePlayerId).toBe('player2');
    const own = loadouts.player2[0] ?? '';
    expect(engine.selectWeapon(own)).toBe(true);
    expect(engine.fire()).toBe(true);
    expect(engine.activeTank.inventory[own]).toBeDefined();
  });

  it('rejects loadouts that share a drafted weapon or lack an unlimited weapon', () => {
    const shared = { shared: ['standard-shell'], player1: ['rail-punch'], player2: ['rail-punch'] };
    expect(() => new GameEngine({ loadouts: shared })).toThrow(/both player1 and player2/);
    const noFallback = { shared: [], player1: ['rail-punch'], player2: ['heavy-shell'] };
    expect(() => new GameEngine({ loadouts: noFallback })).toThrow(/unlimited/);
  });

  it('without loadouts, both players still carry the whole arsenal', () => {
    const engine = new GameEngine({ wind: 0 });
    expect(engine.carriedWeapons('player1')).toHaveLength(12);
    expect(engine.carriedWeapons('player2')).toHaveLength(12);
  });
});
