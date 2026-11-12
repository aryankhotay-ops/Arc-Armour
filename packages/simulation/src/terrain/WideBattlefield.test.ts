import { describe, expect, it } from 'vitest';
import { GameEngine } from '../match/GameEngine';
import { WORLD_BOUNDS } from '../config/SimulationConfig';
import { createBattlefieldTerrain, TANK_SPAWN_X } from './TerrainProfile';
import { findAim, fireShot } from '../testing/harness';
import { muzzlePosition } from '../tanks/TankGeometry';
import { GRAVITY } from '../config/SimulationConfig';

// User feedback: small targets, meaningful separation, intervening cover and skillful
// long-range shots. Enlarging only visuals or making the opponent unreachable is not enough.
describe('wide artillery battlefield', () => {
  it('more than doubles target separation relative to the unchanged tank geometry', () => {
    expect(WORLD_BOUNDS.width).toBe(3200);
    expect(WORLD_BOUNDS.height).toBe(1800);
    expect(TANK_SPAWN_X.player2 - TANK_SPAWN_X.player1).toBe(2688);
    expect((TANK_SPAWN_X.player2 - TANK_SPAWN_X.player1) / 106).toBeGreaterThan(25);
  });

  it('places actual varied high ground between two safe, level spawn pads on a ridge-family map', () => {
    const terrain = createBattlefieldTerrain(4);
    const engine = new GameEngine({ terrainSeed: 4 });
    for (const tank of engine.state.tanks) {
      expect(tank.hullAngle).toBe(0);
      expect(tank.groundY).toBeLessThan(WORLD_BOUNDS.height * 0.84);
      expect(tank.groundY).toBeGreaterThan(WORLD_BOUNDS.height * 0.45);
    }
    const ridge = Math.min(...terrain.surfaceY.slice(640, 2560));
    expect(ridge).toBeLessThan(Math.min(...engine.state.tanks.map((t) => t.groundY)) - 100);
  });

  it('does not hand the player an opponent hit at the default angle/power', () => {
    for (const wind of [-30, 0, 30]) {
      const result = fireShot({
        weaponId: 'standard-shell',
        angle: 45,
        power: 0.75,
        engine: { wind },
      });
      expect(result.damageTo('player2')).toBe(0);
      expect(result.engine.state.turnNumber).toBe(2);
    }
  });

  it('still allows both players to hit across the real ridge with deliberate aiming', () => {
    const hit = findAim('standard-shell', { wind: 0 }, (r) => r.damageTo('player2'));
    expect(hit.score).toBeGreaterThanOrEqual(20);
    expect(hit.power).toBeGreaterThan(0.8);
    // Find a reverse shot on the same non-mirrored terrain: equal reach, no decorative hill.
    let best = 0;
    for (const angle of [35, 40, 45, 50, 55, 60]) {
      for (const power of [0.85, 0.9, 0.95, 1]) {
        const engine = new GameEngine({ wind: 0 });
        engine.state.activePlayerId = 'player2';
        engine.setAim(angle, power);
        engine.fire();
        for (let tick = 0; tick < 1200 && engine.state.turnNumber === 1; tick++)
          engine.update(1 / 60);
        best = Math.max(best, 100 - engine.tank('player1').health);
      }
    }
    expect(best).toBeGreaterThanOrEqual(20);
  });

  it('blocks flat cross-map fire on the actual ridge', () => {
    const result = fireShot({
      weaponId: 'standard-shell',
      angle: 5,
      power: 1,
      engine: { wind: 0 },
    });
    expect(result.damageTo('player2')).toBe(0);
    const impact = result.events.find((e) => e.type === 'explosion');
    expect(impact?.type === 'explosion' && impact.x).toBeLessThan(TANK_SPAWN_X.player2 - 300);
  });

  it('provides real standard-shell firing solutions for BOTH players across 24 varied seeded maps', () => {
    for (let terrainSeed = 0; terrainSeed < 24; terrainSeed++) {
      for (const player of ['player1', 'player2'] as const) {
        let best = 0;
        for (const angle of [40, 45, 50, 55, 60]) {
          const setup = new GameEngine({ terrainSeed, wind: 0 });
          setup.state.activePlayerId = player;
          const start = muzzlePosition(setup.activeTank, angle);
          const target = setup.inactiveTank;
          const dx = Math.abs(target.x - start.x);
          const rad = (angle * Math.PI) / 180;
          const required = Math.sqrt(
            (GRAVITY * dx * dx) /
              (2 * Math.cos(rad) ** 2 * (dx * Math.tan(rad) + target.groundY - 24 - start.y)),
          );
          const estimate = required / setup.selectedWeapon.launch.speed;
          for (const offset of [-0.003, 0, 0.003]) {
            const power = estimate + offset;
            if (power > 1 || power < 0.2) continue;
            const engine = new GameEngine({ terrainSeed, wind: 0 });
            engine.state.activePlayerId = player;
            engine.setAim(angle, power);
            engine.fire();
            for (let tick = 0; tick < 1200 && engine.state.turnNumber === 1; tick++)
              engine.update(1 / 60);
            best = Math.max(
              best,
              100 - engine.tank(player === 'player1' ? 'player2' : 'player1').health,
            );
          }
          if (best >= 20) break;
        }
        expect(best, `terrain seed ${terrainSeed}, ${player}`).toBeGreaterThanOrEqual(20);
      }
    }
  });
});
