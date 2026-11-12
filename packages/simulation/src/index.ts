// Shared deterministic simulation contract. Phaser and browser APIs must not enter this package.
export {
  COMBAT_LIMITS,
  COORDINATE_CONVENTION,
  GRAVITY,
  RANDOM_POLICY,
  SIMULATION_HZ,
  SIMULATION_STEP_SECONDS,
  WORLD_BOUNDS,
} from './config/SimulationConfig';
export {
  createBattlefieldTerrain,
  sampleSurfaceY,
  TANK_SPAWN_X,
  TERRAIN_STYLES,
  TERRAIN_GENERATION_VERSION,
  type TerrainStyle,
  type TerrainProfile,
} from './terrain/TerrainProfile';
export {
  carveCrater,
  createMutableTerrain,
  sampleMutableSurfaceY,
  sampleSurfaceAngle,
  type MutableTerrainState,
} from './terrain/TerrainState';
export {
  placeTankOnTerrain,
  TANK_TRACK_HALF_WIDTH,
  type PlayerId,
  type TankPlacement,
} from './tanks/TankPlacement';
export {
  moveTankAlongTerrain,
  settleTank,
  TANK_MAX_X,
  TANK_MIN_SEPARATION,
  TANK_MIN_X,
  TURN_MOVEMENT_ALLOWANCE,
} from './tanks/TankPhysics';
export {
  aimDirection,
  BARREL_LENGTH,
  distanceToTank,
  HULL_CAPSULE_LOCAL,
  hullCapsule,
  localToWorld,
  muzzlePosition,
  TURRET_PIVOT_LOCAL,
  turretPivot,
  worldToLocal,
  type Point,
} from './tanks/TankGeometry';
export {
  ammoOf,
  carries,
  consumeAmmo,
  createInventory,
  cycleWeaponId,
  firstAvailableWeapon,
  formatAmmo,
  hasAmmo,
  type WeaponInventory,
} from './inventory/WeaponInventory';
export {
  GameEngine,
  MIN_POWER,
  MAX_POWER,
  MIN_ELEVATION_DEGREES,
  MAX_ELEVATION_DEGREES,
  type GameEngineOptions,
} from './match/GameEngine';
export { normalizeSeed, SeededRandom } from './random/SeededRandom';
export { loadoutIdsFor, validateLoadouts, type Loadouts } from './draft/Loadouts';
export {
  createDefaultDraftConfig,
  createRandomPoolDraftConfig,
  dealRandomDraft,
  draftPickOrder,
  otherPlayer,
  validateDraftConfig,
  WeaponDraft,
  type DraftConfig,
  type DraftOrder,
  type DraftPick,
  type DraftRejection,
  type PickMethod,
  type PickResult,
} from './draft/WeaponDraft';
export { ShotLedger } from './combat/ShotLedger';
export {
  EXPLOSION_VISUAL_SECONDS,
  fallDamageForDrop,
  resolveExplosion,
  type ExplosionInput,
  type ExplosionOutcome,
} from './combat/ExplosionSystem';
export {
  integrateBallistic,
  predictTrajectory,
  substepCount,
  type BallisticBody,
} from './projectiles/Ballistics';
export {
  BOMBLET_ARM_SECONDS,
  createWarhead,
  fanDirections,
  launchVolley,
  MUZZLE_ARM_SECONDS,
  spawnChildren,
} from './projectiles/ProjectileFactory';
export {
  assertValidArsenal,
  MAX_DAMAGE_CAP_PER_SHOT,
  validateWeapon,
} from './weapons/validateWeapon';
export type { CombatEvent, ContactTarget, ExpiryReason } from './events/CombatEvent';
export type {
  AimState,
  DamageEvent,
  ExplosionState,
  MatchPhase,
  MatchState,
  ProjectileMode,
  ProjectileMotionSample,
  ProjectileState,
  TankState,
} from './state/GameState';
