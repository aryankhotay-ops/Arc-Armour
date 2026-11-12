import { describe, expect, it } from 'vitest';
import { TANK_MODELS, tankModel } from '@artillery/content';
import { GameEngine } from '../match/GameEngine';
import { muzzlePosition, turretPivot, aimDirection, hullCapsule } from './TankGeometry';
import { moveTankAlongTerrain, TANK_MIN_SEPARATION } from './TankPhysics';
import { WORLD_BOUNDS } from '../config/SimulationConfig';

const flat = Array.from({ length: WORLD_BOUNDS.width + 1 }, () => 1300);

describe('model-specific tank contacts, collision and articulated gun', () => {
  it('retains the two original tanks and all twelve reference-sheet choices without equalizing proportions', () => {
    expect(TANK_MODELS).toHaveLength(14);
    expect(new Set(TANK_MODELS.map((m) => m.id)).size).toBe(14);
    expect(tankModel('renault-ft17').geometry.trackHalfWidth).toBeLessThan(
      tankModel('mark-v').geometry.trackHalfWidth * 0.6,
    );
    expect(tankModel('strv-103').geometry.pivotY).toBeGreaterThan(
      tankModel('renault-ft17').geometry.pivotY,
    );
  });
  for (const m of TANK_MODELS) {
    it(`${m.name}: both facings launch at the rotated visible gun length, retain model through movement and resolve normally`, () => {
      const engine = new GameEngine({
        tankModels: [m.id, m.id],
        terrainSeed: 4,
        wind: 0,
        terrainSurface: flat,
      });
      for (const player of ['player1', 'player2'] as const) {
        engine.state.activePlayerId = player;
        for (const angle of [5, 25, 55, 85]) {
          engine.setAim(angle, 0.6);
          const tank = engine.activeTank;
          const pivot = turretPivot(tank),
            tip = muzzlePosition(tank, angle);
          expect(Math.hypot(tip.x - pivot.x, tip.y - pivot.y)).toBeCloseTo(
            m.geometry.barrelLength,
            10,
          );
          const direction = aimDirection(tank, angle);
          expect(tip.x).toBeCloseTo(pivot.x + Math.cos(direction) * m.geometry.barrelLength, 10);
          expect(tip.y).toBeCloseTo(pivot.y + Math.sin(direction) * m.geometry.barrelLength, 10);
          expect(hullCapsule(tank).radius).toBe(m.geometry.hullRadius);
        }
        const before = engine.activeTank;
        engine.moveActiveTank(player === 'player1' ? 30 : -30);
        expect(engine.activeTank.modelId).toBe(m.id);
        expect(engine.activeTank.x).not.toBe(before.x);
      }
      engine.state.activePlayerId = 'player1';
      engine.setAim(45, 0.75);
      const launch = muzzlePosition(engine.activeTank, 45);
      expect(engine.fire()).toBe(true);
      expect(engine.state.projectiles[0]!.x).toBe(launch.x);
      expect(engine.state.projectiles[0]!.y).toBe(launch.y);
      for (let tick = 0; tick < 1800 && engine.state.turnNumber === 1; tick++)
        engine.update(1 / 60);
      expect(engine.state.turnNumber).toBe(2);
      expect(engine.state.tanks.map((t) => t.modelId)).toEqual([m.id, m.id]);
    });
  }
  it('keeps wide custom hulls inside the world and prevents impossible overlapping placement', () => {
    const engine = new GameEngine({ tankModels: ['mark-v', 'churchill'], terrainSurface: flat });
    const left = moveTankAlongTerrain(
      { ...engine.activeTank, movementRemaining: 10000 },
      engine.inactiveTank,
      engine.terrain,
      -10000,
    );
    expect(left.x).toBeGreaterThanOrEqual(
      tankModel('mark-v').geometry.hullHalfLength + tankModel('mark-v').geometry.hullRadius,
    );
    const close = moveTankAlongTerrain(
      { ...engine.activeTank, movementRemaining: 10000 },
      engine.inactiveTank,
      engine.terrain,
      10000,
    );
    const a = tankModel('mark-v').geometry,
      b = tankModel('churchill').geometry;
    expect(engine.inactiveTank.x - close.x).toBeGreaterThanOrEqual(
      Math.max(
        TANK_MIN_SEPARATION,
        a.hullHalfLength + a.hullRadius + b.hullHalfLength + b.hullRadius + 4,
      ),
    );
  });
  it('pointer aiming compensates chassis slope for both facings and model pivots', () => {
    const surface = Array.from({ length: WORLD_BOUNDS.width + 1 }, (_v, x) => 1100 + x * 0.1);
    const engine = new GameEngine({
      tankModels: ['strv-103', 'renault-ft17'],
      terrainSurface: surface,
    });
    for (const player of ['player1', 'player2'] as const) {
      engine.state.activePlayerId = player;
      const tank = engine.activeTank;
      const pivot = turretPivot(tank);
      const desired = aimDirection(tank, 37);
      engine.aimAtPoint(pivot.x + Math.cos(desired) * 600, pivot.y + Math.sin(desired) * 600);
      expect(engine.activeTank.aim.angleDegrees).toBeCloseTo(37, 8);
    }
  });
});
