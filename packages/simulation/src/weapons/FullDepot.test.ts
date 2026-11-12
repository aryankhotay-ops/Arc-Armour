import { describe, expect, it } from 'vitest';
import {
  EXPANSION_CATALOG,
  EXPANSION_PACK_NAMES,
  FULL_DEPOT_CATALOG,
  ORIGINAL_DELUXE_CATALOG,
} from '@artillery/content';
import { GameEngine } from '../match/GameEngine';
import { assertValidArsenal } from './validateWeapon';
import { WORLD_BOUNDS, COMBAT_LIMITS } from '../config/SimulationConfig';
import { createRandomPoolDraftConfig, validateDraftConfig, WeaponDraft } from '../draft/WeaponDraft';
import { SeededRandom } from '../random/SeededRandom';
import type { CombatEvent } from '../events/CombatEvent';

// Full depot roster (2026-11-10): Original 30 + Deluxe 30 + 13 expansion packs (134) = 194.
// Normal matches draft from a seeded random 20-weapon pool rather than the whole list.
const weapons = FULL_DEPOT_CATALOG;
const make = () =>
  new GameEngine({
    weapons,
    wind: 0,
    terrainSeed: 2,
    terrainSurface: Array.from({ length: WORLD_BOUNDS.width + 1 }, () => 1300),
  });
const settle = (engine: GameEngine): CombatEvent[] => {
  const events = engine.drainEvents();
  for (
    let tick = 0;
    tick < 1800 && engine.state.turnNumber === 1 && engine.state.phase !== 'game-over';
    tick++
  ) {
    engine.update(1 / 60);
    events.push(...engine.drainEvents());
  }
  return events;
};

describe('full depot roster', () => {
  it('contains the Original+Deluxe 60 plus all 13 expansion packs with unique ids', () => {
    expect(EXPANSION_PACK_NAMES).toHaveLength(13);
    expect(EXPANSION_CATALOG).toHaveLength(134);
    expect(weapons).toHaveLength(ORIGINAL_DELUXE_CATALOG.length + EXPANSION_CATALOG.length);
    expect(new Set(weapons.map((w) => w.id)).size).toBe(weapons.length);
    expect(weapons.filter((w) => w.ammo === 'unlimited').map((w) => w.id)).toEqual(['single-shot']);
    expect(() => assertValidArsenal(weapons)).not.toThrow();
    // Every expansion entry declares its pack and an adaptation note.
    for (const weapon of EXPANSION_CATALOG) {
      expect(EXPANSION_PACK_NAMES).toContain(weapon.pack);
      expect(weapon.adaptationNote).toBeTruthy();
    }
  });

  for (const weapon of EXPANSION_CATALOG) {
    it(`${weapon.name} (${weapon.pack}): launches, consumes ammo and resolves bounded and deterministic`, () => {
      const engine = make();
      engine.selectWeapon(weapon.id);
      engine.setAim(45, 0.75);
      expect(engine.fire()).toBe(true);
      expect(engine.activeTank.inventory[weapon.id]).toBe(
        weapon.ammo === 'unlimited' ? 'unlimited' : Number(weapon.ammo) - 1,
      );
      const events = settle(engine);
      expect(engine.state.turnNumber).toBe(2);
      expect(engine.state.projectiles).toHaveLength(0);
      expect(
        engine.terrain.surfaceY.every(
          (y) => Number.isFinite(y) && y >= 0 && y <= WORLD_BOUNDS.height,
        ),
      ).toBe(true);
      const blasts = events.filter((e) => e.type === 'explosion');
      expect(blasts.length).toBeLessThanOrEqual(COMBAT_LIMITS.maxProjectilesPerShot);
      for (const id of ['player1', 'player2'] as const) {
        const sum = events.reduce(
          (total, e) => (e.type === 'tank-damaged' && e.tankId === id ? total + e.amount : total),
          0,
        );
        expect(sum).toBeLessThanOrEqual(weapon.damageCapPerShot);
      }
      const replay = make();
      replay.selectWeapon(weapon.id);
      replay.setAim(45, 0.75);
      replay.fire();
      expect(settle(replay)).toEqual(events);
      expect(replay.state).toEqual(engine.state);
    });
  }
});

describe('random 20-weapon draft pool', () => {
  it('deals a valid 20-weapon pool with five exclusive picks each', () => {
    const config = createRandomPoolDraftConfig(weapons, new SeededRandom(99), 20);
    expect(config.pool).toHaveLength(20);
    expect(config.picksPerPlayer).toBe(5);
    expect(validateDraftConfig(config, weapons)).toEqual([]);
    const draft = new WeaponDraft(config, weapons);
    draft.completeRandomly(new SeededRandom(7));
    const loadouts = draft.loadouts();
    expect(loadouts.shared).toEqual(['single-shot']);
    expect(loadouts.player1).toHaveLength(5);
    expect(loadouts.player2).toHaveLength(5);
    expect(loadouts.player1.filter((w) => loadouts.player2.includes(w))).toEqual([]);
    const engine = new GameEngine({ weapons, loadouts });
    expect(engine.carriedWeapons('player1')).toHaveLength(6);
    expect(engine.carriedWeapons('player2')).toHaveLength(6);
  });

  it('is deterministic per seed and varies across seeds', () => {
    const poolOf = (seed: number) =>
      createRandomPoolDraftConfig(weapons, new SeededRandom(seed), 20).pool;
    expect(poolOf(5)).toEqual(poolOf(5));
    const distinct = new Set([1, 2, 3, 4, 5].map((seed) => JSON.stringify(poolOf(seed))));
    expect(distinct.size).toBeGreaterThan(1);
    // Pool order follows catalog order, so the draft UI stays stable.
    const pool = poolOf(11);
    const order = weapons.map((w) => w.id);
    expect([...pool].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(pool);
  });

  it('clamps to the pool floor and never includes the shared unlimited weapon', () => {
    const tiny = createRandomPoolDraftConfig(weapons, new SeededRandom(3), 2);
    expect(tiny.pool).toHaveLength(2);
    expect(tiny.picksPerPlayer).toBe(1);
    for (const seed of [1, 2, 3]) {
      const config = createRandomPoolDraftConfig(weapons, new SeededRandom(seed), 20);
      expect(config.pool).not.toContain('single-shot');
    }
  });
});
