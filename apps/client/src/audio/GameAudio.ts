import type { WeaponDefinition, WeaponId } from '@artillery/content';
import { WORLD_BOUNDS, type CombatEvent, type ProjectileState } from '@artillery/simulation';

import { weaponVoiceFor, type NoiseSpec, type ToneSpec } from './WeaponVoices';

// Original procedural audio: every cue is synthesized in the browser from the data in
// WeaponVoices.ts; there are no third-party samples or soundtrack assets.
//
// Boundaries, in order of importance:
// - Audio OBSERVES authoritative combat events and state copies. It never mutates the engine,
//   never delays shot resolution, and is never awaited by the game loop, so local play and a
//   future authoritative server see identical gameplay whether or not audio is running.
// - Browser autoplay: nothing plays until the user's first gesture unlocks the AudioContext.
//   Events arriving while locked are simply skipped — never queued for a late barrage.
// - All synthesis failures are swallowed; a broken audio stack cannot break the match.

export interface AudioUserState {
  readonly muted: boolean;
  readonly masterVolume: number;
  readonly musicVolume: number;
  readonly effectsVolume: number;
}

interface FrameState {
  readonly paused: boolean;
  readonly phase: string;
  readonly projectiles: readonly ProjectileState[];
  readonly activeDistance: number;
  readonly activeAngle: number;
  readonly movedThisFrame: boolean;
}

const MUSIC_STEP_SECONDS = 0.24;
/** Melody in A minor; held notes are presentation pacing only, nothing waits for them. */
const MUSIC_BASS = [55, 55, 41.2, 41.2, 49, 49, 36.71, 43.65];
const MUSIC_LEAD = [
  220, 0, 261.63, 329.63, 0, 246.94, 220, 0, 174.61, 0, 220, 261.63, 0, 196, 164.81, 0,
];

export class GameAudio {
  private context: AudioContext | undefined;
  private master: GainNode | undefined;
  private music: GainNode | undefined;
  private effects: GainNode | undefined;
  private unlocked = false;
  private settings: AudioUserState;
  private paused = false;
  private musicStep = 0;
  private nextMusicTime = 0;
  private flightLevel = 0;
  private movementLevel = 0;
  private aimLevel = 0;
  private lastAngle: number | undefined;
  private lastTick = new Map<number, number>();
  private readonly playedEvents = { fired: 0, explosions: 0 };

  public constructor(
    settings: AudioUserState,
    private readonly weaponOf: (id: WeaponId) => WeaponDefinition,
  ) {
    this.settings = settings;
  }

  /** Current public state for tests/UI: 'locked' until a user gesture starts playback. */
  public get state(): 'locked' | 'running' | 'muted' {
    if (!this.unlocked || this.context === undefined) return 'locked';
    return this.settings.muted ? 'muted' : 'running';
  }

  public get playedCueCounts(): { fired: number; explosions: number } {
    return { ...this.playedEvents };
  }

  /**
   * Called from real user input (pointer/key). Safe to call every time; only the first
   * successful call constructs the AudioContext, satisfying autoplay policies.
   */
  public unlock(): void {
    try {
      if (this.context === undefined) {
        const Constructor =
          window.AudioContext ??
          (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Constructor === undefined) return;
        this.context = new Constructor();
        this.master = this.context.createGain();
        this.music = this.context.createGain();
        this.effects = this.context.createGain();
        this.music.connect(this.master);
        this.effects.connect(this.master);
        // A gentle bus compressor glues stacked blasts together and lets single booms hit
        // harder without clipping. Guarded: a missing API simply falls back to a dry bus.
        if (typeof this.context.createDynamicsCompressor === 'function') {
          const compressor = this.context.createDynamicsCompressor();
          compressor.threshold.value = -16;
          compressor.knee.value = 22;
          compressor.ratio.value = 5;
          compressor.attack.value = 0.003;
          compressor.release.value = 0.22;
          this.master.connect(compressor);
          compressor.connect(this.context.destination);
        } else {
          this.master.connect(this.context.destination);
        }
        this.nextMusicTime = this.context.currentTime + 0.1;
        this.applySettings(this.settings);
      }
      if (this.context.state === 'suspended') void this.context.resume();
      this.unlocked = true;
    } catch {
      this.context = undefined;
    }
  }

  public applySettings(settings: AudioUserState): void {
    this.settings = settings;
    if (this.context === undefined || this.master === undefined) return;
    const now = this.context.currentTime;
    // Short ramps avoid clicks; audible volume = mute gate x master x channel.
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(settings.muted ? 0 : settings.masterVolume, now, 0.03);
    this.music?.gain.setTargetAtTime(settings.musicVolume * 0.5, now, 0.03);
    this.effects?.gain.setTargetAtTime(settings.effectsVolume, now, 0.03);
  }

  /** Mirrors the pause state: music and loops idle, and nothing accumulates while frozen. */
  public setPaused(paused: boolean): void {
    this.paused = paused;
  }

  public handleEvents(events: readonly CombatEvent[]): void {
    if (!this.audible()) return;
    for (const event of events) {
      switch (event.type) {
        case 'shot-fired': {
          const voice = weaponVoiceFor(this.weaponOf(event.weaponId));
          const pan = this.panFor(event.x);
          this.playSpec(voice.fire.tones, voice.fire.noise, pan);
          // Muzzle layers under every family voice: a low barrel thump plus a short
          // pressure pop so launches feel like ordnance leaving a tube, not UI chirps.
          this.tone(
            { type: 'sine', frequency: 88, slide: 0.55, duration: 0.17, volume: 0.3 },
            pan,
          );
          this.noise({ duration: 0.06, volume: 0.2, cutoff: 3400 }, pan);
          this.playedEvents.fired += 1;
          break;
        }
        case 'explosion': {
          const weapon = this.weaponOf(event.weaponId);
          const voice = weaponVoiceFor(weapon);
          const pan = this.panFor(event.x);
          // Boom weight follows the ACTUAL blast: a 190-unit nuke rumbles longer and deeper
          // than a 25-unit pellet from the same family. Bounded so stacked bursts can't clip.
          const size = Math.min(1.6, Math.max(0.5, event.blastRadius / 80));
          this.playSpec(
            voice.explosion.tones.map((tone) => ({
              ...tone,
              frequency: tone.frequency / (0.7 + size * 0.45),
              duration: tone.duration * (0.7 + size * 0.5),
              volume: Math.min(0.75, tone.volume * (0.65 + size * 0.45)),
            })),
            {
              ...voice.explosion.noise,
              duration: voice.explosion.noise.duration * (0.7 + size * 0.5),
              volume: Math.min(0.7, voice.explosion.noise.volume * (0.65 + size * 0.45)),
            },
            pan,
          );
          this.playedEvents.explosions += 1;
          // Physical weight layers shared by every voice, scaled by real blast size:
          // 1. An initial broadband CRACK gives the detonation its sharp onset.
          this.noise(
            { duration: 0.05 + size * 0.03, volume: Math.min(0.5, 0.24 + size * 0.18), cutoff: 6200 },
            pan,
          );
          // 2. A sub-bass thump (pitched drop ~70Hz -> ~34Hz) adds chest-feel body that
          //    the midrange family tones cannot carry on their own.
          this.tone(
            {
              type: 'sine',
              frequency: 46 + size * 26,
              slide: 0.5,
              duration: 0.28 + size * 0.3,
              volume: Math.min(0.62, 0.3 + size * 0.24),
            },
            pan,
          );
          // Terrain impact layer: ground-digging blasts add a separate earthen rumble.
          if (event.terrainRadius > 24) {
            this.noise(
              {
                duration: 0.4 + Math.min(0.5, event.terrainRadius / 240),
                volume: 0.3,
                cutoff: 260,
                delay: 0.04,
              },
              pan,
            );
          }
          break;
        }
        case 'projectile-bounced':
          // A thud with a springy overtone, not a cartoon slide-whistle on its own.
          this.tone(
            { type: 'sine', frequency: 120, slide: 0.7, duration: 0.1, volume: 0.26 },
            this.panFor(event.x),
          );
          this.tone(
            { type: 'sine', frequency: 300, slide: 1.8, duration: 0.11, volume: 0.17 },
            this.panFor(event.x),
          );
          this.noise({ duration: 0.05, volume: 0.14, cutoff: 1200 }, this.panFor(event.x));
          break;
        case 'projectile-spawned':
          this.tone(
            { type: 'triangle', frequency: 520, slide: 1.5, duration: 0.12, volume: 0.28 },
            this.panFor(event.x),
          );
          break;
        case 'projectile-stuck':
          this.tone(
            { type: 'square', frequency: 392, slide: 0.8, duration: 0.08, volume: 0.26 },
            this.panFor(event.x),
          );
          break;
        case 'projectile-drilling':
          this.noise({ duration: 0.3, volume: 0.3, cutoff: 800 }, this.panFor(event.x));
          break;
        case 'tank-damaged':
          // Damage reaction on top of the blast: clank for hits, heavier for direct/fall.
          this.tone({
            type: 'square',
            frequency: event.cause === 'fall' ? 110 : event.cause === 'direct-hit' ? 190 : 150,
            slide: 0.5,
            duration: 0.16,
            volume: Math.min(0.5, 0.22 + event.amount / 90),
          });
          this.noise({ duration: 0.1, volume: 0.25, cutoff: 2800, delay: 0.01 });
          break;
        case 'turn-started':
          this.tone({
            type: 'triangle',
            frequency: 330,
            slide: 1.25,
            duration: 0.14,
            volume: 0.22,
          });
          break;
        case 'tank-destroyed': {
          const pan = this.panFor(event.x);
          this.noise({ duration: 1.1, volume: 0.6, cutoff: 500 }, pan);
          this.tone(
            { type: 'sawtooth', frequency: 70, slide: 0.35, duration: 1.0, volume: 0.5 },
            pan,
          );
          this.tone(
            { type: 'sine', frequency: 45, slide: 0.5, duration: 1.3, volume: 0.55, delay: 0.1 },
            pan,
          );
          break;
        }
        case 'match-ended':
          // Victory/defeat identity for a shared-screen game: a rising resolution chord
          // for a winner, a slow falling line for a draw where both tanks are disabled.
          if (event.winnerId !== undefined) {
            [262, 330, 392, 523].forEach((frequency, index) =>
              this.tone({
                type: 'triangle',
                frequency,
                slide: 1,
                duration: 0.3,
                volume: 0.3,
                delay: index * 0.13,
              }),
            );
          } else {
            [220, 185, 147, 110].forEach((frequency, index) =>
              this.tone({
                type: 'sine',
                frequency,
                slide: 0.92,
                duration: 0.4,
                volume: 0.3,
                delay: index * 0.17,
              }),
            );
          }
          break;
      }
    }
  }

  /** One-shot UI cue for weapon selection; selection direction gives a subtle pitch change. */
  public playWeaponSelect(direction: 1 | -1 = 1): void {
    if (!this.audible()) return;
    this.tone({
      type: 'square',
      frequency: direction === 1 ? 440 : 392,
      slide: 1.12,
      duration: 0.05,
      volume: 0.18,
    });
  }

  public playMenuToggle(opened: boolean): void {
    if (!this.audible()) return;
    this.tone({
      type: 'triangle',
      frequency: opened ? 392 : 523,
      slide: opened ? 0.8 : 1.2,
      duration: 0.09,
      volume: 0.2,
    });
  }

  /** Per-frame continuous layers. Reads copies of state; outputs sound only. */
  public update(frame: FrameState): void {
    this.paused = frame.paused;
    if (this.context === undefined || !this.unlocked) return;
    this.scheduleMusic(frame.phase);
    if (!this.audible()) return;

    // Tank movement: a soft engine rattle while ground travel is actually happening.
    this.movementLevel = frame.movedThisFrame
      ? Math.min(1, this.movementLevel + 0.3)
      : Math.max(0, this.movementLevel - 0.2);
    if (this.movementLevel > 0.2 && Math.random() < 0.4) {
      this.noise({ duration: 0.06, volume: 0.1 * this.movementLevel, cutoff: 420 });
      if (Math.random() < 0.25)
        this.tone({
          type: 'triangle',
          frequency: 70,
          slide: 1.1,
          duration: 0.05,
          volume: 0.07 * this.movementLevel,
        });
    }

    // Barrel aiming: quiet servo ticks while the real aim angle is changing.
    if (this.lastAngle !== undefined) {
      const turning = Math.abs(frame.activeAngle - this.lastAngle);
      this.aimLevel = turning > 0.05 ? Math.min(1, this.aimLevel + 0.4) : 0;
      if (this.aimLevel > 0.3 && Math.random() < 0.5) {
        this.tone({
          type: 'square',
          frequency: 820 + (frame.activeAngle % 12) * 18,
          slide: 1,
          duration: 0.02,
          volume: 0.06,
        });
      }
    }
    this.lastAngle = frame.activeAngle;

    // Projectile flight: airy whistle following the fastest live shell; fuse ticks for stuck
    // charges. Both derive from authoritative projectile state copies each render frame.
    const flying = frame.projectiles.filter((p) => p.mode === 'flying');
    this.flightLevel =
      flying.length > 0 ? Math.min(1, this.flightLevel + 0.2) : Math.max(0, this.flightLevel - 0.3);
    const fastest = flying.reduce<ProjectileState | undefined>(
      (best, p) =>
        best === undefined ||
        Math.hypot(p.velocityX, p.velocityY) > Math.hypot(best.velocityX, best.velocityY)
          ? p
          : best,
      undefined,
    );
    if (fastest !== undefined && this.flightLevel > 0.1 && Math.random() < 0.65) {
      const speed = Math.hypot(fastest.velocityX, fastest.velocityY);
      this.tone(
        {
          type: 'sine',
          frequency: 340 + Math.min(900, speed * 0.85),
          slide: 0.96,
          duration: 0.07,
          volume: 0.07 * this.flightLevel,
        },
        this.panFor(fastest.x),
      );
    }
    for (const p of frame.projectiles) {
      if (p.mode !== 'stuck' || p.fuseRemaining === undefined) continue;
      const tick = Math.ceil(p.fuseRemaining * 4);
      if (this.lastTick.get(p.id) !== tick) {
        this.lastTick.set(p.id, tick);
        this.tone(
          { type: 'square', frequency: 1050, slide: 1, duration: 0.03, volume: 0.16 },
          this.panFor(p.x),
        );
      }
    }
    for (const id of this.lastTick.keys()) {
      if (!frame.projectiles.some((p) => p.id === id)) this.lastTick.delete(id);
    }
  }

  public destroy(): void {
    try {
      void this.context?.close();
    } catch {
      // Already closed or never created.
    }
    this.context = undefined;
    this.unlocked = false;
  }

  private audible(): boolean {
    return (
      this.unlocked &&
      !this.paused &&
      !this.settings.muted &&
      this.settings.masterVolume > 0 &&
      this.context !== undefined &&
      this.context.state === 'running'
    );
  }

  /** Original two-layer loop: low bass pulse plus a sparse lead; calmer while aiming. */
  private scheduleMusic(phase: string): void {
    const context = this.context;
    if (context === undefined || this.music === undefined) return;
    if (this.paused || this.settings.muted || phase === 'game-over') {
      // Keep the grid position but never schedule while frozen/muted/finished.
      this.nextMusicTime = Math.max(this.nextMusicTime, context.currentTime + 0.05);
      return;
    }
    // Schedule a short window ahead on WebAudio's own clock. Rendering stalls or heavy frames
    // do not shift gameplay: this timeline belongs to the audio hardware only.
    while (this.nextMusicTime < context.currentTime + 0.3) {
      const step = this.musicStep;
      const intense = phase === 'projectile';
      const bass = MUSIC_BASS[step % MUSIC_BASS.length]!;
      this.toneAt(this.music, this.nextMusicTime, {
        type: 'triangle',
        frequency: bass,
        slide: 0.99,
        duration: 0.22,
        volume: intense ? 0.4 : 0.3,
      });
      const lead = MUSIC_LEAD[step % MUSIC_LEAD.length]!;
      if (lead > 0 && step % 2 === 0) {
        this.toneAt(this.music, this.nextMusicTime + 0.02, {
          type: 'sine',
          frequency: lead,
          slide: 1.004,
          duration: 0.3,
          volume: intense ? 0.14 : 0.11,
        });
      }
      if (step % 4 === 0)
        this.noiseAt(this.music, this.nextMusicTime, {
          duration: 0.03,
          volume: 0.05,
          cutoff: 3000,
        });
      this.musicStep += 1;
      this.nextMusicTime += MUSIC_STEP_SECONDS;
    }
  }

  /** Stereo position from world X; subtle, so off-screen sounds stay audible. */
  private panFor(x: number): number {
    return Math.max(-0.8, Math.min(0.8, (x / WORLD_BOUNDS.width - 0.5) * 1.3));
  }

  private playSpec(tones: readonly ToneSpec[], noise: NoiseSpec | undefined, pan = 0): void {
    for (const spec of tones) this.tone(spec, pan);
    if (noise !== undefined) this.noise(noise, pan);
  }

  private tone(spec: ToneSpec, pan = 0): void {
    if (!this.audible() || this.effects === undefined || this.context === undefined) return;
    this.toneAt(this.effects, this.context.currentTime + (spec.delay ?? 0), spec, pan);
  }

  private noise(spec: NoiseSpec, pan = 0): void {
    if (!this.audible() || this.effects === undefined || this.context === undefined) return;
    this.noiseAt(this.effects, this.context.currentTime + (spec.delay ?? 0), spec, pan);
  }

  /**
   * Harmonic-rich replacements for the bare oscillator primitives. A plain sine/square
   * "beeps"; a short stack of decaying partials reads as a struck, resonating object.
   * Cached per type; guarded so a missing API (or the unit-test double) falls back to
   * the plain oscillator shape.
   */
  private readonly waves = new Map<OscillatorType, PeriodicWave | undefined>();
  private waveFor(type: OscillatorType): PeriodicWave | undefined {
    const context = this.context;
    if (context === undefined || typeof context.createPeriodicWave !== 'function')
      return undefined;
    if (!this.waves.has(type)) {
      const partials: Partial<Record<OscillatorType, number[]>> = {
        sine: [0, 1, 0.24, 0.1, 0.05, 0.022], // warm, slightly driven fundamental
        triangle: [0, 1, 0, 0.16, 0, 0.065, 0, 0.028], // mellow odd harmonics
        square: [0, 1, 0, 0.42, 0, 0.25, 0, 0.15, 0, 0.09], // rounded, less buzzy square
        sawtooth: [0, 1, 0.5, 0.33, 0.24, 0.18, 0.13, 0.1, 0.07], // softened saw
      };
      const imagValues = partials[type];
      try {
        this.waves.set(
          type,
          imagValues === undefined
            ? undefined
            : context.createPeriodicWave(
                new Float32Array(imagValues.length),
                Float32Array.from(imagValues),
              ),
        );
      } catch {
        this.waves.set(type, undefined);
      }
    }
    return this.waves.get(type);
  }

  private toneAt(destination: AudioNode, startAt: number, spec: ToneSpec, pan = 0): void {
    const context = this.context;
    if (context === undefined) return;
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = spec.type;
      const wave = this.waveFor(spec.type);
      if (wave !== undefined && typeof oscillator.setPeriodicWave === 'function') {
        oscillator.setPeriodicWave(wave);
      }
      const start = Math.max(startAt, context.currentTime);
      oscillator.frequency.setValueAtTime(Math.max(20, spec.frequency), start);
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(20, spec.frequency * spec.slide),
        start + spec.duration,
      );
      // Percussive envelope: near-instant attack, exponential ring-out instead of a
      // linear chop. The tail is what makes a cue sound physical rather than synthetic.
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(spec.volume, start + Math.min(0.008, spec.duration / 5));
      gain.gain.setTargetAtTime(0, start + spec.duration * 0.25, spec.duration * 0.3);
      // A downward lowpass sweep darkens the note as it decays, like a real impact.
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(
        Math.min(14000, Math.max(700, spec.frequency * 7)),
        start,
      );
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(300, spec.frequency * 1.6),
        start + spec.duration,
      );
      oscillator.connect(filter);
      filter.connect(gain);
      this.connectPanned(gain, destination, pan);
      oscillator.start(start);
      // Let the exponential tail breathe past the nominal duration before hard-stopping.
      oscillator.stop(start + spec.duration * 1.9 + 0.1);
      oscillator.onended = () => oscillator.disconnect();
    } catch {
      // A failed cue is dropped silently; gameplay continues.
    }
  }

  private noiseAt(destination: AudioNode, startAt: number, spec: NoiseSpec, pan = 0): void {
    const context = this.context;
    if (context === undefined) return;
    try {
      const start = Math.max(startAt, context.currentTime);
      const length = Math.max(1, Math.floor(context.sampleRate * spec.duration));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const channel = buffer.getChannelData(0);
      // Exponential decay with a soft two-sample average: closer to a real burst than
      // linearly faded white noise, with the harshest digital fizz smoothed out.
      let previous = 0;
      for (let i = 0; i < length; i++) {
        const sample = Math.random() * 2 - 1;
        channel[i] = ((sample + previous) / 2) * Math.exp((-4.4 * i) / length);
        previous = sample;
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      // The cutoff sweeps DOWN across the burst: bright crack first, dark rumble after,
      // which is how blast noise behaves in air instead of a static hiss band.
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(spec.cutoff, start);
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(60, spec.cutoff * 0.3),
        start + spec.duration,
      );
      const gain = context.createGain();
      gain.gain.setValueAtTime(spec.volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + spec.duration);
      source.connect(filter);
      filter.connect(gain);
      this.connectPanned(gain, destination, pan);
      source.start(start);
      source.onended = () => source.disconnect();
    } catch {
      // A failed cue is dropped silently; gameplay continues.
    }
  }

  private connectPanned(node: AudioNode, destination: AudioNode, pan: number): void {
    const context = this.context;
    if (context !== undefined && pan !== 0 && typeof context.createStereoPanner === 'function') {
      const panner = context.createStereoPanner();
      panner.pan.value = pan;
      node.connect(panner);
      panner.connect(destination);
    } else {
      node.connect(destination);
    }
  }
}
