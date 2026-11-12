import { sampleSurfaceY, type TerrainProfile } from '../terrain/TerrainProfile';
import { tankModel, type TankModelId } from '@artillery/content';

export const TANK_TRACK_HALF_WIDTH = 46;

export type PlayerId = 'player1' | 'player2';

export interface TankPlacement {
  readonly modelId?: TankModelId;
  readonly playerId: PlayerId;
  readonly x: number;
  /** World Y at the midpoint of the lower track contact line. */
  readonly groundY: number;
  /** Clockwise radians in the screen-space coordinate system (positive Y downward). */
  readonly hullAngle: number;
  readonly leftContactY: number;
  readonly rightContactY: number;
  readonly facing: -1 | 1;
}

/** Places a tank from two track contact samples, so it cannot float or sink at either end. */
export const placeTankOnTerrain = (
  terrain: TerrainProfile,
  playerId: PlayerId,
  x: number,
  modelId: TankModelId = playerId === 'player1' ? 'marigold' : 'cobalt',
): TankPlacement => {
  const halfWidth = tankModel(modelId).geometry.trackHalfWidth;
  const leftContactY = sampleSurfaceY(terrain, x - halfWidth);
  const rightContactY = sampleSurfaceY(terrain, x + halfWidth);
  const hullAngle = Math.atan2(rightContactY - leftContactY, halfWidth * 2);

  return Object.freeze({
    playerId,
    modelId,
    x,
    groundY: (leftContactY + rightContactY) / 2,
    hullAngle,
    leftContactY,
    rightContactY,
    facing: playerId === 'player1' ? 1 : -1,
  });
};
