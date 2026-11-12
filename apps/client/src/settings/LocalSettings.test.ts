import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  loadSettings,
  saveSettings,
  type SettingsStorage,
} from './LocalSettings';

const storageWith = (raw: string | null): SettingsStorage => ({
  getItem: () => raw,
  setItem: () => {},
});

describe('local visual and audio settings', () => {
  it('uses defaults for a new device', () => {
    expect(loadSettings(storageWith(null))).toEqual(DEFAULT_SETTINGS);
  });

  it('restores saved preferences without accepting unknown fields', () => {
    expect(
      loadSettings(
        storageWith(
          '{"trajectoryPreview":false,"screenShake":false,"muted":true,"masterVolume":0.3,"musicVolume":0,"effectsVolume":1,"health":999}',
        ),
      ),
    ).toEqual({
      trajectoryPreview: false,
      screenShake: false,
      muted: true,
      masterVolume: 0.3,
      musicVolume: 0,
      effectsVolume: 1,
    });
  });

  it.each(['invalid json', 'null', '[]', 'true', '42', '"text"'])(
    'handles invalid saved data: %s',
    (raw) => {
      expect(loadSettings(storageWith(raw))).toEqual(DEFAULT_SETTINGS);
    },
  );

  it('defaults invalid fields independently', () => {
    expect(loadSettings(storageWith('{"trajectoryPreview":false,"screenShake":"false"}'))).toEqual({
      ...DEFAULT_SETTINGS,
      trajectoryPreview: false,
    });
    expect(loadSettings(storageWith('{"screenShake":false,"muted":1}'))).toEqual({
      ...DEFAULT_SETTINGS,
      screenShake: false,
    });
  });

  it('clamps out-of-range or non-numeric volumes from older saves', () => {
    expect(
      loadSettings(
        storageWith('{"masterVolume":7,"musicVolume":-2,"effectsVolume":"loud","muted":false}'),
      ),
    ).toEqual({ ...DEFAULT_SETTINGS, masterVolume: 1, musicVolume: 0 });
    expect(loadSettings(storageWith('{"masterVolume":null}')).masterVolume).toBe(
      DEFAULT_SETTINGS.masterVolume,
    );
    expect(loadSettings(storageWith('{"masterVolume":1e999}')).masterVolume).toBe(
      DEFAULT_SETTINGS.masterVolume,
    );
  });

  it('uses an isolated copy of the defaults', () => {
    expect(loadSettings(storageWith(null))).not.toBe(DEFAULT_SETTINGS);
  });

  it('writes versioned data that can be read back', () => {
    const values = new Map<string, string>();
    const storage: SettingsStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    };
    const settings = {
      ...DEFAULT_SETTINGS,
      trajectoryPreview: false,
      muted: true,
      effectsVolume: 0.35,
    };
    saveSettings(storage, settings);
    expect(values.has(SETTINGS_STORAGE_KEY)).toBe(true);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it('tolerates denied storage and quota failures', () => {
    const denied: SettingsStorage = {
      getItem: () => {
        throw new Error('Storage denied');
      },
      setItem: () => {
        throw new Error('Quota exceeded');
      },
    };
    expect(loadSettings(denied)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(denied, DEFAULT_SETTINGS)).not.toThrow();
  });
});
