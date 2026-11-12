import { WORLD_BOUNDS } from '../config/SimulationConfig';
import { createBattlefieldTerrain } from './TerrainProfile';

export interface MutableTerrainState {
  coatings?: { minX: number; maxX: number; kind: 'rubber' | 'glue' }[];
  readonly width: number;
  readonly worldHeight: number;
  readonly surfaceY: number[];
  revision: number;
}

export interface CraterResult {
  readonly changed: boolean;
  readonly minX: number;
  readonly maxX: number;
}

export const createMutableTerrain = (seed = 0): MutableTerrainState => {
  const profile = createBattlefieldTerrain(seed);
  return {
    width: profile.width,
    worldHeight: profile.worldHeight,
    surfaceY: [...profile.surfaceY],
    revision: 0,
  };
};

export const sampleMutableSurfaceY = (terrain: MutableTerrainState, x: number): number => {
  const sampleX = Math.min(terrain.width, Math.max(0, x));
  const left = Math.floor(sampleX);
  const right = Math.min(terrain.width, left + 1);
  const fraction = sampleX - left;
  const leftY = terrain.surfaceY[left] ?? terrain.worldHeight;
  const rightY = terrain.surfaceY[right] ?? leftY;
  return leftY + (rightY - leftY) * fraction;
};

export const sampleSurfaceAngle = (
  terrain: MutableTerrainState,
  x: number,
  halfWidth: number,
): number => {
  const leftY = sampleMutableSurfaceY(terrain, x - halfWidth);
  const rightY = sampleMutableSurfaceY(terrain, x + halfWidth);
  return Math.atan2(rightY - leftY, halfWidth * 2);
};

/** Height-field crater removal: the visible surface moves down to the lower circular arc. */
export const carveCrater = (
  terrain: MutableTerrainState,
  centerX: number,
  centerY: number,
  radius: number,
): CraterResult => {
  if (radius <= 0) return { changed: false, minX: 0, maxX: 0 };
  const minX = Math.max(0, Math.floor(centerX - radius));
  const maxX = Math.min(terrain.width, Math.ceil(centerX + radius));
  let changed = false;

  for (let x = minX; x <= maxX; x += 1) {
    const horizontal = x - centerX;
    const inside = radius * radius - horizontal * horizontal;
    if (inside < 0) continue;

    const craterFloor = Math.min(WORLD_BOUNDS.height - 8, centerY + Math.sqrt(inside) * 0.9);
    const current = terrain.surfaceY[x] ?? terrain.worldHeight;
    if (craterFloor > current) {
      terrain.surfaceY[x] = craterFloor;
      changed = true;
    }
  }

  if (changed) terrain.revision += 1;
  return Object.freeze({ changed, minX, maxX });
};

/** Real additive/subtractive heightfield editing for the approved Original/Deluxe tools.
 * No enclosed cavity/burial simulation is claimed: displaced tanks settle on the new top.
 */
export function editTerrainProfile(
  terrain: MutableTerrainState,
  x: number,
  y: number,
  width: number,
  depth: number,
  operation: 'add' | 'cut',
  shape: 'mound' | 'wall' | 'v' | 'trench',
): CraterResult {
  const half = width / 2,
    minX = Math.max(0, Math.floor(x - half)),
    maxX = Math.min(terrain.width, Math.ceil(x + half));
  let changed = false;
  for (let i = minX; i <= maxX; i++) {
    const t = Math.abs(i - x) / half;
    const weight =
      shape === 'wall'
        ? 1
        : shape === 'v'
          ? Math.max(0.12, t)
          : shape === 'trench'
            ? 1 - t * 0.15
            : Math.sqrt(Math.max(0, 1 - t * t));
    const value = Math.max(
      110,
      Math.min(terrain.worldHeight - 8, y + (operation === 'add' ? -1 : 1) * depth * weight),
    );
    const old = terrain.surfaceY[i]!;
    const next = operation === 'add' ? Math.min(old, value) : Math.max(old, value);
    if (Math.abs(next - old) > 0.001) {
      terrain.surfaceY[i] = next;
      changed = true;
    }
  }
  if (changed) terrain.revision++;
  return { changed, minX, maxX };
}
export function coatTerrain(
  terrain: MutableTerrainState,
  x: number,
  kind: 'rubber' | 'glue',
  width = 260,
): CraterResult {
  const minX = Math.max(0, x - width / 2),
    maxX = Math.min(terrain.width, x + width / 2);
  const coatings = terrain.coatings ?? [];
  coatings.push({ minX, maxX, kind });
  terrain.coatings = coatings.slice(-64);
  terrain.revision++;
  return { changed: true, minX, maxX };
}
export function terrainCoating(
  terrain: MutableTerrainState,
  x: number,
): 'rubber' | 'glue' | undefined {
  return terrain.coatings
    ?.slice()
    .reverse()
    .find((c) => x >= c.minX && x <= c.maxX)?.kind;
}
