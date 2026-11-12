// Local-game polish continuation: preferences affect presentation only, never combat rules.
// Keep saved data versioned and tolerate unavailable/corrupt browser storage.
export interface LocalSettings {
  readonly trajectoryPreview: boolean;
  readonly screenShake: boolean;
  /** Overall loudness, 0..1. Audio is presentation-only and never drives gameplay. */
  readonly masterVolume: number;
  readonly musicVolume: number;
  readonly effectsVolume: number;
  readonly muted: boolean;
}

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SETTINGS_STORAGE_KEY = 'arc-and-armor.settings.v1';
export const DEFAULT_SETTINGS: LocalSettings = {
  trajectoryPreview: true,
  screenShake: true,
  masterVolume: 0.8,
  musicVolume: 0.55,
  effectsVolume: 0.8,
  muted: false,
};

const booleanOf = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

/** Volumes from older/corrupt saves clamp into 0..1 instead of breaking playback. */
const volumeOf = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

export function loadSettings(storage: SettingsStorage): LocalSettings {
  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    const saved: unknown = raw === null ? null : JSON.parse(raw);
    if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) {
      return { ...DEFAULT_SETTINGS };
    }
    const values = saved as Record<string, unknown>;
    return {
      trajectoryPreview: booleanOf(values.trajectoryPreview, DEFAULT_SETTINGS.trajectoryPreview),
      screenShake: booleanOf(values.screenShake, DEFAULT_SETTINGS.screenShake),
      masterVolume: volumeOf(values.masterVolume, DEFAULT_SETTINGS.masterVolume),
      musicVolume: volumeOf(values.musicVolume, DEFAULT_SETTINGS.musicVolume),
      effectsVolume: volumeOf(values.effectsVolume, DEFAULT_SETTINGS.effectsVolume),
      muted: booleanOf(values.muted, DEFAULT_SETTINGS.muted),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage: SettingsStorage, settings: LocalSettings): void {
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private browsing, denied storage or a full quota must not prevent a local match.
  }
}
