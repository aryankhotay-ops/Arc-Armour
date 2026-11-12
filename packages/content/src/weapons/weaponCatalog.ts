import type { WeaponDefinition, WeaponId } from './WeaponDefinition';

// Balance intent — verified by packages/simulation/src/balance/weaponBalance.test.ts, which
// sweeps angle × power for every weapon across six battlefield situations:
// - Flat-ground reach at full power is roughly speed² / (235 × gravityScale). Tanks spawn
//   2688 units apart. Reach is retuned, but tanks/blast radii are NOT scaled up: smaller
//   targets and seeded hills/valleys demand real angle/power judgment.
// - Every weapon has a per-shot damage cap well below 100 HP: nothing one-shots a healthy tank.
// - High ceilings cost something: scarce ammo, short reach, flat-fire only, or a tiny blast.
// - Standard Shell is the only unlimited weapon, so a player can always fire.

// Keep usable cross-map reach as separation grows by 51%: speed grows by sqrt(distance).
// Damage/blasts/tanks remain unchanged. Near-full power still requires deliberate aiming.
const LAUNCH_SPEED_SCALE = 1.4 * Math.sqrt(2688 / 1780);
const weapon = (definition: WeaponDefinition): WeaponDefinition =>
  Object.freeze({
    ...definition,
    launch: { ...definition.launch, speed: definition.launch.speed * LAUNCH_SPEED_SCALE },
  });

export const WEAPON_CATALOG: readonly WeaponDefinition[] = Object.freeze([
  // Baseline. Unlimited, long reach, average everything: never the best, always available.
  weapon({
    id: 'standard-shell',
    name: 'Standard Shell',
    role: 'Reliable all-rounder',
    description: 'Unlimited general-purpose round with balanced damage, reach and cratering.',
    icon: 'shell',
    accent: 0xffc857,
    ammo: 'unlimited',
    launch: { projectileCount: 1, spreadDegrees: 0, speed: 500 },
    projectile: { radius: 5, gravityScale: 1, windScale: 1, maxLifetimeSeconds: 12 },
    explosion: { blastRadius: 58, terrainRadius: 44, maxDamage: 30, directHitBonus: 6 },
    trail: { style: 'smoke', color: 0xd8d2c0, width: 3, lifetimeSeconds: 0.55 },
    damageCapPerShot: 34,
  }),
  // Highest damage in the arsenal, but a dense slow lob: it cannot reach across the map.
  weapon({
    id: 'heavy-shell',
    name: 'Heavy Shell',
    role: 'Close-range bruiser',
    description: 'Dense slow round with the biggest hit, but short reach. Drive in first.',
    icon: 'heavy',
    accent: 0xff8c42,
    ammo: 3,
    launch: { projectileCount: 1, spreadDegrees: 0, speed: 400 },
    projectile: { radius: 8, gravityScale: 1.2, windScale: 0.55, maxLifetimeSeconds: 12 },
    explosion: { blastRadius: 70, terrainRadius: 54, maxDamage: 40, directHitBonus: 8 },
    trail: { style: 'smoke', color: 0x8a7f72, width: 6, lifetimeSeconds: 0.8 },
    damageCapPerShot: 46,
  }),
  // Area denial: weak core, five bomblets scatter on impact. Forgiving and good over walls.
  weapon({
    id: 'cluster-bloom',
    name: 'Cluster Bloom',
    role: 'Area saturation',
    description: 'Bursts on impact and scatters five bomblets that blanket the surrounding ground.',
    icon: 'cluster',
    accent: 0xf9e784,
    ammo: 2,
    launch: { projectileCount: 1, spreadDegrees: 0, speed: 480 },
    projectile: {
      radius: 7,
      gravityScale: 1,
      windScale: 0.9,
      maxLifetimeSeconds: 12,
      spawn: {
        trigger: 'impact',
        count: 5,
        spreadDegrees: 110,
        speedScale: 0.34,
        radiusScale: 0.6,
        damageScale: 0.5,
        blastScale: 0.7,
        terrainScale: 0.55,
      },
    },
    explosion: { blastRadius: 44, terrainRadius: 34, maxDamage: 18, directHitBonus: 4 },
    trail: { style: 'spark', color: 0xf9e784, width: 3, lifetimeSeconds: 0.45 },
    damageCapPerShot: 32,
  }),
  // Forgiving fan of three light shells; the per-shot cap stops all three stacking hugely.
  weapon({
    id: 'trident-shot',
    name: 'Trident Shot',
    role: 'Forgiving spread',
    description: 'Fires three light shells in a tight fan. Easy to land, modest total damage.',
    icon: 'trident',
    accent: 0x7bdff2,
    ammo: 3,
    launch: { projectileCount: 3, spreadDegrees: 9, speed: 490 },
    projectile: { radius: 4, gravityScale: 1, windScale: 1, maxLifetimeSeconds: 12 },
    explosion: { blastRadius: 40, terrainRadius: 30, maxDamage: 17, directHitBonus: 4 },
    trail: { style: 'glow', color: 0x7bdff2, width: 2, lifetimeSeconds: 0.4 },
    damageCapPerShot: 34,
  }),
  // Skips into cover: two elastic bounces carry it into pits and to the far map edge.
  weapon({
    id: 'ricochet-orb',
    name: 'Ricochet Orb',
    role: 'Bunker buster',
    description: 'Elastic orb that skips twice off the terrain, rolling into pits before it blows.',
    icon: 'ricochet',
    accent: 0xb2f7ef,
    ammo: 3,
    launch: { projectileCount: 1, spreadDegrees: 0, speed: 470 },
    projectile: {
      radius: 7,
      gravityScale: 0.9,
      // Long flights plus two bounces already provide forgiving reach. Wind must be a
      // real tradeoff rather than making the orb the best choice in every wide-map gale.
      windScale: 1.25,
      maxLifetimeSeconds: 12,
      bounce: { count: 2, restitution: 0.62, minSpeed: 70 },
    },
    explosion: { blastRadius: 54, terrainRadius: 40, maxDamage: 30, directHitBonus: 6 },
    trail: { style: 'dashed', color: 0xb2f7ef, width: 3, lifetimeSeconds: 0.7 },
    damageCapPerShot: 34,
  }),
  // The most forgiving weapon: an enormous airburst that ignores aim errors but barely digs.
  weapon({
    id: 'skyburst',
    name: 'Skyburst',
    role: 'Forgiving airburst',
    description:
      'Proximity fuse bursts 55 units above the ground. Enormous radius, shallow crater.',
    icon: 'airburst',
    accent: 0xcdb4db,
    ammo: 2,
    launch: { projectileCount: 1, spreadDegrees: 0, speed: 500 },
    projectile: {
      radius: 6,
      gravityScale: 1,
      windScale: 0.7,
      maxLifetimeSeconds: 12,
      airburst: { altitude: 55, armSeconds: 0.6 },
    },
    explosion: { blastRadius: 140, terrainRadius: 18, maxDamage: 42, directHitBonus: 0 },
    trail: { style: 'glow', color: 0xcdb4db, width: 3, lifetimeSeconds: 0.6 },
    damageCapPerShot: 32,
  }),
  // Undermines: drills into the hillside and erupts below the surface, dropping tanks into a pit.
  weapon({
    id: 'burrower',
    name: 'Burrower',
    role: 'Undermining digger',
    description: 'Drills 46 units into the ground, then erupts and collapses the terrain above.',
    icon: 'drill',
    accent: 0xd4a373,
    ammo: 3,
    launch: { projectileCount: 1, spreadDegrees: 0, speed: 470 },
    projectile: {
      radius: 7,
      gravityScale: 1.1,
      windScale: 0.7,
      maxLifetimeSeconds: 12,
      drill: { depth: 46, speed: 140 },
    },
    explosion: { blastRadius: 62, terrainRadius: 74, maxDamage: 30, directHitBonus: 6 },
    trail: { style: 'smoke', color: 0xa67c52, width: 4, lifetimeSeconds: 0.6 },
    damageCapPerShot: 36,
  }),
  // Pure terraforming: weak blast, enormous crater, short reach. Fall damage is its real edge.
  weapon({
    id: 'landbreaker',
    name: 'Landbreaker',
    role: 'Terrain demolition',
    description: 'Low-damage demolition charge that excavates a massive crater and drops tanks.',
    icon: 'crater',
    accent: 0x90be6d,
    ammo: 2,
    launch: { projectileCount: 1, spreadDegrees: 0, speed: 470 },
    projectile: { radius: 10, gravityScale: 1.25, windScale: 0.45, maxLifetimeSeconds: 12 },
    explosion: { blastRadius: 70, terrainRadius: 118, maxDamage: 18, directHitBonus: 4 },
    trail: { style: 'smoke', color: 0x6f8f52, width: 7, lifetimeSeconds: 0.9 },
    damageCapPerShot: 24,
  }),
  // Fast, flat and almost wind-proof: the weapon to reach for in a gale. Small blast.
  weapon({
    id: 'needle-dart',
    name: 'Needle Dart',
    role: 'Wind-proof poke',
    description: 'Tiny high-velocity dart that shrugs off wind and reaches anywhere. Small blast.',
    icon: 'dart',
    accent: 0x48cae4,
    ammo: 5,
    launch: { projectileCount: 1, spreadDegrees: 0, speed: 640 },
    projectile: { radius: 3, gravityScale: 0.75, windScale: 0.2, maxLifetimeSeconds: 12 },
    explosion: { blastRadius: 40, terrainRadius: 16, maxDamage: 24, directHitBonus: 8 },
    trail: { style: 'glow', color: 0x48cae4, width: 2, lifetimeSeconds: 0.3 },
    damageCapPerShot: 30,
  }),
  // Sticky charge: clings to terrain or armour, then a delayed, crater-heavy detonation.
  weapon({
    id: 'time-capsule',
    name: 'Time Capsule',
    role: 'Sticky delayed charge',
    description: 'Clings to whatever it hits, then detonates 1.4 s later and digs a deep crater.',
    icon: 'timer',
    accent: 0xff70a6,
    ammo: 3,
    launch: { projectileCount: 1, spreadDegrees: 0, speed: 470 },
    projectile: {
      radius: 7,
      gravityScale: 1,
      windScale: 0.8,
      maxLifetimeSeconds: 12,
      fuseSeconds: 1.4,
    },
    explosion: { blastRadius: 58, terrainRadius: 66, maxDamage: 30, directHitBonus: 6 },
    trail: { style: 'dashed', color: 0xff70a6, width: 3, lifetimeSeconds: 0.6 },
    damageCapPerShot: 34,
  }),
  // Splits into three warheads at the top of its arc: brackets range over high walls.
  weapon({
    id: 'forking-star',
    name: 'Forking Star',
    role: 'Apex splitter',
    description: 'Splits into three diverging warheads at the top of its arc.',
    icon: 'fork',
    accent: 0xe0aaff,
    ammo: 3,
    launch: { projectileCount: 1, spreadDegrees: 0, speed: 490 },
    projectile: {
      radius: 6,
      gravityScale: 0.95,
      windScale: 1,
      maxLifetimeSeconds: 12,
      spawn: {
        trigger: 'apex',
        count: 3,
        spreadDegrees: 32,
        speedScale: 0.95,
        radiusScale: 0.8,
        damageScale: 0.6,
        blastScale: 0.8,
        terrainScale: 0.7,
      },
    },
    explosion: { blastRadius: 50, terrainRadius: 40, maxDamage: 28, directHitBonus: 4 },
    trail: { style: 'spark', color: 0xe0aaff, width: 3, lifetimeSeconds: 0.5 },
    damageCapPerShot: 34,
  }),
  // Highest long-range ceiling, but flat-fire only (≤30°) and almost all of it is direct-hit
  // damage: it cannot lob over cover, and a near miss barely scratches.
  weapon({
    id: 'rail-punch',
    name: 'Rail Punch',
    role: 'Direct-hit sniper',
    description: 'Flat-fire slug (max 30°). Big direct hits, tiny splash, cannot clear cover.',
    icon: 'rail',
    accent: 0xf94144,
    ammo: 2,
    launch: { projectileCount: 1, spreadDegrees: 0, speed: 620, maxElevationDegrees: 30 },
    projectile: { radius: 4, gravityScale: 0.7, windScale: 0.6, maxLifetimeSeconds: 12 },
    explosion: { blastRadius: 22, terrainRadius: 14, maxDamage: 16, directHitBonus: 26 },
    trail: { style: 'glow', color: 0xf94144, width: 3, lifetimeSeconds: 0.35 },
    damageCapPerShot: 40,
  }),
]);

export const WEAPONS_BY_ID: ReadonlyMap<WeaponId, WeaponDefinition> = new Map(
  WEAPON_CATALOG.map((entry) => [entry.id, entry]),
);

export const getWeapon = (id: WeaponId): WeaponDefinition => {
  const definition = WEAPONS_BY_ID.get(id);
  if (definition === undefined) throw new Error(`Unknown weapon id: ${id}`);
  return definition;
};
