export const SIMULATION_HZ = 60;
export const SIMULATION_STEP_SECONDS = 1 / SIMULATION_HZ;

export const WORLD_BOUNDS = Object.freeze({
  // Reference feedback: the playfield still felt cramped at 2240 wide. More real distance,
  // not tiny sprites with large invisible hitboxes. Preserve the uniform 16:9 projection.
  width: 3200,
  height: 1800,
});

export const COORDINATE_CONVENTION = Object.freeze({
  origin: 'top-left',
  positiveX: 'right',
  positiveY: 'down',
  distanceUnit: 'world-pixel',
  timeUnit: 'second',
});

export const RANDOM_POLICY = Object.freeze({
  generator: 'seeded-prng',
  rule: 'Every match stores its seed; authoritative gameplay never uses Math.random().',
});

/** World units per second squared, before each weapon's gravityScale. */
export const GRAVITY = 235;

// Hard safety limits. Weapon data cannot exceed these, and the engine enforces them at runtime,
// so a mistuned or malicious definition can never create an unbounded or endless shot.
export const COMBAT_LIMITS = Object.freeze({
  /** Total projectiles one shot may ever create, including spawned children. */
  maxProjectilesPerShot: 32,
  /** A shot still unresolved after this long is force-resolved. */
  maxShotSeconds: 25,
  /** Launched warheads are generation 0; spawned children are generation 1 and never spawn. */
  maxSpawnGeneration: 1,
  /** Projectiles this far beyond a side wall are discarded as misses. */
  sideMargin: 60,
  /** Retuned long-range rounds must still hit a one-column terrain feature. */
  sweepSampleSpacing: 1,
});
