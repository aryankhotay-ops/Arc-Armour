import { describe, expect, it } from 'vitest';
import {
  ORIGINAL_DELUXE_CATALOG,
  ORIGINAL_WEAPON_NAMES,
  DELUXE_WEAPON_NAMES,
} from '@artillery/content';
import { GameEngine } from '../match/GameEngine';
import { assertValidArsenal } from './validateWeapon';
import { WORLD_BOUNDS, COMBAT_LIMITS } from '../config/SimulationConfig';
import { coatTerrain, terrainCoating, editTerrainProfile } from '../terrain/TerrainState';
import { createDefaultDraftConfig, WeaponDraft } from '../draft/WeaponDraft';
import { SeededRandom } from '../random/SeededRandom';
import type { CombatEvent } from '../events/CombatEvent';

const weapons = ORIGINAL_DELUXE_CATALOG;
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
describe('approved Original and Deluxe roster', () => {
  it('contains exactly the official two 30-item groups and no old/custom/expansion entries', () => {
    expect(weapons).toHaveLength(60);
    expect(ORIGINAL_WEAPON_NAMES).toHaveLength(30);
    expect(DELUXE_WEAPON_NAMES).toHaveLength(30);
    expect(weapons.filter((w) => w.pack === 'original').map((w) => w.name)).toEqual(
      ORIGINAL_WEAPON_NAMES,
    );
    expect(weapons.filter((w) => w.pack === 'deluxe').map((w) => w.name)).toEqual(
      DELUXE_WEAPON_NAMES,
    );
    expect(new Set(weapons.map((w) => w.id)).size).toBe(60);
    expect(
      weapons.some((w) =>
        ['Nuke', 'Super Star', 'Lightning Rod', 'Trident Shot', 'Burrower'].includes(w.name),
      ),
    ).toBe(false);
    expect(weapons.filter((w) => w.ammo === 'unlimited').map((w) => w.id)).toEqual(['single-shot']);
    expect(() => assertValidArsenal(weapons)).not.toThrow();
  });
  for (const weapon of weapons) {
    it(`${weapon.name}: genuinely launches, consumes one round, resolves with finite bounded state and deterministic outcomes`, () => {
      const engine = make();
      const before = JSON.stringify(weapons);
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
      expect(new Set(blasts.map((e) => (e.type === 'explosion' ? e.projectileId : 0))).size).toBe(
        blasts.length,
      );
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
      expect(JSON.stringify(weapons)).toBe(before);
    });
  }
  it('supports the complete 59-item draft pool with five exclusive picks each', () => {
    const draft = new WeaponDraft(createDefaultDraftConfig(weapons), weapons);
    expect(draft.config.pool).toHaveLength(59);
    draft.completeRandomly(new SeededRandom(17));
    expect(draft.isComplete).toBe(true);
    const loadouts = draft.loadouts();
    expect(loadouts.shared).toEqual(['single-shot']);
    const engine = new GameEngine({ weapons, loadouts });
    expect(engine.carriedWeapons('player1')).toHaveLength(6);
    expect(engine.carriedWeapons('player2')).toHaveLength(6);
    expect(loadouts.player1.filter((w) => loadouts.player2.includes(w))).toEqual([]);
  });
  it('builds walls/mounds and removes a trench in the actual collision heightfield', () => {
    const engine = make();
    editTerrainProfile(engine.terrain, 1000, 1300, 90, 150, 'add', 'wall');
    expect(engine.terrain.surfaceY[1000]).toBe(1150);
    editTerrainProfile(engine.terrain, 1000, 1300, 90, 100, 'cut', 'trench');
    expect(engine.terrain.surfaceY[1000]).toBe(1400);
    expect(engine.terrain.revision).toBe(2);
  });
  it('glue overrides rubber only inside its real terrain interval and coatings are bounded', () => {
    const engine = make();
    coatTerrain(engine.terrain, 1000, 'rubber');
    coatTerrain(engine.terrain, 1000, 'glue', 80);
    expect(terrainCoating(engine.terrain, 1000)).toBe('glue');
    expect(terrainCoating(engine.terrain, 1100)).toBe('rubber');
    for (let i = 0; i < 100; i++) coatTerrain(engine.terrain, i * 5, 'rubber');
    expect(engine.terrain.coatings!.length).toBe(64);
  });

  it.each(['magic-wall', 'dirtball', 'dirt-slinger', 'big-dirtball', 'mud-pie', 'cruball'])(
    '%s adds actual solid terrain, not a cosmetic impact flash',
    (id) => {
      const engine = make();
      engine.selectWeapon(id);
      engine.fire();
      settle(engine);
      expect(Math.min(...engine.terrain.surfaceY)).toBeLessThan(1290);
      expect(engine.terrain.revision).toBeGreaterThan(0);
      expect(engine.state.tanks.map((t) => t.health)).toEqual([100, 100]);
    },
  );
  it.each(['tracer', 'super-tracer', 'flash-blast'])(
    '%s leaves terrain intact as specified',
    (id) => {
      const engine = make();
      engine.selectWeapon(id);
      engine.fire();
      settle(engine);
      expect(engine.terrain.revision).toBe(0);
      if (id !== 'flash-blast') {
        expect(engine.state.tanks.map((t) => t.health)).toEqual([100, 100]);
        expect(engine.state.message).toContain('units');
      }
    },
  );
  it('Jump Jets actually moves the owner to a new resting position', () => {
    const engine = make(),
      x = engine.activeTank.x;
    engine.selectWeapon('jump-jets');
    engine.fire();
    settle(engine);
    expect(engine.tank('player1').x).toBeGreaterThan(x + 100);
    expect(engine.tank('player1').groundY).toBe(1300);
    expect(engine.state.tanks.map((t) => t.health)).toEqual([100, 100]);
  });
  it('Jackhammer produces six unique impact pulses, with five true vertical hops', () => {
    const engine = make();
    engine.selectWeapon('jackhammer');
    engine.fire();
    const events = settle(engine),
      explosions = events.filter((e) => e.type === 'explosion');
    expect(explosions).toHaveLength(6);
    expect(new Set(explosions.map((e) => e.projectileId)).size).toBe(6);
    const xs = explosions.map((e) => e.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.01);
  });
  it.each(['ground-hog', 'worm', 'homing-worm', 'digger', 'late-bloomer'])(
    '%s travels underground and excavates a real path',
    (id) => {
      const engine = make();
      engine.selectWeapon(id);
      engine.fire();
      settle(engine);
      expect(engine.terrain.revision).toBeGreaterThan(20);
      expect(engine.terrain.surfaceY.filter((y) => y > 1300).length).toBeGreaterThan(100);
    },
  );
  it('rubber reflects an ordinary shot while glue cancels the reflection', () => {
    const shoot = (kind: 'rubber' | 'glue') => {
      const engine = make();
      coatTerrain(engine.terrain, 1600, 'rubber', 3200);
      if (kind === 'glue') coatTerrain(engine.terrain, 1600, 'glue', 3200);
      engine.fire();
      return settle(engine).filter((e) => e.type === 'projectile-bounced').length;
    };
    expect(shoot('rubber')).toBeGreaterThan(0);
    expect(shoot('glue')).toBe(0);
  });
  it('staggered automatic volleys remain finite with delayed rounds and can never exceed the per-shot cap', () => {
    const engine = make();
    engine.selectWeapon('minigun');
    engine.fire();
    expect(engine.state.projectiles.filter((p) => (p.launchDelay ?? 0) > 0)).toHaveLength(7);
    const events = settle(engine);
    expect(events.filter((e) => e.type === 'explosion')).toHaveLength(8);
  });
  it.each(['zapper', 'super-zapper'])(
    '%s deals real proximity-beam damage without a physical tank hit or crater',
    (id) => {
      const engine = make();
      engine.selectWeapon(id);
      engine.setAim(45, 0.75);
      engine.fire();
      const p = engine.state.projectiles[0]!;
      // Isolate the near-tank trigger, not a claimed ballistic hit from this chosen aim.
      p.x = engine.inactiveTank.x - 100;
      p.y = engine.inactiveTank.groundY - 100;
      p.velocityX = 100;
      p.velocityY = 20;
      p.ageSeconds = 1;
      const events = settle(engine);
      expect(engine.tank('player2').health).toBeLessThan(100);
      expect(engine.terrain.revision).toBe(0);
      expect(events.some((e) => e.type === 'tank-damaged')).toBe(true);
    },
  );
});
