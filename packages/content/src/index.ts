// Original project identity and data-driven content definitions.
export const GAME_TITLE = 'Arc & Armor';
export const GAME_SUBTITLE = 'Turn-based artillery, built from first principles';
export const CONTENT_VERSION = 3;
export { TANK_MODELS, tankModel, tankModelId } from './tanks/tankCatalog';
export type { TankModelId, TankModelDefinition, TankGeometryDefinition } from './tanks/tankCatalog';

export { WEAPON_CATALOG, WEAPONS_BY_ID, getWeapon } from './weapons/weaponCatalog';
export {
  ORIGINAL_DELUXE_CATALOG,
  ORIGINAL_WEAPON_NAMES,
  DELUXE_WEAPON_NAMES,
  PACK_REFERENCE_URL,
} from './weapons/originalDeluxeCatalog';
export { EXPANSION_CATALOG, EXPANSION_PACK_NAMES } from './weapons/expansionCatalog';
export { FULL_DEPOT_CATALOG } from './weapons/fullDepotCatalog';
export type { WeaponPackId } from './weapons/WeaponDefinition';
export type {
  AirburstBehavior,
  AmmoSupply,
  BounceBehavior,
  DrillBehavior,
  ExplosionDefinition,
  LaunchDefinition,
  ProjectileDefinition,
  SpawnBehavior,
  SpawnTrigger,
  TrailDefinition,
  TrailStyle,
  WeaponDefinition,
  WeaponIconKind,
  WeaponId,
} from './weapons/WeaponDefinition';
