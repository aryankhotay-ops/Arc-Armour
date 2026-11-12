import { describe, expect, it } from 'vitest';

import { getWeapon } from '@artillery/content';

import { COMBAT_LIMITS, WORLD_BOUNDS } from '../config/SimulationConfig';
import { GameEngine } from '../match/GameEngine';
import { distanceToTank } from '../tanks/TankGeometry';
import { sampleMutableSurfaceY } from '../terrain/TerrainState';
import {
  arsenalWith,
  findAim,
  fireShot,
  flatSurface,
  FLAT_Y,
  runUntilResolved,
  TICK,
  variant,
  withBump,
  withPit,
} from '../testing/harness';
import { predictTrajectory, substepCount } from './Ballistics';

const flat = { terrainSurface: flatSurface() };

describe('multi-projectile launch (Trident Shot)', () => {
  it('launches three warheads from one shot that fan out and detonate separately', () => {
    const engine = new GameEngine({ wind: 0, ...flat });
    engine.selectWeapon('trident-shot');
    engine.setAim(45, 0.6); // lands short of the opponent, so the fan is visible on open ground
    engine.fire();
    const [low, mid, high] = engine.state.projectiles;
    expect(engine.state.projectiles).toHaveLength(3);
    expect(new Set(engine.state.projectiles.map((projectile) => projectile.id)).size).toBe(3);
    // Equal speed, distinct directions spaced by spread / (count - 1).
    const angleOf = (p: typeof low) => Math.atan2(p!.velocityY, p!.velocityX);
    const step = (9 * Math.PI) / 180 / 2;
    expect(angleOf(mid) - angleOf(low)).toBeCloseTo(step, 6);
    expect(angleOf(high) - angleOf(mid)).toBeCloseTo(step, 6);

    const result = runUntilResolved(engine);
    const explosions = result.events.flatMap((event) =>
      event.type === 'explosion' ? [event] : [],
    );
    expect(explosions).toHaveLength(3);
    expect(new Set(explosions.map((event) => event.projectileId)).size).toBe(3);
    const xs = explosions.map((event) => event.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(4);
  });

  it('consumes exactly one round of ammunition for the whole volley', () => {
    const engine = new GameEngine({ wind: 0 });
    engine.selectWeapon('trident-shot');
    engine.fire();
    expect(engine.activeTank.inventory['trident-shot']).toBe(2);
  });
});

describe('bouncing (Ricochet Orb)', () => {
  it('bounces exactly its configured count off terrain, losing energy each time', () => {
    const result = fireShot({ weaponId: 'ricochet-orb', angle: 30, power: 0.6, engine: flat });
    expect(result.count('projectile-bounced')).toBe(2);
    expect(result.count('explosion')).toBe(1);
  });

  it('stops bouncing and detonates once it is slower than its minimum speed', () => {
    const sluggish = variant('ricochet-orb', {
      projectile: { bounce: { count: 4, restitution: 0.3, minSpeed: 150 } },
    });
    const result = fireShot({
      weaponId: 'ricochet-orb',
      angle: 45,
      power: 0.5,
      engine: { ...flat, weapons: arsenalWith(sluggish) },
    });
    expect(result.count('projectile-bounced')).toBeLessThan(4);
    expect(result.count('explosion')).toBe(1);
  });

  it('detonates on a tank instead of bouncing off armour', () => {
    const aim = findAim('ricochet-orb', flat, (r) =>
      r.events.some((e) => e.type === 'explosion' && e.directHitTankId === 'player2') ? 1 : 0,
    );
    expect(aim.score).toBe(1);
    const lastBounceBeforeHit = aim.result.events.findIndex(
      (e) => e.type === 'explosion' && e.directHitTankId === 'player2',
    );
    expect(lastBounceBeforeHit).toBeGreaterThan(-1);
    expect(aim.result.count('explosion')).toBe(1);
  });

  it('skips along low ground into a pit target', () => {
    const bunker = { terrainSurface: withPit(flatSurface(), 1010, 75, 24, 120), player2X: 1010 };
    // Only count hits that actually used a bounce to get there.
    const skip = findAim('ricochet-orb', bunker, (r) =>
      r.count('projectile-bounced') > 0 ? r.damageTo('player2') : 0,
    );
    expect(skip.score).toBeGreaterThan(20);
    expect(skip.result.count('projectile-bounced')).toBeGreaterThan(0);
  });
});

describe('impact cluster (Cluster Bloom)', () => {
  it('releases its bomblets exactly once, and the bomblets never spawn again', () => {
    const weapon = getWeapon('cluster-bloom');
    const result = fireShot({ weaponId: 'cluster-bloom', angle: 45, power: 0.7, engine: flat });
    const spawns = result.events.filter((event) => event.type === 'projectile-spawned');
    expect(spawns).toHaveLength(1);
    expect(spawns[0]?.type === 'projectile-spawned' && spawns[0].trigger).toBe('impact');
    expect(spawns[0]?.type === 'projectile-spawned' && spawns[0].childIds).toHaveLength(
      weapon.projectile.spawn?.count ?? 0,
    );
    // Parent + five bomblets: six detonations, each a distinct projectile.
    const explosions = result.events.filter((event) => event.type === 'explosion');
    expect(explosions).toHaveLength(6);
    expect(new Set(explosions.map((e) => (e.type === 'explosion' ? e.projectileId : 0))).size).toBe(
      6,
    );
  });

  it('scatters bomblets clear of a tank it struck before they can hit it', () => {
    // Isolate the original point-blank scatter fixture from long-range balance tuning.
    const scatter = arsenalWith(variant('cluster-bloom', { launch: { speed: 480 } }));
    const aim = findAim(
      'cluster-bloom',
      { ...flat, player1X: 220, player2X: 1060, weapons: scatter },
      (r) =>
        r.events.some((e) => e.type === 'explosion' && e.directHitTankId === 'player2') ? 1 : 0,
    );
    expect(aim.score).toBe(1);
    const bombletExplosions = aim.result.events.filter(
      (e) => e.type === 'explosion' && e.directHitTankId === undefined,
    );
    expect(bombletExplosions.length).toBeGreaterThan(0);
    // Direct-hit bonus belongs to the parent only; bomblets never claim it from point blank.
    expect(
      aim.result.events.filter((e) => e.type === 'explosion' && e.directHitTankId).length,
    ).toBe(1);
  });

  it('craters the terrain at the parent impact and at every bomblet that reaches the ground', () => {
    const result = fireShot({ weaponId: 'cluster-bloom', angle: 45, power: 0.7, engine: flat });
    expect(result.count('terrain-deformed')).toBeGreaterThanOrEqual(3);
  });
});

describe('apex split (Forking Star)', () => {
  it('splits into three warheads at the top of its arc, once', () => {
    const engine = new GameEngine({ wind: 0, ...flat });
    engine.selectWeapon('forking-star');
    engine.setAim(55, 0.8);
    engine.fire();
    let apexY = Infinity;
    let splitY: number | undefined;
    for (let tick = 0; tick < 2_000 && splitY === undefined; tick += 1) {
      const parent = engine.state.projectiles[0];
      if (parent !== undefined && parent.generation === 0) apexY = Math.min(apexY, parent.y);
      engine.update(TICK);
      const spawned = engine.drainEvents().find((event) => event.type === 'projectile-spawned');
      if (spawned !== undefined) splitY = engine.state.projectiles[0]?.y;
    }
    expect(splitY).toBeDefined();
    // The split happens within a few units of the true apex.
    expect(Math.abs((splitY ?? 0) - apexY)).toBeLessThan(4);
    expect(engine.state.projectiles).toHaveLength(3);
    expect(
      engine.state.projectiles.every((child) => child.generation === 1 && child.hasSpawned),
    ).toBe(true);

    const result = runUntilResolved(engine);
    expect(result.count('projectile-spawned')).toBe(0);
    expect(result.count('explosion')).toBe(3);
  });

  it('never splits if it hits the ground before reaching an apex', () => {
    const result = fireShot({
      weaponId: 'forking-star',
      angle: 5,
      power: 1,
      engine: { ...flat, player1X: 600, player2X: 1100 },
    });
    // A near-flat shot descends from launch: the apex is the muzzle, so it may split at once or
    // not at all, but it can never produce more than one generation of children.
    expect(result.count('projectile-spawned')).toBeLessThanOrEqual(1);
    expect(result.count('explosion')).toBeLessThanOrEqual(3);
  });

  it('supports timer-triggered splits through data alone', () => {
    const timed = variant('forking-star', {
      projectile: {
        spawn: {
          ...getWeapon('forking-star').projectile.spawn!,
          trigger: 'timer',
          delaySeconds: 0.5,
        },
      },
    });
    const engine = new GameEngine({ wind: 0, ...flat, weapons: arsenalWith(timed) });
    engine.selectWeapon('forking-star');
    engine.setAim(60, 0.9);
    engine.fire();
    let splitAt = -1;
    for (let tick = 1; tick <= 120 && splitAt < 0; tick += 1) {
      engine.update(TICK);
      if (engine.drainEvents().some((event) => event.type === 'projectile-spawned')) splitAt = tick;
    }
    expect(splitAt * TICK).toBeGreaterThanOrEqual(0.5 - TICK);
    expect(splitAt * TICK).toBeLessThanOrEqual(0.5 + 2 * TICK);
  });
});

describe('proximity airburst (Skyburst)', () => {
  it('detonates in the air at its configured altitude while descending', () => {
    const weapon = getWeapon('skyburst');
    const result = fireShot({ weaponId: 'skyburst', angle: 50, power: 0.8, engine: flat });
    const explosion = result.events.find((event) => event.type === 'explosion');
    expect(explosion?.type).toBe('explosion');
    if (explosion?.type !== 'explosion') return;
    const height = sampleMutableSurfaceY(result.engine.terrain, explosion.x) - explosion.y;
    // Height above the (now cratered) ground, within one substep of the fuse altitude.
    expect(height).toBeGreaterThan((weapon.projectile.airburst?.altitude ?? 0) - 6);
    expect(height).toBeLessThan(
      (weapon.projectile.airburst?.altitude ?? 0) + weapon.explosion.terrainRadius + 6,
    );
  });

  it('does not detonate while still climbing past a hill near the muzzle', () => {
    const hill = { terrainSurface: withBump(flatSurface(), 320, 50, 60) };
    const result = fireShot({ weaponId: 'skyburst', angle: 60, power: 0.9, engine: hill });
    const explosion = result.events.find((event) => event.type === 'explosion');
    expect(explosion?.type === 'explosion' && explosion.x).toBeGreaterThan(400);
  });

  it('hits a tank sitting in a crater that a ground burst would be shielded from', () => {
    const aim = findAim('skyburst', flat, (r) => r.damageTo('player2'));
    expect(aim.score).toBeGreaterThan(20);
  });
});

describe('timed airburst', () => {
  it('detonates after its configured time even with no ground nearby', () => {
    const timed = variant('skyburst', {
      projectile: { airburst: { afterSeconds: 0.5, armSeconds: 0 } },
    });
    const engine = new GameEngine({ wind: 0, ...flat, weapons: arsenalWith(timed) });
    engine.selectWeapon('skyburst');
    engine.setAim(80, 1);
    engine.fire();
    let detonatedAt = -1;
    for (let tick = 1; tick <= 120 && detonatedAt < 0; tick += 1) {
      engine.update(TICK);
      if (engine.drainEvents().some((event) => event.type === 'explosion')) detonatedAt = tick;
    }
    expect(detonatedAt * TICK).toBeCloseTo(0.5, 1);
  });
});

describe('drilling (Burrower)', () => {
  it('burrows to its configured depth below the impact surface, then erupts', () => {
    const weapon = getWeapon('burrower');
    const result = fireShot({ weaponId: 'burrower', angle: 45, power: 0.7, engine: flat });
    expect(result.count('projectile-drilling')).toBe(1);
    const explosion = result.events.find((event) => event.type === 'explosion');
    expect(explosion?.type === 'explosion' && explosion.y).toBeCloseTo(
      FLAT_Y + (weapon.projectile.drill?.depth ?? 0),
      0,
    );
    // The eruption leaves a deeper crater than the same blast at the surface would.
    const deepest = Math.max(...result.engine.terrain.surfaceY);
    expect(deepest).toBeGreaterThan(FLAT_Y + (weapon.projectile.drill?.depth ?? 0));
  });

  it('detonates on contact with a tank instead of drilling through armour', () => {
    const aim = findAim('burrower', flat, (r) =>
      r.events.some((e) => e.type === 'explosion' && e.directHitTankId === 'player2') ? 1 : 0,
    );
    expect(aim.score).toBe(1);
    expect(aim.result.count('projectile-drilling')).toBe(0);
  });

  it('cannot drill below the bottom of the world', () => {
    const shallow = { terrainSurface: flatSurface(WORLD_BOUNDS.height - 20) };
    const result = fireShot({ weaponId: 'burrower', angle: 45, power: 0.6, engine: shallow });
    const explosion = result.events.find((event) => event.type === 'explosion');
    expect(explosion?.type === 'explosion' && explosion.y).toBeLessThanOrEqual(WORLD_BOUNDS.height);
  });
});

describe('sticky delayed detonation (Time Capsule)', () => {
  it('sticks to terrain and waits for its fuse before detonating', () => {
    const fuse = getWeapon('time-capsule').projectile.fuseSeconds ?? 0;
    const engine = new GameEngine({ wind: 0, ...flat });
    engine.selectWeapon('time-capsule');
    engine.setAim(45, 0.6);
    engine.fire();
    let stuckTick = -1;
    let explodedTick = -1;
    for (let tick = 1; tick < 2_000 && explodedTick < 0; tick += 1) {
      engine.update(TICK);
      for (const event of engine.drainEvents()) {
        if (event.type === 'projectile-stuck') {
          stuckTick = tick;
          expect(event.target).toBe('terrain');
        }
        if (event.type === 'explosion') explodedTick = tick;
      }
      if (stuckTick > 0 && explodedTick < 0) {
        // While waiting, the turn must not pass and the charge must not move.
        expect(engine.state.phase).toBe('projectile');
      }
    }
    expect(stuckTick).toBeGreaterThan(0);
    expect((explodedTick - stuckTick) * TICK).toBeCloseTo(fuse, 1);
  });

  it('sticks to a tank it hits and rides along if that tank drops into a crater', () => {
    const aim = findAim('time-capsule', flat, (r) =>
      r.events.some((e) => e.type === 'projectile-stuck' && e.target === 'player2') ? 1 : 0,
    );
    expect(aim.score).toBe(1);

    const engine = new GameEngine({ wind: 0, ...flat });
    engine.selectWeapon('time-capsule');
    engine.setAim(aim.angle, aim.power);
    engine.fire();
    for (let tick = 0; tick < 2_000; tick += 1) {
      engine.update(TICK);
      if (engine.drainEvents().some((event) => event.type === 'projectile-stuck')) break;
    }
    const charge = engine.state.projectiles[0];
    expect(charge?.mode).toBe('stuck');
    // Dig the ground out from under the stuck target; the charge must follow the hull down.
    const target = engine.state.tanks[1];
    const before = charge!.y;
    for (let x = Math.floor(target.x - 80); x <= target.x + 80; x += 1)
      engine.terrain.surfaceY[x] = FLAT_Y + 60;
    engine.state.tanks[1] = { ...target, groundY: FLAT_Y + 60 };
    engine.update(TICK);
    expect(engine.state.projectiles[0]!.y - before).toBeCloseTo(60, 0);
    expect(
      distanceToTank(
        engine.state.tanks[1],
        engine.state.projectiles[0]!.x,
        engine.state.projectiles[0]!.y,
      ),
    ).toBeLessThan(10);

    const result = runUntilResolved(engine);
    expect(
      result.events.some((e) => e.type === 'explosion' && e.directHitTankId === 'player2'),
    ).toBe(true);
  });

  it('a ground charge drops with the surface when a crater opens beneath it', () => {
    const engine = new GameEngine({ wind: 0, ...flat });
    engine.selectWeapon('time-capsule');
    engine.setAim(45, 0.6);
    engine.fire();
    for (let tick = 0; tick < 2_000; tick += 1) {
      engine.update(TICK);
      if (engine.drainEvents().some((event) => event.type === 'projectile-stuck')) break;
    }
    const charge = engine.state.projectiles[0]!;
    const x = Math.round(charge.x);
    for (let column = x - 10; column <= x + 10; column += 1)
      engine.terrain.surfaceY[column] = FLAT_Y + 40;
    engine.update(TICK);
    expect(engine.state.projectiles[0]!.y).toBeGreaterThan(FLAT_Y + 30);
  });
});

describe('swept collision and terrain interaction', () => {
  it('fast projectiles are substepped so they cannot tunnel', () => {
    // 650 u/s for one 60 Hz tick is ~10.8 units: at least 4 collision samples per tick.
    expect(substepCount(650, 0, TICK)).toBeGreaterThanOrEqual(4);
    expect(substepCount(0, 0, TICK)).toBe(1);
  });

  it('a fast dart cannot pass through a thin wall', () => {
    const wall = flatSurface().map((y, x) => (x >= 640 && x <= 641 ? 200 : y));
    const result = fireShot({
      weaponId: 'needle-dart',
      angle: 10,
      power: 1,
      engine: { terrainSurface: wall },
    });
    const explosion = result.events.find((event) => event.type === 'explosion');
    expect(explosion?.type === 'explosion' && explosion.x).toBeLessThan(650);
  });

  it('every surface contact carves a crater at that point', () => {
    const result = fireShot({ weaponId: 'standard-shell', angle: 45, power: 0.7, engine: flat });
    const explosion = result.events.find((event) => event.type === 'explosion');
    expect(explosion?.type).toBe('explosion');
    if (explosion?.type !== 'explosion') return;
    expect(sampleMutableSurfaceY(result.engine.terrain, explosion.x)).toBeGreaterThan(FLAT_Y + 20);
  });

  it('later warheads collide with craters carved by earlier ones in the same shot', () => {
    const result = fireShot({ weaponId: 'cluster-bloom', angle: 45, power: 0.7, engine: flat });
    // Every bomblet explosion lies on or below the original surface: none floated over a crater.
    for (const event of result.events) {
      if (event.type === 'explosion') expect(event.y).toBeGreaterThan(FLAT_Y - 40);
    }
  });

  it('the trajectory preview matches the live flight up to first contact', () => {
    const engine = new GameEngine({ wind: 12, ...flat });
    engine.setAim(40, 0.7);
    const preview = predictTrajectory(
      engine.terrain,
      engine.activeTank,
      getWeapon('standard-shell'),
      engine.state.wind,
    );
    engine.fire();
    const live: { x: number; y: number }[] = [];
    while (engine.state.phase === 'projectile' && engine.state.projectiles.length > 0) {
      engine.update(TICK);
      const projectile = engine.state.projectiles[0];
      if (projectile !== undefined) live.push({ x: projectile.x, y: projectile.y });
    }
    for (let tick = 0; tick < Math.min(live.length, preview.length - 2); tick += 1) {
      expect(preview[tick + 1]!.x).toBeCloseTo(live[tick]!.x, 6);
      expect(preview[tick + 1]!.y).toBeCloseTo(live[tick]!.y, 6);
    }
  });
});

describe('bounded resolution: no infinite loops', () => {
  it('a projectile that never lands expires at its lifetime limit and the turn passes', () => {
    const floaty = variant('standard-shell', {
      projectile: { gravityScale: 0.1, windScale: 0, maxLifetimeSeconds: 1.5 },
    });
    const result = fireShot({
      weaponId: 'standard-shell',
      angle: 85,
      power: 1,
      engine: { ...flat, weapons: arsenalWith(floaty) },
    });
    const expiry = result.events.find((event) => event.type === 'projectile-expired');
    expect(expiry?.type === 'projectile-expired' && expiry.reason).toBe('lifetime');
    expect(result.engine.state.turnNumber).toBe(2);
    expect(result.ticks).toBeLessThan(200);
  });

  it('force-resolves a valid shot whose split children would outlive the shot timeout', () => {
    // Each child's lifetime starts at its own spawn, so a late timer split can legitimately
    // keep a shot alive past any single projectile's lifetime. The shot timeout is the backstop.
    const lingering = variant('forking-star', {
      launch: { speed: 400 },
      projectile: {
        gravityScale: 0.1,
        windScale: 0,
        maxLifetimeSeconds: 20,
        spawn: {
          ...getWeapon('forking-star').projectile.spawn!,
          trigger: 'timer',
          delaySeconds: 15,
          spreadDegrees: 0,
        },
      },
    });
    const engine = new GameEngine({ wind: 0, ...flat, weapons: arsenalWith(lingering) });
    engine.selectWeapon('forking-star');
    engine.setAim(85, 1);
    engine.fire();
    const result = runUntilResolved(engine, (COMBAT_LIMITS.maxShotSeconds + 5) * 60);
    const reasons = result.events.flatMap((event) =>
      event.type === 'projectile-expired' ? [event.reason] : [],
    );
    expect(result.count('projectile-spawned')).toBe(1);
    expect(reasons).toContain('shot-timeout');
    expect(engine.state.turnNumber).toBe(2);
    expect(result.ticks * TICK).toBeCloseTo(COMBAT_LIMITS.maxShotSeconds, 0);
  });

  it('projectiles leaving the battlefield are discarded and resolve the turn', () => {
    const result = fireShot({
      weaponId: 'needle-dart',
      angle: 20,
      power: 1,
      engine: { ...flat, player2X: 700 },
    });
    // Fires over the opponent and off the right edge.
    expect(result.engine.state.turnNumber).toBe(2);
    expect(result.engine.state.projectiles).toHaveLength(0);
  });

  it('caps the projectiles any single shot can create', () => {
    const greedy = variant('cluster-bloom', {
      launch: { projectileCount: 3 },
      projectile: { spawn: { ...getWeapon('cluster-bloom').projectile.spawn!, count: 12 } },
    });
    // 3 × (1 + 12) = 39 > 32: the validator must reject this definition outright...
    expect(() => new GameEngine({ weapons: arsenalWith(greedy) })).toThrow(/limit is 32/);
  });

  it('a shot never takes more than the bounded number of ticks for any catalog weapon', () => {
    for (const id of [
      'ricochet-orb',
      'cluster-bloom',
      'forking-star',
      'time-capsule',
      'burrower',
    ]) {
      for (const angle of [15, 45, 80]) {
        const result = fireShot({ weaponId: id, angle, power: 1, engine: flat });
        expect(result.engine.state.turnNumber).toBe(2);
        expect(result.ticks).toBeLessThan(COMBAT_LIMITS.maxShotSeconds * 60 + 60);
      }
    }
  });
});
