import type { TankPlacement } from './TankPlacement';
import { tankModel } from '@artillery/content';

// Shared tank geometry. Collision, the firing muzzle and the rendered barrel all derive from
// these constants, so the projectile always leaves the visible barrel tip, even on a slope.

/** Turret pivot in hull-local space; x is mirrored by `facing`. Origin = track contact midpoint. */
export const TURRET_PIVOT_LOCAL = Object.freeze({ x: 3, y: -56 });
export const BARREL_LENGTH = 72;

/** Hull collision capsule in hull-local space: a horizontal segment swept by a radius. */
export const HULL_CAPSULE_LOCAL = Object.freeze({ halfLength: 34, centerY: -24, radius: 26 });

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Capsule {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly radius: number;
}

type Pose = Pick<TankPlacement, 'x' | 'groundY' | 'hullAngle' | 'facing' | 'modelId'>;

export const localToWorld = (tank: Pose, localX: number, localY: number): Point => {
  const cos = Math.cos(tank.hullAngle);
  const sin = Math.sin(tank.hullAngle);
  return {
    x: tank.x + localX * cos - localY * sin,
    y: tank.groundY + localX * sin + localY * cos,
  };
};

export const worldToLocal = (tank: Pose, worldX: number, worldY: number): Point => {
  const cos = Math.cos(tank.hullAngle);
  const sin = Math.sin(tank.hullAngle);
  const dx = worldX - tank.x;
  const dy = worldY - tank.groundY;
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
};

export const turretPivot = (tank: Pose): Point => {
  const g = tankModel(tank.modelId).geometry;
  return localToWorld(tank, g.pivotX * tank.facing, g.pivotY);
};

/** World-space barrel direction in radians for an elevation above the tank's forward horizon. */
export const aimDirection = (tank: Pose, angleDegrees: number): number => {
  const elevation = (angleDegrees * Math.PI) / 180;
  return tank.facing === 1 ? tank.hullAngle - elevation : tank.hullAngle + Math.PI + elevation;
};

export const muzzlePosition = (tank: Pose, angleDegrees: number): Point => {
  const pivot = turretPivot(tank);
  const direction = aimDirection(tank, angleDegrees);
  const length = tankModel(tank.modelId).geometry.barrelLength;
  return {
    x: pivot.x + Math.cos(direction) * length,
    y: pivot.y + Math.sin(direction) * length,
  };
};

export const hullCapsule = (tank: Pose): Capsule => {
  const g = tankModel(tank.modelId).geometry;
  const a = localToWorld(tank, -g.hullHalfLength, g.hullCenterY);
  const b = localToWorld(tank, g.hullHalfLength, g.hullCenterY);
  return { ax: a.x, ay: a.y, bx: b.x, by: b.y, radius: g.hullRadius };
};

/** Distance from a point to a capsule's surface; 0 when the point is inside. */
export const distanceToCapsule = (capsule: Capsule, x: number, y: number): number => {
  const sx = capsule.bx - capsule.ax;
  const sy = capsule.by - capsule.ay;
  const lengthSquared = sx * sx + sy * sy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(1, Math.max(0, ((x - capsule.ax) * sx + (y - capsule.ay) * sy) / lengthSquared));
  const closestX = capsule.ax + sx * t;
  const closestY = capsule.ay + sy * t;
  return Math.max(0, Math.hypot(x - closestX, y - closestY) - capsule.radius);
};

export const distanceToTank = (tank: Pose, x: number, y: number): number =>
  distanceToCapsule(hullCapsule(tank), x, y);
