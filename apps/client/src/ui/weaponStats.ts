import type { WeaponDefinition } from '@artillery/content';
import { GRAVITY } from '@artillery/simulation';

// Normalised 0..1 stat bars derived from weapon data, so the arsenal panel always matches the
// simulation without hand-maintained numbers. Scales are relative to the shipped arsenal.

export interface WeaponStatBar {
  readonly label: string;
  readonly value: number;
  readonly text: string;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Flat-ground range at full power and the best allowed elevation, in world units. */
export const weaponReach = (weapon: WeaponDefinition): number => {
  const elevation = Math.min(45, weapon.launch.maxElevationDegrees ?? 85);
  const speed = weapon.launch.speed;
  if (weapon.projectile.gravityScale === 0) return speed * weapon.projectile.maxLifetimeSeconds;
  return (
    (speed * speed * Math.sin((2 * elevation * Math.PI) / 180)) /
    (GRAVITY * weapon.projectile.gravityScale)
  );
};

export const weaponStatBars = (weapon: WeaponDefinition): WeaponStatBar[] => {
  const reach = weaponReach(weapon);
  return [
    {
      label: 'DAMAGE',
      value: clamp01(weapon.damageCapPerShot / 50),
      text: `${weapon.damageCapPerShot} max`,
    },
    {
      label: 'BLAST',
      value: clamp01(weapon.explosion.blastRadius / 140),
      text: `${weapon.explosion.blastRadius}`,
    },
    {
      label: 'CRATER',
      value: clamp01(weapon.explosion.terrainRadius / 120),
      text: `${weapon.explosion.terrainRadius}`,
    },
    {
      label: 'REACH',
      value: clamp01(reach / 1400),
      text: `${Math.round(reach)}`,
    },
    {
      label: 'WIND',
      value: clamp01(weapon.projectile.windScale / 1.25),
      text: weapon.projectile.windScale <= 0.3 ? 'resists' : `×${weapon.projectile.windScale}`,
    },
  ];
};

/** Short behaviour tags for the arsenal card. */
export const weaponTags = (weapon: WeaponDefinition): string[] => {
  const tags: string[] = [];
  const { launch, projectile } = weapon;
  if (weapon.pack) tags.push(`${weapon.pack} pack`);
  if (projectile.guidance) tags.push(`${projectile.guidance} guidance`);
  if (projectile.proximityRadius) tags.push(`proximity ${projectile.proximityRadius}u`);
  if (projectile.cruise) tags.push(`${projectile.cruise.kind} cruiser`);
  if (projectile.tunnel) tags.push(`tunnel ${projectile.tunnel.distance}u`);
  if (projectile.utility) tags.push(projectile.utility);
  if (projectile.verticalHops) tags.push(`${projectile.verticalHops} vertical hops`);
  if (weapon.explosion.terrainEffect)
    tags.push(
      `${weapon.explosion.terrainEffect.operation} ${weapon.explosion.terrainEffect.shape}`,
    );
  if (weapon.explosion.coating) tags.push(`${weapon.explosion.coating} coating`);
  if (weapon.explosion.tracer) tags.push('aiming tool, no damage');
  if (launch.projectileCount > 1) tags.push(`${launch.projectileCount}-shot spread`);
  if (projectile.bounce !== undefined) tags.push(`${projectile.bounce.count} bounces`);
  if (projectile.spawn !== undefined) {
    tags.push(`splits ×${projectile.spawn.count} on ${projectile.spawn.trigger}`);
  }
  if (projectile.airburst?.altitude !== undefined)
    tags.push(`airburst ${projectile.airburst.altitude}u`);
  if (projectile.airburst?.afterSeconds !== undefined)
    tags.push(`timed ${projectile.airburst.afterSeconds}s`);
  if (projectile.fuseSeconds !== undefined) tags.push(`sticky ${projectile.fuseSeconds}s fuse`);
  if (projectile.drill !== undefined) tags.push(`drills ${projectile.drill.depth}u`);
  if (launch.maxElevationDegrees !== undefined)
    tags.push(`flat fire ≤${launch.maxElevationDegrees}°`);
  if (weapon.explosion.directHitBonus >= 20)
    tags.push(`+${weapon.explosion.directHitBonus} direct hit`);
  return tags;
};
