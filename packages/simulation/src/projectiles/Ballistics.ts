import type { WeaponDefinition } from '@artillery/content';

import {
  COMBAT_LIMITS,
  GRAVITY,
  SIMULATION_STEP_SECONDS,
  WORLD_BOUNDS,
} from '../config/SimulationConfig';
import type { TankState } from '../state/GameState';
import { aimDirection, muzzlePosition, type Point } from '../tanks/TankGeometry';
import { sampleMutableSurfaceY, type MutableTerrainState } from '../terrain/TerrainState';

export interface BallisticBody {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  gravityScale: number;
  windScale: number;
}

const MAX_SUBSTEPS = 64;

/**
 * Substeps needed so a body moves at most `sweepSampleSpacing` world units between collision
 * samples. Fast projectiles therefore cannot tunnel through tanks or thin terrain.
 */
export const substepCount = (velocityX: number, velocityY: number, dt: number): number =>
  Math.min(
    MAX_SUBSTEPS,
    Math.max(
      1,
      Math.ceil((Math.hypot(velocityX, velocityY) * dt) / COMBAT_LIMITS.sweepSampleSpacing),
    ),
  );

/** Semi-implicit Euler step shared by the live simulation and the aiming preview. */
export const integrateBallistic = (body: BallisticBody, wind: number, dt: number): void => {
  body.velocityX += wind * body.windScale * dt;
  body.velocityY += GRAVITY * body.gravityScale * dt;
  body.x += body.velocityX * dt;
  body.y += body.velocityY * dt;
};

export const isInsideTerrainColumn = (terrain: MutableTerrainState, x: number): boolean =>
  x >= 0 && x <= terrain.width;

/**
 * Predicts the centre warhead's flight until its first terrain contact, using exactly the same
 * tick/substep integration as the engine. Previews never affect official outcomes.
 */
export const predictTrajectory = (
  terrain: MutableTerrainState,
  tank: TankState,
  weapon: WeaponDefinition,
  wind: number,
  maxSeconds = 4,
): Point[] => {
  const start = muzzlePosition(tank, tank.aim.angleDegrees);
  const direction = aimDirection(tank, tank.aim.angleDegrees);
  const speed =
    weapon.launch.speed * tank.aim.power * (weapon.projectile.utility === 'jump' ? 0.25 : 1);
  const body: BallisticBody = {
    x: start.x,
    y: start.y,
    velocityX: Math.cos(direction) * speed,
    velocityY: Math.sin(direction) * speed,
    gravityScale: weapon.projectile.gravityScale,
    windScale: weapon.projectile.windScale,
  };
  const points: Point[] = [{ x: body.x, y: body.y }];
  const ticks = Math.ceil(maxSeconds / SIMULATION_STEP_SECONDS);

  for (let tick = 0; tick < ticks; tick += 1) {
    const steps = substepCount(body.velocityX, body.velocityY, SIMULATION_STEP_SECONDS);
    const dt = SIMULATION_STEP_SECONDS / steps;
    for (let step = 0; step < steps; step += 1) {
      integrateBallistic(body, wind, dt);
      if (
        isInsideTerrainColumn(terrain, body.x) &&
        body.y + weapon.projectile.radius >= sampleMutableSurfaceY(terrain, body.x)
      ) {
        points.push({ x: body.x, y: body.y });
        return points;
      }
      if (body.x < 0 || body.x > WORLD_BOUNDS.width || body.y > WORLD_BOUNDS.height) {
        return points;
      }
    }
    points.push({ x: body.x, y: body.y });
  }
  return points;
};
