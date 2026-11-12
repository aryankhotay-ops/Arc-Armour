import { WORLD_BOUNDS } from '../config/SimulationConfig';
import { SeededRandom, normalizeSeed } from '../random/SeededRandom';

/** Fixed gameplay-space spawn centers. Rendering may scale, but these coordinates never do. */
export const TANK_SPAWN_X = Object.freeze({
  player1: 256,
  player2: WORLD_BOUNDS.width - 256,
});

export const TERRAIN_GENERATION_VERSION = 2;
export const TERRAIN_STYLES = [
  'rolling',
  'valley',
  'terraces',
  'escarpment',
  'twin-ridges',
  'broken-highlands',
] as const;
export type TerrainStyle = (typeof TERRAIN_STYLES)[number];

export interface TerrainProfile {
  readonly width: number;
  readonly worldHeight: number;
  readonly surfaceY: readonly number[];
}

export interface GeneratedTerrainProfile extends TerrainProfile {
  readonly seed: number;
  readonly style: TerrainStyle;
  readonly generationVersion: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const smoothStep = (value: number): number => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

// User intent: new matches must not reuse a lone center hump. Independent seeded streams
// provide hills, valleys, terraces and slopes with asymmetric, irregular detail. No browser
// randomness enters the shared simulation. Flat spawn pads preserve exact track contact.
const landscapeSamples = (seed: number, style: TerrainStyle): number[] => {
  const rng = new SeededRandom(seed ^ 0x74657272);
  const baseline = WORLD_BOUNDS.height * (0.67 + rng.next() * 0.07);
  const phase = rng.next() * Math.PI * 2;
  const amplitude = 85 + rng.next() * 60;
  const direction = rng.int(2) === 0 ? -1 : 1;
  const center = 0.38 + rng.next() * 0.24;
  const nodes = Array.from({ length: 22 }, () => rng.next() * 2 - 1);
  const broadNodes = Array.from({ length: 9 }, () => rng.next() * 2 - 1);
  const interpolate = (values: number[], t: number): number => {
    const pos = t * (values.length - 1);
    const left = Math.floor(pos);
    const a = values[left] ?? 0;
    const b = values[Math.min(values.length - 1, left + 1)] ?? a;
    return a + (b - a) * smoothStep(pos - left);
  };
  const mesa = (t: number, a: number, b: number): number =>
    smoothStep((t - a) / 0.065) * (1 - smoothStep((t - b) / 0.065));
  return Array.from({ length: WORLD_BOUNDS.width + 1 }, (_, x) => {
    const t = x / WORLD_BOUNDS.width;
    let macro = 0;
    if (style === 'rolling') macro = -Math.sin(t * Math.PI * 4.5 + phase) * amplitude;
    else if (style === 'valley') macro = 255 * Math.exp(-(((t - center) / 0.19) ** 2)) - 115;
    else if (style === 'terraces') macro = -230 * mesa(t, 0.18, 0.34) - 185 * mesa(t, 0.58, 0.76);
    else if (style === 'escarpment')
      macro = direction * 200 * (smoothStep((t - center + 0.09) / 0.18) - 0.5);
    else if (style === 'twin-ridges')
      macro =
        -235 * Math.exp(-(((t - center + 0.2) / 0.1) ** 2)) -
        205 * Math.exp(-(((t - center - 0.19) / 0.11) ** 2));
    else macro = interpolate(broadNodes, t) * 205;
    // Broad detail and small irregular ridges, never a fixed center Gaussian in every map.
    const detail = interpolate(nodes, t) * 62 + Math.sin(t * 43 + phase) * 14;
    const drift = interpolate(broadNodes, t) * 35;
    return clamp(
      baseline + macro + detail + drift,
      WORLD_BOUNDS.height * 0.45,
      WORLD_BOUNDS.height * 0.84,
    );
  });
};

/**
 * Pins an exactly level track pad and joins it with bounded-slope ramps. Clamp against
 * a slope cone rather than smoothing AFTER the pad (which can tilt/destroy the flat area).
 */
const applySpawnPad = (source: readonly number[], spawnX: number, halfWidth = 76): number[] => {
  const padY = source[Math.round(spawnX)]!;
  return source.map((height, x) => {
    const allowed = Math.max(0, Math.abs(x - spawnX) - halfWidth) * 0.45;
    return clamp(height, padY - allowed, padY + allowed);
  });
};

// Immutable, bounded source-map cache: retries/aim sweeps share generation work, never
// mutable crater samples. Each engine still owns a fresh copy via createMutableTerrain.
const sourceMaps = new Map<number, GeneratedTerrainProfile>();
export const createBattlefieldTerrain = (seed = 0): GeneratedTerrainProfile => {
  const normalized = normalizeSeed(seed);
  const cached = sourceMaps.get(normalized);
  if (cached !== undefined) return cached;
  const style = TERRAIN_STYLES[normalized % TERRAIN_STYLES.length]!;
  const base = landscapeSamples(normalized, style);
  // Natural starting terrain must stay drivable (28-degree chassis limit), including pad
  // transitions. Bidirectional slope limiting retains varied macro shapes without walls
  // trapping a freshly spawned tank. Weapon-made crater walls can still impede movement.
  for (let x = 1; x < base.length; x++) {
    const previous = base[x - 1]!;
    base[x] = clamp(base[x]!, previous - 0.45, previous + 0.45);
  }
  for (let x = base.length - 2; x >= 0; x--) {
    const next = base[x + 1]!;
    base[x] = clamp(base[x]!, next - 0.45, next + 0.45);
  }
  const withLeftPad = applySpawnPad(base, TANK_SPAWN_X.player1);
  const withBothPads = applySpawnPad(withLeftPad, TANK_SPAWN_X.player2);

  const profile = Object.freeze({
    width: WORLD_BOUNDS.width,
    worldHeight: WORLD_BOUNDS.height,
    seed: normalized,
    style,
    generationVersion: TERRAIN_GENERATION_VERSION,
    surfaceY: Object.freeze(withBothPads),
  });
  if (sourceMaps.size >= 32) sourceMaps.delete(sourceMaps.keys().next().value!);
  sourceMaps.set(normalized, profile);
  return profile;
};

export const sampleSurfaceY = (terrain: TerrainProfile, x: number): number => {
  const sampleX = clamp(x, 0, terrain.width);
  const left = Math.floor(sampleX);
  const right = Math.min(terrain.width, left + 1);
  const fraction = sampleX - left;
  const leftY = terrain.surfaceY[left] ?? terrain.worldHeight;
  const rightY = terrain.surfaceY[right] ?? leftY;
  return leftY + (rightY - leftY) * fraction;
};
