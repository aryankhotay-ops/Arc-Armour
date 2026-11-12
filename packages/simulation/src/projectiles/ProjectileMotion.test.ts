import { describe, expect, it } from 'vitest';
import { WEAPON_CATALOG } from '@artillery/content';
import { GameEngine } from '../match/GameEngine';
import { integrateBallistic, substepCount } from './Ballistics';
import { flatSurface, TICK } from '../testing/harness';

// Rendering observations must be strictly observational, for every weapon and behaviour.
describe('optional projectile motion observations', () => {
  it.each(WEAPON_CATALOG.map((w) => w.id))(
    '%s is identical with capture enabled or disabled',
    (weaponId) => {
      const plain = new GameEngine({ wind: 12 });
      const observed = new GameEngine({ wind: 12, captureProjectileMotion: true });
      for (const engine of [plain, observed]) {
        engine.selectWeapon(weaponId);
        engine.setAim(40, 0.85);
        engine.fire();
      }
      expect(observed.drainEvents()).toEqual(plain.drainEvents());
      for (
        let tick = 0;
        tick < 1800 && plain.state.turnNumber === 1 && plain.state.phase !== 'game-over';
        tick++
      ) {
        plain.update(TICK);
        observed.update(TICK);
        expect(observed.drainEvents()).toEqual(plain.drainEvents());
        observed.drainProjectileMotion();
      }
      expect(observed.state).toEqual(plain.state);
      expect(observed.terrain).toEqual(plain.terrain);
      expect(plain.drainProjectileMotion()).toEqual([]);
    },
  );

  it('records the actual launch and every swept integrator position, not a decorative arc', () => {
    const engine = new GameEngine({ wind: 17, captureProjectileMotion: true });
    engine.fire();
    const projectile = engine.state.projectiles[0]!;
    const copy = { ...projectile };
    expect(engine.drainProjectileMotion()).toEqual([
      {
        id: projectile.id,
        weaponId: projectile.weaponId,
        x: copy.x,
        y: copy.y,
        ageSeconds: 0,
        mode: 'flying',
      },
    ]);
    const count = substepCount(copy.velocityX, copy.velocityY, TICK);
    const expected = [];
    for (let i = 1; i <= count; i++) {
      integrateBallistic(copy, 17, TICK / count);
      expected.push({ x: copy.x, y: copy.y, age: (TICK * i) / count });
    }
    engine.update(TICK);
    const samples = engine.drainProjectileMotion();
    expected.forEach((point, i) => {
      expect(samples[i]!.x).toBe(point.x);
      expect(samples[i]!.y).toBe(point.y);
      expect(samples[i]!.ageSeconds).toBeCloseTo(point.age, 12);
    });
    expect(samples[samples.length - 1]!.x).toBe(projectile.x);
    expect(engine.drainProjectileMotion()).toEqual([]);
  });

  it('bounds unconsumed observations and returns detached records', () => {
    const engine = new GameEngine({ captureProjectileMotion: true });
    for (let shot = 0; shot < 20; shot++) {
      engine.fire();
      for (
        let tick = 0;
        tick < 1200 && !engine.acceptsInput && engine.state.phase !== 'game-over';
        tick++
      )
        engine.update(TICK);
      if (engine.state.phase === 'game-over') break;
    }
    const samples = engine.drainProjectileMotion();
    expect(samples.length).toBeLessThanOrEqual(4096);
    const saved = JSON.stringify(samples);
    engine.update(TICK);
    expect(JSON.stringify(samples)).toBe(saved);
  });

  it('emits a single tank-destroyed event at the real final tank position', () => {
    const engine = new GameEngine({
      captureProjectileMotion: true,
      startingHealth: 1,
      terrainSurface: flatSurface(),
      player1X: 200,
      player2X: 380,
      wind: 0,
    });
    engine.setAim(5, 0.4);
    engine.fire();
    const events = engine.drainEvents();
    for (let tick = 0; tick < 900 && engine.state.phase !== 'game-over'; tick++) {
      engine.update(TICK);
      events.push(...engine.drainEvents());
    }
    const destroyed = events.filter((e) => e.type === 'tank-destroyed');
    expect(destroyed).toHaveLength(1);
    const event = destroyed[0]!;
    if (event.type !== 'tank-destroyed') throw new Error('expected destruction');
    const tank = engine.tank(event.tankId);
    expect(event.x).toBe(tank.x);
    expect(event.y).toBe(tank.groundY);
    expect(tank.health).toBe(0);
    for (let tick = 0; tick < 120; tick++) engine.update(TICK);
    expect(engine.drainEvents().filter((e) => e.type === 'tank-destroyed')).toHaveLength(0);
  });
});
