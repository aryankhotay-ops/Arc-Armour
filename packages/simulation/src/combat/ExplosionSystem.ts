import type { WeaponDefinition } from '@artillery/content';

import type { CombatEvent } from '../events/CombatEvent';
import type { ExplosionState, TankState } from '../state/GameState';
import { distanceToTank } from '../tanks/TankGeometry';
import { settleTank } from '../tanks/TankPhysics';
import { moveTankAlongTerrain } from '../tanks/TankPhysics';
import { SeededRandom } from '../random/SeededRandom';
import type { PlayerId } from '../tanks/TankPlacement';
import {
  carveCrater,
  editTerrainProfile,
  coatTerrain,
  type MutableTerrainState,
} from '../terrain/TerrainState';
import type { ShotLedger } from './ShotLedger';

/** Drops shorter than this are absorbed by the suspension. */
export const FALL_SAFE_DROP = 12;
export const FALL_DAMAGE_PER_UNIT = 0.25;
export const FALL_DAMAGE_MAX = 15;
export const EXPLOSION_VISUAL_SECONDS = 0.72;

export interface ExplosionInput {
  readonly explosionId: number;
  readonly shotId: number;
  readonly projectileId: number;
  readonly weapon: WeaponDefinition;
  readonly x: number;
  readonly y: number;
  readonly damageScale: number;
  readonly blastScale: number;
  readonly terrainScale: number;
  /** The tank the warhead physically struck, if any. Only it receives the direct-hit bonus. */
  readonly directHitTankId: PlayerId | undefined;
}

export interface ExplosionOutcome {
  readonly explosion: ExplosionState;
  readonly tanks: [TankState, TankState];
  readonly events: readonly CombatEvent[];
}

export const fallDamageForDrop = (drop: number): number =>
  drop <= FALL_SAFE_DROP
    ? 0
    : Math.min(FALL_DAMAGE_MAX, (drop - FALL_SAFE_DROP) * FALL_DAMAGE_PER_UNIT);

/**
 * Resolves one explosion exactly once: blast + direct-hit damage against current tank hulls,
 * crater carving, tank settling, then fall damage. Every point of damage passes through the
 * shot ledger, which enforces the weapon's per-shot cap per tank.
 */
export const resolveExplosion = (
  input: ExplosionInput,
  terrain: MutableTerrainState,
  tanks: readonly [TankState, TankState],
  ledger: ShotLedger,
): ExplosionOutcome => {
  const { weapon } = input;
  const blastRadius = weapon.explosion.blastRadius * input.blastScale;
  const terrainRadius = weapon.explosion.terrainRadius * input.terrainScale;
  const maxDamage = weapon.explosion.maxDamage * input.damageScale;
  const directBonus = weapon.explosion.directHitBonus * input.damageScale;

  const events: CombatEvent[] = [
    {
      type: 'explosion',
      explosionId: input.explosionId,
      shotId: input.shotId,
      projectileId: input.projectileId,
      weaponId: weapon.id,
      x: input.x,
      y: input.y,
      blastRadius,
      terrainRadius,
      directHitTankId: input.directHitTankId,
    },
  ];

  const applyDamage = (
    tank: TankState,
    requested: number,
    cause: 'blast' | 'direct-hit' | 'fall',
  ): TankState => {
    if (requested <= 0 || tank.health <= 0) return tank;
    const granted = ledger.applyDamage(tank.playerId, requested);
    if (granted <= 0) return tank;
    const health = Math.max(0, tank.health - granted);
    events.push({
      type: 'tank-damaged',
      explosionId: input.explosionId,
      shotId: input.shotId,
      tankId: tank.playerId,
      amount: granted,
      cause,
      remainingHealth: health,
    });
    return { ...tank, health };
  };

  // 1. Blast and direct-hit damage use the hull positions at the moment of detonation.
  const damaged = tanks.map((tank) => {
    const distance = distanceToTank(tank, input.x, input.y);
    const blast = distance < blastRadius ? maxDamage * (1 - distance / blastRadius) : 0;
    const direct = input.directHitTankId === tank.playerId ? directBonus : 0;
    const beam = weapon.explosion.beam;
    const energy =
      beam !== undefined && distance < beam.reach ? beam.damage * input.damageScale : 0;
    return applyDamage(tank, blast + direct + energy, direct > 0 ? 'direct-hit' : 'blast');
  }) as [TankState, TankState];

  // 2. Crater.
  const effect = weapon.explosion.terrainEffect;
  const crater =
    effect === undefined
      ? carveCrater(terrain, input.x, input.y, terrainRadius)
      : editTerrainProfile(
          terrain,
          input.x,
          input.y,
          effect.width * Math.max(0.4, input.terrainScale),
          effect.depth * Math.max(0.4, input.terrainScale),
          effect.operation,
          effect.shape,
        );
  if (crater.changed) {
    events.push({
      type: 'terrain-deformed',
      explosionId: input.explosionId,
      minX: crater.minX,
      maxX: crater.maxX,
    });
  }
  if (weapon.explosion.coating !== undefined) {
    const coating = coatTerrain(terrain, input.x, weapon.explosion.coating);
    events.push({
      type: 'terrain-deformed',
      explosionId: input.explosionId,
      minX: coating.minX,
      maxX: coating.maxX,
    });
  }

  // 3. Tanks settle into the new surface; long drops cause fall damage (still ledger-capped).
  const settled = damaged.map((tank) => {
    const resting = settleTank(tank, terrain);
    let changed = resting;
    const affected =
      input.directHitTankId === tank.playerId ||
      distanceToTank(tank, input.x, input.y) < blastRadius;
    if (affected && weapon.explosion.scrambleAim) {
      const rng = new SeededRandom(
        input.shotId * 1709 + input.projectileId * 97 + (tank.playerId === 'player1' ? 1 : 2),
      );
      changed = {
        ...changed,
        aim: { angleDegrees: 5 + rng.next() * 80, power: 0.2 + rng.next() * 0.8 },
      };
    }
    if (affected && weapon.explosion.impulse) {
      changed = moveTankAlongTerrain(
        { ...changed, movementRemaining: weapon.explosion.impulse },
        damaged[tank.playerId === 'player1' ? 1 : 0],
        terrain,
        (tank.x < input.x ? -1 : 1) * weapon.explosion.impulse,
      );
      changed = { ...changed, movementRemaining: tank.movementRemaining };
    }
    // Non-damaging terrain tools remain non-damaging even if their excavation lowers tanks.
    const fall =
      weapon.explosion.maxDamage === 0 && weapon.explosion.directHitBonus === 0
        ? 0
        : fallDamageForDrop(resting.groundY - tank.groundY);
    return applyDamage(changed, fall, 'fall');
  }) as [TankState, TankState];

  return {
    explosion: {
      id: input.explosionId,
      shotId: input.shotId,
      weaponId: weapon.id,
      x: input.x,
      y: input.y,
      blastRadius,
      terrainRadius,
      ageSeconds: 0,
      durationSeconds: EXPLOSION_VISUAL_SECONDS,
    },
    tanks: settled,
    events,
  };
};
