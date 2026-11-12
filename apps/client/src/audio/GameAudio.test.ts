import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WEAPON_CATALOG } from '@artillery/content';
import { GameEngine, SIMULATION_STEP_SECONDS as STEP } from '@artillery/simulation';

import { GameAudio } from './GameAudio';
import { WEAPON_VOICES, weaponVoiceFor } from './WeaponVoices';

// A recording WebAudio double: enough surface for GameAudio, plus a log of scheduled nodes
// so tests can assert when sound is (not) produced without real hardware.
interface ScheduledNode {
  kind: 'oscillator' | 'noise';
  type?: OscillatorType;
  frequency?: number;
  startAt: number;
}

class FakeParam {
  public value = 0;
  public setValueAtTime(value: number): void {
    this.value = value;
  }
  public exponentialRampToValueAtTime(): void {}
  public linearRampToValueAtTime(): void {}
  public setTargetAtTime(value: number): void {
    this.value = value;
  }
  public cancelScheduledValues(): void {}
}

class FakeNode {
  public connections: unknown[] = [];
  public connect(node: unknown): unknown {
    this.connections.push(node);
    return node;
  }
  public disconnect(): void {}
}

class FakeAudioContext {
  public static created = 0;
  public static scheduled: ScheduledNode[] = [];
  public state: AudioContextState = 'running';
  public currentTime = 0;
  public sampleRate = 48000;
  public destination = new FakeNode();
  public resumed = 0;
  public constructor() {
    FakeAudioContext.created += 1;
    FakeAudioContext.latest = this;
  }
  public static latest: FakeAudioContext | undefined;
  public resume(): Promise<void> {
    this.resumed += 1;
    this.state = 'running';
    return Promise.resolve();
  }
  public close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }
  public createGain(): unknown {
    return Object.assign(new FakeNode(), { gain: new FakeParam() });
  }
  public createStereoPanner(): unknown {
    return Object.assign(new FakeNode(), { pan: new FakeParam() });
  }
  public createBiquadFilter(): unknown {
    return Object.assign(new FakeNode(), { type: 'lowpass', frequency: new FakeParam() });
  }
  public createOscillator(): unknown {
    const node = Object.assign(new FakeNode(), {
      type: 'sine' as OscillatorType,
      frequency: new FakeParam(),
      onended: undefined,
      start: (at: number) => {
        FakeAudioContext.scheduled.push({
          kind: 'oscillator',
          type: node.type,
          frequency: node.frequency.value,
          startAt: at,
        });
      },
      stop: () => {},
    });
    node.frequency.setValueAtTime = (value: number) => {
      node.frequency.value = value;
    };
    return node;
  }
  public createBuffer(_channels: number, length: number): unknown {
    return { getChannelData: () => new Float32Array(length) };
  }
  public createBufferSource(): unknown {
    return Object.assign(new FakeNode(), {
      buffer: null,
      onended: undefined,
      start: (at: number) => {
        FakeAudioContext.scheduled.push({ kind: 'noise', startAt: at });
      },
    });
  }
}

const SETTINGS = { muted: false, masterVolume: 0.8, musicVolume: 0.5, effectsVolume: 0.8 };
const quietFrame = {
  paused: false,
  phase: 'aiming',
  projectiles: [],
  activeDistance: 0,
  activeAngle: 45,
  movedThisFrame: false,
};

const newAudio = (settings = SETTINGS): { audio: GameAudio; engine: GameEngine } => {
  const engine = new GameEngine({ wind: 0 });
  return { audio: new GameAudio(settings, (id) => engine.weapon(id)), engine };
};

const cuesSince = (before: number): ScheduledNode[] => FakeAudioContext.scheduled.slice(before);

beforeEach(() => {
  FakeAudioContext.created = 0;
  FakeAudioContext.scheduled = [];
  // Unit tests run without a DOM; GameAudio only touches window.AudioContext at unlock time.
  (globalThis as { window?: unknown }).window ??= globalThis;
  (window as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
});

afterEach(() => {
  delete (window as { AudioContext?: unknown }).AudioContext;
});

describe('autoplay compliance', () => {
  it('creates no AudioContext and plays nothing before a user gesture', () => {
    const { audio, engine } = newAudio();
    expect(audio.state).toBe('locked');
    engine.fire();
    audio.handleEvents(engine.drainEvents());
    audio.update({ ...quietFrame, phase: 'projectile', projectiles: engine.state.projectiles });
    expect(FakeAudioContext.created).toBe(0);
    expect(FakeAudioContext.scheduled).toEqual([]);
  });

  it('unlock() constructs one context, reuses it, and resumes a suspension', () => {
    const { audio } = newAudio();
    audio.unlock();
    audio.unlock();
    expect(FakeAudioContext.created).toBe(1);
    expect(audio.state).toBe('running');
    FakeAudioContext.latest!.state = 'suspended';
    audio.unlock();
    expect(FakeAudioContext.latest!.resumed).toBeGreaterThan(0);
  });

  it('skips cues that arrived while locked instead of queueing a late barrage', () => {
    const { audio, engine } = newAudio();
    engine.fire();
    audio.handleEvents(engine.drainEvents());
    audio.unlock();
    expect(audio.playedCueCounts.fired).toBe(0);
  });

  it('survives a missing AudioContext API without affecting the caller', () => {
    delete (window as { AudioContext?: unknown }).AudioContext;
    const { audio, engine } = newAudio();
    audio.unlock();
    engine.fire();
    expect(() => audio.handleEvents(engine.drainEvents())).not.toThrow();
    expect(audio.state).toBe('locked');
  });
});

describe('distinct weapon voices from real combat events', () => {
  it('gives every catalog weapon its own firing and explosion voice data', () => {
    const fires = new Set(WEAPON_CATALOG.map((w) => JSON.stringify(weaponVoiceFor(w).fire)));
    const booms = new Set(WEAPON_CATALOG.map((w) => JSON.stringify(weaponVoiceFor(w).explosion)));
    expect(fires.size).toBe(WEAPON_CATALOG.length);
    expect(booms.size).toBe(WEAPON_CATALOG.length);
  });

  it('derives per-weapon variation deterministically and inside the family character', () => {
    for (const weapon of WEAPON_CATALOG) {
      const voice = weaponVoiceFor(weapon);
      expect(weaponVoiceFor(weapon)).toEqual(voice); // stable across calls
      const base = WEAPON_VOICES[weapon.icon];
      voice.fire.tones.forEach((tone, i) => {
        const source = base.fire.tones[i]!;
        expect(tone.type).toBe(source.type); // same oscillator family
        expect(tone.frequency).toBeGreaterThanOrEqual(source.frequency * 0.8);
        expect(tone.frequency).toBeLessThanOrEqual(source.frequency * 1.2);
      });
    }
  });

  it.each(WEAPON_CATALOG.map((w) => w.id))('plays %s shots through its own voice', (weaponId) => {
    const { audio, engine } = newAudio();
    audio.unlock();
    engine.selectWeapon(weaponId);
    engine.setAim(45, 0.9);
    engine.fire();
    const before = FakeAudioContext.scheduled.length;
    audio.handleEvents(engine.drainEvents());
    const voice = weaponVoiceFor(engine.weapon(weaponId));
    const played = cuesSince(before);
    const tones = played.filter((node) => node.kind === 'oscillator');
    // Family voice tones first, then the shared 88Hz muzzle-thump layer under every weapon.
    expect(tones.map((node) => node.frequency)).toEqual([
      ...voice.fire.tones.map((tone) => tone.frequency),
      88,
    ]);
    // Family noise (when defined) plus the shared muzzle pressure pop.
    expect(played.filter((node) => node.kind === 'noise')).toHaveLength(
      (voice.fire.noise === undefined ? 0 : 1) + 1,
    );
    expect(audio.playedCueCounts.fired).toBe(1);
  });

  it('plays explosion, terrain and damage layers from a resolved real shot', () => {
    const { audio, engine } = newAudio();
    audio.unlock();
    engine.fire();
    const events = [];
    for (let tick = 0; tick < 1800 && engine.state.turnNumber === 1; tick++) {
      engine.update(STEP);
      events.push(...engine.drainEvents());
    }
    audio.handleEvents(events);
    expect(audio.playedCueCounts.explosions).toBeGreaterThan(0);
    expect(events.some((event) => event.type === 'terrain-deformed')).toBe(true);
  });
});

describe('continuous layers and match outcomes', () => {
  it('plays victory and draw endings differently', () => {
    const { audio } = newAudio();
    audio.unlock();
    const before = FakeAudioContext.scheduled.length;
    audio.handleEvents([{ type: 'match-ended', winnerId: 'player1' }]);
    const win = cuesSince(before).map((node) => node.frequency);
    const beforeDraw = FakeAudioContext.scheduled.length;
    audio.handleEvents([{ type: 'match-ended', winnerId: undefined }]);
    const draw = cuesSince(beforeDraw).map((node) => node.frequency);
    expect(win.length).toBeGreaterThan(0);
    expect(draw.length).toBeGreaterThan(0);
    expect(win).not.toEqual(draw);
    expect(Math.max(...draw.map(Number))).toBeLessThan(Math.max(...win.map(Number)));
  });

  it('schedules background music on the audio clock and freezes while paused', () => {
    const { audio } = newAudio();
    audio.unlock();
    audio.update(quietFrame);
    const scheduled = FakeAudioContext.scheduled.length;
    expect(scheduled).toBeGreaterThan(0);
    audio.setPaused(true);
    audio.update({ ...quietFrame, paused: true });
    expect(FakeAudioContext.scheduled.length).toBe(scheduled);
  });

  it('is fully silent while muted and resumes when unmuted', () => {
    const { audio, engine } = newAudio({ ...SETTINGS, muted: true });
    audio.unlock();
    expect(audio.state).toBe('muted');
    engine.fire();
    const events = engine.drainEvents();
    audio.handleEvents(events);
    audio.update({ ...quietFrame, phase: 'projectile', projectiles: engine.state.projectiles });
    expect(FakeAudioContext.scheduled).toEqual([]);
    audio.applySettings(SETTINGS);
    audio.playWeaponSelect();
    expect(FakeAudioContext.scheduled.length).toBeGreaterThan(0);
  });

  it('never mutates engine state, events, or projectiles', () => {
    const { audio, engine } = newAudio();
    audio.unlock();
    engine.fire();
    const events = engine.drainEvents();
    const eventsSnapshot = JSON.stringify(events);
    for (let tick = 0; tick < 30; tick++) {
      const stateSnapshot = JSON.stringify(engine.state);
      audio.handleEvents(events);
      audio.update({
        ...quietFrame,
        phase: engine.state.phase,
        projectiles: engine.state.projectiles,
      });
      expect(JSON.stringify(engine.state)).toBe(stateSnapshot);
      engine.update(STEP);
    }
    expect(JSON.stringify(events)).toBe(eventsSnapshot);
  });

  it('plays fuse ticks for a stuck charge exactly on authoritative quarter seconds', () => {
    const { audio, engine } = newAudio();
    audio.unlock();
    const base = engine.state.tanks[0];
    const makeStuck = (fuseRemaining: number) => ({
      id: 9,
      shotId: 1,
      ownerId: base.playerId,
      weaponId: 'time-capsule',
      generation: 0,
      x: 500,
      y: 500,
      previousX: 500,
      previousY: 500,
      velocityX: 0,
      velocityY: 0,
      ageSeconds: 1,
      radius: 7,
      gravityScale: 1,
      windScale: 1,
      bouncesRemaining: 0,
      hasSpawned: false,
      mode: 'stuck' as const,
      fuseRemaining,
      struckTankId: undefined,
      stuckLocalX: 0,
      stuckLocalY: 0,
      drillTargetY: undefined,
      ignoredTankId: undefined,
      tankArmSeconds: 0,
      damageScale: 1,
      blastScale: 1,
      terrainScale: 1,
    });
    const before = FakeAudioContext.scheduled.length;
    audio.update({ ...quietFrame, projectiles: [makeStuck(1.4)] });
    audio.update({ ...quietFrame, projectiles: [makeStuck(1.38)] });
    const afterSameTick = FakeAudioContext.scheduled.length - before;
    audio.update({ ...quietFrame, projectiles: [makeStuck(1.2)] });
    expect(FakeAudioContext.scheduled.length - before).toBeGreaterThan(afterSameTick);
  });
});
