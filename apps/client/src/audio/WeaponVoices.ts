import type { WeaponDefinition, WeaponIconKind } from '@artillery/content';

// Distinct original firing/explosion voices per weapon family, keyed by the weapon's icon
// glyph so new catalog entries automatically get a sensible voice. Pure data for the
// synthesizer in GameAudio.ts: no samples, no per-weapon code in the engine.
// With the full depot roster many weapons share a family; weaponVoiceFor() layers a
// deterministic per-weapon pitch/length variation on the family base so every one of the
// 190+ weapons is audibly distinct while staying inside its family's sonic character.
export interface ToneSpec {
  readonly type: OscillatorType;
  readonly frequency: number;
  /** Multiplier the pitch glides to across the note. */
  readonly slide: number;
  readonly duration: number;
  readonly volume: number;
  readonly delay?: number;
}

export interface NoiseSpec {
  readonly duration: number;
  readonly volume: number;
  /** Low-pass cutoff in Hz; low values rumble, high values crack. */
  readonly cutoff: number;
  readonly delay?: number;
}

export interface WeaponVoice {
  readonly fire: { readonly tones: readonly ToneSpec[]; readonly noise?: NoiseSpec };
  readonly explosion: { readonly tones: readonly ToneSpec[]; readonly noise: NoiseSpec };
}

const voice = (v: WeaponVoice): WeaponVoice => v;

export const WEAPON_VOICES: Readonly<Record<WeaponIconKind, WeaponVoice>> = Object.freeze({
  // Classic cannon: mid thump, mid boom.
  shell: voice({
    fire: {
      tones: [{ type: 'triangle', frequency: 160, slide: 0.45, duration: 0.18, volume: 0.5 }],
      noise: { duration: 0.12, volume: 0.4, cutoff: 1500 },
    },
    explosion: {
      tones: [{ type: 'sine', frequency: 95, slide: 0.4, duration: 0.5, volume: 0.6 }],
      noise: { duration: 0.5, volume: 0.55, cutoff: 900 },
    },
  }),
  // Mortar: deep slow launch, long low rumble.
  heavy: voice({
    fire: {
      tones: [{ type: 'triangle', frequency: 95, slide: 0.5, duration: 0.3, volume: 0.6 }],
      noise: { duration: 0.22, volume: 0.5, cutoff: 700 },
    },
    explosion: {
      tones: [{ type: 'sine', frequency: 62, slide: 0.42, duration: 0.85, volume: 0.7 }],
      noise: { duration: 0.85, volume: 0.65, cutoff: 480 },
    },
  }),
  // Cluster: pop launch; explosion gets a bright crackle for the bomblet carpet.
  cluster: voice({
    fire: {
      tones: [{ type: 'square', frequency: 300, slide: 0.65, duration: 0.1, volume: 0.32 }],
      noise: { duration: 0.08, volume: 0.3, cutoff: 2400 },
    },
    explosion: {
      tones: [
        { type: 'square', frequency: 180, slide: 0.55, duration: 0.2, volume: 0.3 },
        { type: 'square', frequency: 260, slide: 0.6, duration: 0.12, volume: 0.2, delay: 0.06 },
      ],
      noise: { duration: 0.3, volume: 0.45, cutoff: 2000 },
    },
  }),
  // Trident: three quick ascending chirps, matching the three-shell fan.
  trident: voice({
    fire: {
      tones: [
        { type: 'triangle', frequency: 330, slide: 0.7, duration: 0.09, volume: 0.3 },
        { type: 'triangle', frequency: 392, slide: 0.7, duration: 0.09, volume: 0.3, delay: 0.07 },
        { type: 'triangle', frequency: 494, slide: 0.7, duration: 0.09, volume: 0.3, delay: 0.14 },
      ],
      noise: { duration: 0.1, volume: 0.22, cutoff: 1800 },
    },
    explosion: {
      tones: [{ type: 'sine', frequency: 130, slide: 0.5, duration: 0.3, volume: 0.42 }],
      noise: { duration: 0.28, volume: 0.4, cutoff: 1300 },
    },
  }),
  // Ricochet orb: springy wobble; GameAudio also plays a boing per actual bounce event.
  ricochet: voice({
    fire: {
      tones: [
        { type: 'sine', frequency: 420, slide: 1.6, duration: 0.16, volume: 0.35 },
        { type: 'sine', frequency: 210, slide: 1.4, duration: 0.16, volume: 0.25 },
      ],
    },
    explosion: {
      tones: [{ type: 'sine', frequency: 170, slide: 0.35, duration: 0.4, volume: 0.45 }],
      noise: { duration: 0.35, volume: 0.42, cutoff: 1100 },
    },
  }),
  // Skyburst: airy rising whistle; huge soft airborne whump with little ground noise.
  airburst: voice({
    fire: {
      tones: [{ type: 'sine', frequency: 500, slide: 2.1, duration: 0.3, volume: 0.3 }],
    },
    explosion: {
      tones: [
        { type: 'sine', frequency: 150, slide: 0.55, duration: 0.6, volume: 0.55 },
        { type: 'sine', frequency: 300, slide: 0.6, duration: 0.35, volume: 0.3, delay: 0.03 },
      ],
      noise: { duration: 0.6, volume: 0.35, cutoff: 650 },
    },
  }),
  // Burrower: grinding low buzz on firing; muffled underground eruption.
  drill: voice({
    fire: {
      tones: [{ type: 'sawtooth', frequency: 130, slide: 0.75, duration: 0.25, volume: 0.35 }],
      noise: { duration: 0.2, volume: 0.3, cutoff: 950 },
    },
    explosion: {
      tones: [{ type: 'sine', frequency: 55, slide: 0.5, duration: 0.8, volume: 0.65 }],
      noise: { duration: 0.7, volume: 0.5, cutoff: 380 },
    },
  }),
  // Landbreaker: slow heave; the deepest, longest quake of the arsenal.
  crater: voice({
    fire: {
      tones: [{ type: 'triangle', frequency: 80, slide: 0.55, duration: 0.35, volume: 0.55 }],
      noise: { duration: 0.3, volume: 0.45, cutoff: 500 },
    },
    explosion: {
      tones: [
        { type: 'sine', frequency: 48, slide: 0.45, duration: 1.1, volume: 0.7 },
        { type: 'sine', frequency: 96, slide: 0.4, duration: 0.6, volume: 0.35, delay: 0.08 },
      ],
      noise: { duration: 1.0, volume: 0.6, cutoff: 320 },
    },
  }),
  // Needle dart: thin fast zip; small sharp snap.
  dart: voice({
    fire: {
      tones: [{ type: 'sawtooth', frequency: 950, slide: 0.35, duration: 0.09, volume: 0.26 }],
    },
    explosion: {
      tones: [{ type: 'square', frequency: 240, slide: 0.5, duration: 0.12, volume: 0.3 }],
      noise: { duration: 0.14, volume: 0.38, cutoff: 3200 },
    },
  }),
  // Time capsule: two-note mechanical latch; GameAudio ticks while it is stuck.
  timer: voice({
    fire: {
      tones: [
        { type: 'square', frequency: 523, slide: 1, duration: 0.07, volume: 0.25 },
        { type: 'square', frequency: 659, slide: 1, duration: 0.07, volume: 0.25, delay: 0.09 },
      ],
    },
    explosion: {
      tones: [{ type: 'sine', frequency: 85, slide: 0.42, duration: 0.6, volume: 0.6 }],
      noise: { duration: 0.55, volume: 0.55, cutoff: 700 },
    },
  }),
  // Forking star: shimmering chord; explosion keeps a bright musical edge.
  fork: voice({
    fire: {
      tones: [
        { type: 'triangle', frequency: 440, slide: 1.35, duration: 0.2, volume: 0.27 },
        { type: 'triangle', frequency: 554, slide: 1.35, duration: 0.2, volume: 0.22, delay: 0.02 },
        { type: 'triangle', frequency: 660, slide: 1.35, duration: 0.2, volume: 0.18, delay: 0.04 },
      ],
    },
    explosion: {
      tones: [
        { type: 'sine', frequency: 140, slide: 0.5, duration: 0.35, volume: 0.4 },
        { type: 'triangle', frequency: 560, slide: 0.7, duration: 0.18, volume: 0.2, delay: 0.02 },
      ],
      noise: { duration: 0.3, volume: 0.4, cutoff: 1500 },
    },
  }),
  // Rail punch: instant electric crack with a metallic ring; terse hard burst.
  rail: voice({
    fire: {
      tones: [
        { type: 'sawtooth', frequency: 1800, slide: 0.12, duration: 0.12, volume: 0.3 },
        { type: 'sine', frequency: 880, slide: 0.9, duration: 0.25, volume: 0.18, delay: 0.03 },
      ],
      noise: { duration: 0.07, volume: 0.42, cutoff: 5200 },
    },
    explosion: {
      tones: [{ type: 'square', frequency: 320, slide: 0.4, duration: 0.14, volume: 0.32 }],
      noise: { duration: 0.18, volume: 0.45, cutoff: 2600 },
    },
  }),
});

/** Deterministic 32-bit hash of a weapon id; stable across sessions and platforms. */
const hashId = (id: string): number => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** Uniform [0,1) derived from a weapon id and a salt. */
const unit = (id: string, salt: number): number => ((hashId(id) + salt * 0x9e3779b9) >>> 8) / 16777216;

const varyTone = (tone: ToneSpec, id: string, salt: number): ToneSpec => ({
  ...tone,
  // ±18% pitch and ±15% length. Enough to tell weapons apart, small enough to keep the
  // family character (a drill still grinds, a rail still cracks).
  frequency: tone.frequency * (0.82 + unit(id, salt) * 0.36),
  duration: tone.duration * (0.85 + unit(id, salt + 1) * 0.3),
});

const varyNoise = (noise: NoiseSpec, id: string, salt: number): NoiseSpec => ({
  ...noise,
  cutoff: noise.cutoff * (0.8 + unit(id, salt) * 0.4),
  duration: noise.duration * (0.85 + unit(id, salt + 1) * 0.3),
});

const voiceCache = new Map<string, WeaponVoice>();

/**
 * The weapon's actual voice: the family base from WEAPON_VOICES with a deterministic
 * per-weapon pitch/length/filter variation. Same weapon id always sounds the same; every
 * weapon id sounds different, even inside one family. Pure data derivation — cached, no
 * audio objects are created here.
 */
export const weaponVoiceFor = (weapon: Pick<WeaponDefinition, 'id' | 'icon'>): WeaponVoice => {
  const cached = voiceCache.get(weapon.id);
  if (cached !== undefined) return cached;
  const base = WEAPON_VOICES[weapon.icon];
  const derived: WeaponVoice = {
    fire: {
      tones: base.fire.tones.map((tone, i) => varyTone(tone, weapon.id, i * 2)),
      ...(base.fire.noise === undefined ? {} : { noise: varyNoise(base.fire.noise, weapon.id, 20) }),
    },
    explosion: {
      tones: base.explosion.tones.map((tone, i) => varyTone(tone, weapon.id, 40 + i * 2)),
      noise: varyNoise(base.explosion.noise, weapon.id, 60),
    },
  };
  voiceCache.set(weapon.id, derived);
  return derived;
};
