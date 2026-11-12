import { describe, expect, it } from 'vitest';

import { WEAPON_CATALOG, getWeapon } from '@artillery/content';

import { GameEngine } from '../match/GameEngine';
import type { TankState } from '../state/GameState';
import { createMutableTerrain } from '../terrain/TerrainState';
import {
  arsenalWith,
  findAim,
  fireShot,
  flatSurface,
  runUntilResolved,
  TICK,
  variant,
} from '../testing/harness';
import { fallDamageForDrop, FALL_DAMAGE_MAX, resolveExplosion } from './ExplosionSystem';
import { ShotLedger } from './ShotLedger';

const flat = { terrainSurface: flatSurface() };

describe('shot ledger', () => {
  it('lets each projectile detonate only once', () => {
    const ledger = new ShotLedger(1, 50);
    expect(ledger.claimDetonation(7)).toBe(true);
    expect(ledger.claimDetonation(7)).toBe(false);
    expect(ledger.claimDetonation(8)).toBe(true);
    expect(ledger.detonationCount).toBe(2);
  });

  it('clamps cumulative damage per tank to the per-shot cap', () => {
    const ledger = new ShotLedger(1, 30);
    expect(ledger.applyDamage('player2', 20)).toBe(20);
    expect(ledger.applyDamage('player2', 20)).toBe(10);
    expect(ledger.applyDamage('player2', 20)).toBe(0);
    expect(ledger.applyDamage('player1', 5)).toBe(5);
    expect(ledger.damageDealtTo('player2')).toBe(30);
  });

  it('never grants more projectile slots than the per-shot limit', () => {
    const ledger = new ShotLedger(1, 30);
    expect(ledger.reserveProjectiles(20)).toBe(20);
    expect(ledger.reserveProjectiles(20)).toBe(12);
    expect(ledger.reserveProjectiles(5)).toBe(0);
  });
});

describe('explosion damage', () => {
  const tanksAt = (): [TankState, TankState] => new GameEngine({ wind: 0, ...flat }).state.tanks;

  it('gives the direct-hit bonus only to the tank the warhead struck', () => {
    const weapon = getWeapon('rail-punch');
    const [p1, p2] = tanksAt();
    const input = {
      explosionId: 1,
      shotId: 1,
      projectileId: 1,
      weapon,
      x: p2.x,
      y: p2.groundY - 24,
      damageScale: 1,
      blastScale: 1,
      terrainScale: 1,
    };
    const direct = resolveExplosion(
      { ...input, directHitTankId: 'player2' },
      createMutableTerrain(),
      [p1, p2],
      new ShotLedger(1, 100),
    );
    const splash = resolveExplosion(
      { ...input, directHitTankId: undefined },
      createMutableTerrain(),
      [p1, p2],
      new ShotLedger(1, 100),
    );
    const damageOf = (events: typeof direct.events) =>
      events.reduce(
        (s, e) => (e.type === 'tank-damaged' && e.tankId === 'player2' ? s + e.amount : s),
        0,
      );
    expect(damageOf(direct.events) - damageOf(splash.events)).toBe(weapon.explosion.directHitBonus);
  });

  it('falls off to zero at the edge of the blast radius', () => {
    const weapon = getWeapon('standard-shell');
    const [p1, p2] = tanksAt();
    const far = resolveExplosion(
      {
        explosionId: 1,
        shotId: 1,
        projectileId: 1,
        weapon,
        x: p2.x + 300,
        y: p2.groundY,
        damageScale: 1,
        blastScale: 1,
        terrainScale: 1,
        directHitTankId: undefined,
      },
      // Match the flat-ground tank fixture. Using the default hilly map here would
      // legitimately apply fall damage while testing blast falloff in isolation.
      { ...createMutableTerrain(), surfaceY: flatSurface() },
      [p1, p2],
      new ShotLedger(1, 100),
    );
    expect(far.events.some((event) => event.type === 'tank-damaged')).toBe(false);
  });

  it('applies bounded fall damage when a tank drops into a crater', () => {
    expect(fallDamageForDrop(5)).toBe(0);
    expect(fallDamageForDrop(40)).toBeGreaterThan(0);
    expect(fallDamageForDrop(10_000)).toBe(FALL_DAMAGE_MAX);
  });

  it('Landbreaker drops a nearby tank into its crater and deals fall damage', () => {
    const aim = findAim(
      'landbreaker',
      { ...flat, player1X: 560, player2X: 900 },
      (r) =>
        r.events.filter(
          (e) => e.type === 'tank-damaged' && e.cause === 'fall' && e.tankId === 'player2',
        ).length,
    );
    expect(aim.score).toBeGreaterThan(0);
  });
});

describe('no duplicate damage', () => {
  for (const weapon of WEAPON_CATALOG) {
    it(`${weapon.name}: every detonation is unique and per-shot damage respects the cap`, () => {
      const options =
        weapon.id === 'heavy-shell' || weapon.id === 'landbreaker'
          ? { player1X: 560, player2X: 900 }
          : {};
      const aim = findAim(weapon.id, options, (r) => r.damageTo('player2'));
      const events = aim.result.events;

      const detonated = events.flatMap((e) => (e.type === 'explosion' ? [e.projectileId] : []));
      expect(new Set(detonated).size).toBe(detonated.length);

      const explosionIds = events.flatMap((e) => (e.type === 'explosion' ? [e.explosionId] : []));
      expect(new Set(explosionIds).size).toBe(explosionIds.length);

      // Each explosion damages each tank at most once.
      const pairs = events.flatMap((e) =>
        e.type === 'tank-damaged' && e.cause !== 'fall' ? [`${e.explosionId}:${e.tankId}`] : [],
      );
      expect(new Set(pairs).size).toBe(pairs.length);

      expect(aim.result.damageTo('player2')).toBeLessThanOrEqual(weapon.damageCapPerShot);
      expect(aim.result.damageTo('player1')).toBeLessThanOrEqual(weapon.damageCapPerShot);
      // Damage events and the tank's final health agree exactly.
      expect(100 - aim.result.engine.state.tanks[1].health).toBe(aim.result.damageTo('player2'));
    });
  }

  it('a multi-warhead shot that lands every warhead on one tank is still capped', () => {
    const unforgiving = variant('trident-shot', {
      damageCapPerShot: 20,
      explosion: { maxDamage: 40 },
    });
    const aim = findAim('trident-shot', { weapons: arsenalWith(unforgiving) }, (r) =>
      r.damageTo('player2'),
    );
    expect(aim.result.count('explosion')).toBe(3);
    expect(aim.score).toBe(20);
  });
});

describe('match end cancels the remaining shot', () => {
  it('stops every remaining warhead the moment a tank is destroyed', () => {
    // Weak target: the first cluster detonation destroys it, so the bomblets must never explode.
    const options = { ...flat, startingHealth: 1 };
    const aim = findAim('cluster-bloom', options, (r) =>
      r.engine.state.phase === 'game-over' ? 1 : 0,
    );
    expect(aim.score).toBe(1);
    const { events, engine } = aim.result;

    const endIndex = events.findIndex((event) => event.type === 'match-ended');
    expect(endIndex).toBeGreaterThan(-1);
    const after = events.slice(endIndex + 1);
    expect(
      after.some(
        (e) =>
          e.type === 'explosion' || e.type === 'tank-damaged' || e.type === 'projectile-spawned',
      ),
    ).toBe(false);
    expect(engine.state.phase).toBe('game-over');
    expect(engine.state.projectiles).toHaveLength(0);
    expect(events.filter((event) => event.type === 'match-ended')).toHaveLength(1);
  });

  it('cancels split siblings still in the air when one sibling ends the match', () => {
    const aim = findAim('trident-shot', { ...flat, startingHealth: 1 }, (r) =>
      r.engine.state.phase === 'game-over' ? 10 - r.count('explosion') : 0,
    );
    expect(aim.result.engine.state.phase).toBe('game-over');
    expect(aim.result.count('explosion')).toBeLessThan(3);
    const expired = aim.result.events.filter(
      (event) => event.type === 'projectile-expired' && event.reason === 'match-ended',
    );
    expect(expired.length).toBe(3 - aim.result.count('explosion'));
  });

  it('a stuck charge never detonates after the match is over', () => {
    const engine = new GameEngine({ wind: 0, ...flat });
    engine.selectWeapon('time-capsule');
    engine.setAim(45, 0.6);
    engine.fire();
    for (let tick = 0; tick < 2_000; tick += 1) {
      engine.update(TICK);
      if (engine.drainEvents().some((event) => event.type === 'projectile-stuck')) break;
    }
    expect(engine.state.projectiles[0]?.mode).toBe('stuck');
    // The opponent is destroyed by something else while the charge is still ticking.
    engine.state.tanks[1] = { ...engine.state.tanks[1], health: 0 };
    const result = runUntilResolved(engine);
    // The engine notices at the next detonation attempt: no explosion is produced at all.
    expect(result.count('explosion')).toBe(0);
  });

  it('ignores every command and update once the match is over', () => {
    const aim = findAim('rail-punch', { ...flat, startingHealth: 1 }, (r) =>
      r.engine.state.phase === 'game-over' ? 1 : 0,
    );
    const engine = aim.result.engine;
    expect(engine.state.phase).toBe('game-over');
    const tanks = JSON.stringify(engine.state.tanks);
    const revision = engine.terrain.revision;

    expect(engine.fire()).toBe(false);
    expect(engine.selectWeapon('standard-shell')).toBe(false);
    expect(engine.cycleWeapon(1)).toBe(false);
    engine.setAim(20, 0.4);
    engine.moveActiveTank(50);
    for (let tick = 0; tick < 600; tick += 1) engine.update(TICK);

    expect(JSON.stringify(engine.state.tanks)).toBe(tanks);
    expect(engine.terrain.revision).toBe(revision);
    expect(engine.state.explosions).toHaveLength(0);
    expect(engine.drainEvents().some((event) => event.type === 'explosion')).toBe(false);
  });

  it('plays a full match to completion with bounded total work', () => {
    const engine = new GameEngine({ wind: 0 });
    let shots = 0;
    while (engine.state.phase !== 'game-over' && shots < 200) {
      const tank = engine.activeTank;
      const facing = tank.facing;
      engine.setAim(45, 0.86 + (facing === 1 ? 0 : 0.02));
      expect(engine.fire()).toBe(true);
      runUntilResolved(engine);
      shots += 1;
    }
    expect(engine.state.phase).toBe('game-over');
    expect(shots).toBeLessThan(200);
  });
});

describe('fireShot helper sanity', () => {
  it('produces identical outcomes for identical inputs (determinism)', () => {
    const a = fireShot({ weaponId: 'cluster-bloom', angle: 47, power: 0.83 });
    const b = fireShot({ weaponId: 'cluster-bloom', angle: 47, power: 0.83 });
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    expect(a.engine.terrain.surfaceY).toEqual(b.engine.terrain.surfaceY);
  });
});
