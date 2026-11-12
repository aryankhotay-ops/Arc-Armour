import type { WeaponDefinition } from '@artillery/content';

import { COMBAT_LIMITS } from '../config/SimulationConfig';

/** Healthy tanks have 100 HP; a per-shot cap below that means no weapon can one-shot a tank. */
export const MAX_DAMAGE_CAP_PER_SHOT = 99;

const inRange = (value: number, minimum: number, maximum: number): boolean =>
  Number.isFinite(value) && value >= minimum && value <= maximum;

/**
 * Rejects definitions that could break bounded resolution or balance invariants. A new weapon
 * that passes these checks cannot create an endless shot, unbounded projectile counts, or a
 * one-shot kill, regardless of how its behaviours are combined.
 */
export const validateWeapon = (weapon: WeaponDefinition): string[] => {
  const errors: string[] = [];
  const fail = (message: string): void => {
    errors.push(`${weapon.id || '<missing id>'}: ${message}`);
  };
  const { launch, projectile, explosion, trail } = weapon;

  if (weapon.id.trim() === '') fail('id is required');
  if (weapon.name.trim() === '') fail('name is required');
  if (weapon.ammo !== 'unlimited' && !(Number.isInteger(weapon.ammo) && weapon.ammo >= 0)) {
    fail('ammo must be a non-negative integer or "unlimited"');
  }

  if (!(Number.isInteger(launch.projectileCount) && inRange(launch.projectileCount, 1, 12))) {
    fail('launch.projectileCount must be an integer from 1 to 12');
  }
  if (!inRange(launch.spreadDegrees, 0, 90)) fail('launch.spreadDegrees must be 0..90');
  if (!inRange(launch.speed, 50, 1200)) fail('launch.speed must be 50..1200');
  if (launch.maxElevationDegrees !== undefined && !inRange(launch.maxElevationDegrees, 10, 85)) {
    fail('launch.maxElevationDegrees must be 10..85');
  }

  if (!inRange(projectile.radius, 1, 20)) fail('projectile.radius must be 1..20');
  if (!inRange(projectile.gravityScale, 0, 3)) fail('projectile.gravityScale must be 0..3');
  if (!inRange(projectile.windScale, 0, 3)) fail('projectile.windScale must be 0..3');
  if (!(projectile.maxLifetimeSeconds > 0 && projectile.maxLifetimeSeconds <= 20)) {
    fail('projectile.maxLifetimeSeconds must be in (0, 20]');
  }

  const { bounce, airburst, fuseSeconds, drill, spawn } = projectile;
  if (bounce !== undefined) {
    if (!(Number.isInteger(bounce.count) && inRange(bounce.count, 0, 8))) {
      fail('bounce.count must be an integer from 0 to 8');
    }
    if (!(bounce.restitution > 0 && bounce.restitution < 1)) {
      fail('bounce.restitution must be in (0, 1) so every bounce loses energy');
    }
    if (!inRange(bounce.minSpeed, 0, 2000)) fail('bounce.minSpeed must be >= 0');
  }
  if (airburst !== undefined) {
    if (airburst.altitude === undefined && airburst.afterSeconds === undefined) {
      fail('airburst needs an altitude and/or afterSeconds trigger');
    }
    if (airburst.altitude !== undefined && !inRange(airburst.altitude, 1, 400)) {
      fail('airburst.altitude must be 1..400');
    }
    if (airburst.afterSeconds !== undefined && !inRange(airburst.afterSeconds, 0.05, 20)) {
      fail('airburst.afterSeconds must be 0.05..20');
    }
    if (!inRange(airburst.armSeconds, 0, 10)) fail('airburst.armSeconds must be 0..10');
  }
  if (fuseSeconds !== undefined && !(fuseSeconds > 0 && fuseSeconds <= 5)) {
    fail('fuseSeconds must be in (0, 5]');
  }
  if (drill !== undefined) {
    if (!(drill.depth > 0 && drill.depth <= 200)) fail('drill.depth must be in (0, 200]');
    if (!(drill.speed > 0)) fail('drill.speed must be positive');
  }
  if (spawn !== undefined) {
    if (!(Number.isInteger(spawn.count) && inRange(spawn.count, 1, 12))) {
      fail('spawn.count must be an integer from 1 to 12');
    }
    if (
      spawn.trigger === 'timer' &&
      !(spawn.delaySeconds !== undefined && spawn.delaySeconds > 0)
    ) {
      fail('a timer spawn needs a positive delaySeconds');
    }
    if (!(spawn.speedScale > 0 && spawn.speedScale <= 2))
      fail('spawn.speedScale must be in (0, 2]');
    if (!inRange(spawn.spreadDegrees, 0, 180)) fail('spawn.spreadDegrees must be 0..180');
    for (const [key, value] of [
      ['radiusScale', spawn.radiusScale],
      ['damageScale', spawn.damageScale],
      ['blastScale', spawn.blastScale],
      ['terrainScale', spawn.terrainScale],
    ] as const) {
      if (!inRange(value, 0, 2)) fail(`spawn.${key} must be 0..2`);
    }
  }
  if (projectile.proximityRadius !== undefined && !inRange(projectile.proximityRadius, 10, 400))
    fail('proximityRadius must be 10..400');
  if (projectile.staggerSeconds !== undefined && !inRange(projectile.staggerSeconds, 0, 0.3))
    fail('staggerSeconds must be 0...3');
  if (
    projectile.verticalHops !== undefined &&
    (!Number.isInteger(projectile.verticalHops) || !inRange(projectile.verticalHops, 1, 8))
  )
    fail('verticalHops must be 1..8');
  if (
    projectile.cruise !== undefined &&
    (!inRange(projectile.cruise.speed, 1, 350) || !inRange(projectile.cruise.seconds, 0.1, 5))
  )
    fail('invalid bounded cruise');
  if (
    projectile.tunnel !== undefined &&
    (!inRange(projectile.tunnel.distance, 1, 700) || !inRange(projectile.tunnel.speed, 1, 350))
  )
    fail('invalid bounded tunnel');
  if (
    explosion.terrainEffect !== undefined &&
    (!inRange(explosion.terrainEffect.width, 1, 500) ||
      !inRange(explosion.terrainEffect.depth, 1, 300))
  )
    fail('invalid bounded terrainEffect');
  if (
    explosion.repeat !== undefined &&
    (!Number.isInteger(explosion.repeat.count) ||
      !inRange(explosion.repeat.count, 1, 12) ||
      !inRange(explosion.repeat.spread, 1, 400))
  )
    fail('invalid bounded repeat');
  const worstCaseProjectiles =
    launch.projectileCount *
    (1 + (spawn?.count ?? 0) + (explosion.repeat?.count ?? 0) + (projectile.verticalHops ?? 0));
  if (worstCaseProjectiles > COMBAT_LIMITS.maxProjectilesPerShot) {
    fail(
      `one shot could create ${worstCaseProjectiles} projectiles; the limit is ${COMBAT_LIMITS.maxProjectilesPerShot}`,
    );
  }

  if (!inRange(explosion.blastRadius, 0, 200)) fail('explosion.blastRadius must be 0..200');
  if (!inRange(explosion.terrainRadius, 0, 200)) fail('explosion.terrainRadius must be 0..200');
  if (!inRange(explosion.maxDamage, 0, 100)) fail('explosion.maxDamage must be 0..100');
  if (!inRange(explosion.directHitBonus, 0, 100)) fail('explosion.directHitBonus must be 0..100');
  if (!inRange(weapon.damageCapPerShot, 1, MAX_DAMAGE_CAP_PER_SHOT)) {
    fail(`damageCapPerShot must be 1..${MAX_DAMAGE_CAP_PER_SHOT} so no weapon one-shots a tank`);
  }

  if (
    explosion.beam !== undefined &&
    (!inRange(explosion.beam.reach, 1, 400) || !inRange(explosion.beam.damage, 0, 99))
  )
    fail('invalid bounded energy beam');
  if (!(trail.width > 0)) fail('trail.width must be positive');
  if (!inRange(trail.lifetimeSeconds, 0, 5)) fail('trail.lifetimeSeconds must be 0..5');

  return errors;
};

/** Validates an entire arsenal; throws one aggregated error listing every problem. */
export const assertValidArsenal = (weapons: readonly WeaponDefinition[]): void => {
  const errors = weapons.flatMap(validateWeapon);
  const ids = weapons.map((weapon) => weapon.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0)
    errors.push(`duplicate weapon ids: ${[...new Set(duplicates)].join(', ')}`);
  if (weapons.length === 0) errors.push('the arsenal must contain at least one weapon');
  if (!weapons.some((weapon) => weapon.ammo === 'unlimited')) {
    errors.push('at least one weapon must have unlimited ammo so a player can always fire');
  }
  if (errors.length > 0) throw new Error(`Invalid weapon arsenal:\n- ${errors.join('\n- ')}`);
};
