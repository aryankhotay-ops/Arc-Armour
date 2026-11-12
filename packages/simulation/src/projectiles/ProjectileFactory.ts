import type { SpawnTrigger, WeaponDefinition } from '@artillery/content';

import type { ShotLedger } from '../combat/ShotLedger';
import { COMBAT_LIMITS } from '../config/SimulationConfig';
import type { ProjectileState, TankState } from '../state/GameState';
import { aimDirection, muzzlePosition, type Point } from '../tanks/TankGeometry';
import type { PlayerId } from '../tanks/TankPlacement';

/** Seconds a launched warhead ignores its own tank, so it cannot detonate inside the barrel. */
export const MUZZLE_ARM_SECONDS = 0.2;
/** Seconds impact bomblets ignore the tank their parent struck, so they scatter first. */
export const BOMBLET_ARM_SECONDS = 0.25;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export interface WarheadInit {
  readonly id: number;
  readonly shotId: number;
  readonly ownerId: PlayerId;
  readonly weapon: WeaponDefinition;
  readonly generation: number;
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly radius: number;
  readonly ignoredTankId: PlayerId | undefined;
  readonly tankArmSeconds: number;
  readonly damageScale: number;
  readonly blastScale: number;
  readonly terrainScale: number;
}

/**
 * Generation 0 warheads carry the weapon's behaviours. Spawned children (generation >= 1) are
 * plain impact warheads: no bounces, fuse, drill, airburst, or further spawning.
 */
export const createWarhead = (init: WarheadInit): ProjectileState => {
  const carriesBehaviours = init.generation === 0 || init.weapon.projectile.childEffects === true;
  return {
    id: init.id,
    shotId: init.shotId,
    ownerId: init.ownerId,
    weaponId: init.weapon.id,
    generation: init.generation,
    x: init.x,
    y: init.y,
    previousX: init.x,
    previousY: init.y,
    velocityX: init.velocityX,
    velocityY: init.velocityY,
    ageSeconds: 0,
    radius: init.radius,
    gravityScale: init.weapon.projectile.gravityScale,
    windScale: init.weapon.projectile.windScale,
    bouncesRemaining: carriesBehaviours ? (init.weapon.projectile.bounce?.count ?? 0) : 0,
    hasSpawned: !carriesBehaviours || init.generation >= COMBAT_LIMITS.maxSpawnGeneration,
    mode: 'flying',
    fuseRemaining: undefined,
    struckTankId: undefined,
    stuckLocalX: 0,
    stuckLocalY: 0,
    drillTargetY: undefined,
    ignoredTankId: init.ignoredTankId,
    tankArmSeconds: init.tankArmSeconds,
    damageScale: init.damageScale,
    blastScale: init.blastScale,
    terrainScale: init.terrainScale,
  };
};

/** Evenly fans `count` directions across `spreadDegrees`, centred on `centre` (radians). */
export const fanDirections = (centre: number, count: number, spreadDegrees: number): number[] => {
  if (count <= 1) return [centre];
  const step = toRadians(spreadDegrees) / (count - 1);
  return Array.from({ length: count }, (_, index) => centre + (index - (count - 1) / 2) * step);
};

/** Builds the launched warheads for one shot. Count is bounded by the shot ledger. */
export const launchVolley = (
  shotId: number,
  owner: TankState,
  weapon: WeaponDefinition,
  ledger: ShotLedger,
  allocateId: () => number,
): ProjectileState[] => {
  const granted = ledger.reserveProjectiles(weapon.launch.projectileCount);
  const centre = aimDirection(owner, owner.aim.angleDegrees);
  const muzzle = muzzlePosition(owner, owner.aim.angleDegrees);
  const speed = weapon.launch.speed * owner.aim.power;

  return fanDirections(centre, weapon.launch.projectileCount, weapon.launch.spreadDegrees)
    .slice(0, granted)
    .map((direction, index) => ({
      ...createWarhead({
        id: allocateId(),
        shotId,
        ownerId: owner.playerId,
        weapon,
        generation: 0,
        x: muzzle.x,
        y: muzzle.y,
        velocityX: Math.cos(direction) * speed,
        velocityY: Math.sin(direction) * speed,
        radius: weapon.projectile.radius,
        ignoredTankId: owner.playerId,
        tankArmSeconds: MUZZLE_ARM_SECONDS,
        damageScale: 1,
        blastScale: 1,
        terrainScale: 1,
      }),
      launchDelay: index * (weapon.projectile.staggerSeconds ?? 0),
    }));
};

/**
 * Creates the secondary warheads for a parent. Returns [] if the parent already spawned, is a
 * child itself, the weapon has no spawn behaviour, or the shot's projectile budget is spent.
 */
export const spawnChildren = (
  parent: ProjectileState,
  weapon: WeaponDefinition,
  trigger: SpawnTrigger,
  origin: Point,
  ledger: ShotLedger,
  allocateId: () => number,
): ProjectileState[] => {
  const spawn = weapon.projectile.spawn;
  if (spawn === undefined || spawn.trigger !== trigger) return [];
  if (parent.hasSpawned || parent.generation >= COMBAT_LIMITS.maxSpawnGeneration) return [];
  parent.hasSpawned = true;

  const granted = ledger.reserveProjectiles(spawn.count);
  const fromImpact = trigger === 'impact';
  // Impact bomblets fan upward out of the blast; apex/timer splits continue the parent's path.
  const centre = fromImpact ? -Math.PI / 2 : Math.atan2(parent.velocityY, parent.velocityX);
  const speed = fromImpact
    ? weapon.launch.speed * spawn.speedScale
    : Math.hypot(parent.velocityX, parent.velocityY) * spawn.speedScale;

  return fanDirections(centre, spawn.count, spawn.spreadDegrees)
    .slice(0, granted)
    .map((direction) =>
      createWarhead({
        id: allocateId(),
        shotId: parent.shotId,
        ownerId: parent.ownerId,
        weapon,
        generation: parent.generation + 1,
        x: origin.x,
        y: origin.y,
        velocityX: Math.cos(direction) * speed,
        velocityY: Math.sin(direction) * speed,
        radius: Math.max(2, parent.radius * spawn.radiusScale),
        ignoredTankId: fromImpact ? parent.struckTankId : undefined,
        tankArmSeconds: fromImpact ? BOMBLET_ARM_SECONDS : 0,
        damageScale: parent.damageScale * spawn.damageScale,
        blastScale: parent.blastScale * spawn.blastScale,
        terrainScale: parent.terrainScale * spawn.terrainScale,
      }),
    );
};
