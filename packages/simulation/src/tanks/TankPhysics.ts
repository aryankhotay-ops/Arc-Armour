import { WORLD_BOUNDS } from '../config/SimulationConfig';
import type { TankState } from '../state/GameState';
import type { MutableTerrainState } from '../terrain/TerrainState';
import { TANK_TRACK_HALF_WIDTH, placeTankOnTerrain } from './TankPlacement';
import { tankModel } from '@artillery/content';

export const TANK_MIN_X = TANK_TRACK_HALF_WIDTH + 12;
export const TANK_MAX_X = WORLD_BOUNDS.width - TANK_TRACK_HALF_WIDTH - 12;
export const TANK_MIN_SEPARATION = 118;
export const TANK_MAX_SLOPE_RADIANS = (28 * Math.PI) / 180;
// User feedback (2026-11-10): 110 units was barely one 106-unit chassis width on the
// 3200-wide field. Movement stays deliberately limited (repositioning, not driving across
// the map), but 320 ≈ three chassis widths is enough to crest a ridge or escape a crater.
export const TURN_MOVEMENT_ALLOWANCE = 320;

export const settleTank = (tank: TankState, terrain: MutableTerrainState): TankState => ({
  ...tank,
  ...placeTankOnTerrain(terrain, tank.playerId, tank.x, tank.modelId),
});

export const moveTankAlongTerrain = (
  tank: TankState,
  otherTank: TankState,
  terrain: MutableTerrainState,
  requestedDeltaX: number,
): TankState => {
  if (tank.movementRemaining <= 0 || requestedDeltaX === 0) return tank;

  const signedDistance =
    Math.sign(requestedDeltaX) * Math.min(Math.abs(requestedDeltaX), tank.movementRemaining);
  const g = tankModel(tank.modelId).geometry;
  const other = tankModel(otherTank.modelId).geometry;
  const minimumX =
    g.trackHalfWidth === TANK_TRACK_HALF_WIDTH
      ? TANK_MIN_X
      : Math.max(g.trackHalfWidth + 12, g.hullHalfLength + g.hullRadius);
  const maximumX = WORLD_BOUNDS.width - minimumX;
  const separation = Math.max(
    TANK_MIN_SEPARATION,
    g.hullHalfLength + g.hullRadius + other.hullHalfLength + other.hullRadius + 4,
  );
  let candidateX = Math.min(maximumX, Math.max(minimumX, tank.x + signedDistance));

  // A move cannot pass through the opposing tank, even when a caller requests a large step.
  if (tank.x < otherTank.x && candidateX > otherTank.x - separation) {
    candidateX = otherTank.x - separation;
  } else if (tank.x > otherTank.x && candidateX < otherTank.x + separation) {
    candidateX = otherTank.x + separation;
  }
  candidateX = Math.min(maximumX, Math.max(minimumX, candidateX));

  const placement = placeTankOnTerrain(terrain, tank.playerId, candidateX, tank.modelId);
  if (Math.abs(placement.hullAngle) > TANK_MAX_SLOPE_RADIANS) return tank;

  const distanceMoved = Math.abs(candidateX - tank.x);
  if (distanceMoved < 0.001) return tank;

  return {
    ...tank,
    ...placement,
    movementRemaining: Math.max(0, tank.movementRemaining - distanceMoved),
  };
};
