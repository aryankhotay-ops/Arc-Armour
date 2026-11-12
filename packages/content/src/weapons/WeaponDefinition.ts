// Data-only weapon definitions shared by the local client and the future authoritative server.
// The firing engine composes these generic behaviours and never branches on a weapon id, so a
// new weapon is added by appending a definition — not by editing the engine.

export type WeaponId = string;

/** Procedural original icon drawn by the client. New weapons reuse an existing glyph. */
export type WeaponIconKind =
  | 'shell'
  | 'heavy'
  | 'cluster'
  | 'trident'
  | 'ricochet'
  | 'airburst'
  | 'drill'
  | 'crater'
  | 'dart'
  | 'timer'
  | 'fork'
  | 'rail';

export type TrailStyle = 'none' | 'smoke' | 'spark' | 'glow' | 'dashed';

/** Presentation-only trail. It never affects simulation results. */
export interface TrailDefinition {
  readonly style: TrailStyle;
  readonly color: number;
  readonly width: number;
  /** How long each trail point stays visible after the projectile passes it. */
  readonly lifetimeSeconds: number;
}

export type SpawnTrigger = 'apex' | 'timer' | 'impact' | 'proximity';

/**
 * Secondary warheads. Children are plain impact warheads: they never bounce, drill, fuse, or
 * spawn again, which bounds every shot to two generations.
 */
export interface SpawnBehavior {
  readonly trigger: SpawnTrigger;
  /** Timer trigger only: seconds after launch. */
  readonly delaySeconds?: number;
  readonly count: number;
  readonly spreadDegrees: number;
  /** Apex/timer: multiple of the parent's current speed. Impact: multiple of the launch speed. */
  readonly speedScale: number;
  readonly radiusScale: number;
  readonly damageScale: number;
  readonly blastScale: number;
  readonly terrainScale: number;
}

export interface BounceBehavior {
  readonly count: number;
  readonly restitution: number;
  /** Below this post-bounce speed the projectile detonates instead of skipping again. */
  readonly minSpeed: number;
}

export interface AirburstBehavior {
  /** Detonate while descending within this height above the terrain surface. */
  readonly altitude?: number;
  /** Detonate this many seconds after launch. */
  readonly afterSeconds?: number;
  /** The altitude fuse ignores terrain proximity before this age. */
  readonly armSeconds: number;
}

export interface DrillBehavior {
  /** Depth below the impact surface at which the warhead detonates. */
  readonly depth: number;
  readonly speed: number;
}

export interface ProjectileDefinition {
  /** Optional bounded arcade adaptations of Original/Deluxe behaviors. Children never
   * recursively spawn; selected debris may bounce/build dirt with childEffects enabled. */
  readonly guidance?: 'seek' | 'drop';
  readonly proximityRadius?: number;
  readonly cruise?: {
    readonly kind: 'forward' | 'return' | 'downhill';
    readonly speed: number;
    readonly seconds: number;
  };
  readonly tunnel?: {
    readonly distance: number;
    readonly speed: number;
    readonly emerge: boolean;
    readonly home?: boolean;
  };
  readonly verticalHops?: number;
  readonly childEffects?: boolean;
  readonly utility?: 'jump' | 'excavate-self';
  readonly staggerSeconds?: number;
  readonly radius: number;
  readonly gravityScale: number;
  readonly windScale: number;
  /** Hard safety stop; a projectile older than this expires without exploding. */
  readonly maxLifetimeSeconds: number;
  readonly bounce?: BounceBehavior;
  readonly airburst?: AirburstBehavior;
  /** Sticky delayed detonation: seconds between first contact and detonation. */
  readonly fuseSeconds?: number;
  readonly drill?: DrillBehavior;
  readonly spawn?: SpawnBehavior;
}

export interface ExplosionDefinition {
  readonly beam?: { readonly reach: number; readonly damage: number };
  readonly terrainEffect?: {
    readonly operation: 'add' | 'cut';
    readonly shape: 'mound' | 'wall' | 'v' | 'trench';
    readonly width: number;
    readonly depth: number;
  };
  readonly coating?: 'rubber' | 'glue';
  readonly tracer?: boolean;
  readonly scrambleAim?: boolean;
  readonly impulse?: number;
  readonly repeat?: {
    readonly count: number;
    readonly spread: number;
    readonly vertical?: boolean;
  };
  readonly blastRadius: number;
  readonly terrainRadius: number;
  readonly maxDamage: number;
  /** Extra damage applied only to a tank the warhead physically struck. */
  readonly directHitBonus: number;
}

export type AmmoSupply = number | 'unlimited';

export interface LaunchDefinition {
  readonly projectileCount: number;
  readonly spreadDegrees: number;
  /** World units per second at 100% power. */
  readonly speed: number;
  /**
   * Highest barrel elevation this weapon allows (default 85). A low limit makes a flat-fire
   * weapon that cannot lob over cover or drop steeply into pits.
   */
  readonly maxElevationDegrees?: number;
}

/** Official depot groups referenced by name only; every implementation is an original adaptation. */
export type WeaponPackId =
  | 'original'
  | 'deluxe'
  | 'nuke'
  | 'ambush'
  | 'flamethrower'
  | 'meteor'
  | 'chaos'
  | 'power'
  | 'super'
  | 'gravity'
  | 'fireworks'
  | 'gold'
  | 'tornado'
  | 'nano'
  | 'acid';

export interface WeaponDefinition {
  readonly pack?: WeaponPackId;
  /** Honest differences from the official game's points/particles/underground mechanics. */
  readonly adaptationNote?: string;
  readonly id: WeaponId;
  readonly name: string;
  /** Short tactical niche shown on the arsenal card. */
  readonly role: string;
  readonly description: string;
  readonly icon: WeaponIconKind;
  readonly accent: number;
  readonly ammo: AmmoSupply;
  readonly launch: LaunchDefinition;
  readonly projectile: ProjectileDefinition;
  readonly explosion: ExplosionDefinition;
  readonly trail: TrailDefinition;
  /** Maximum total damage one shot may deal to any single tank, across all warheads. */
  readonly damageCapPerShot: number;
}
