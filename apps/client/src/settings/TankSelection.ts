import { tankModelId, type TankModelId } from '@artillery/content';
import type { SettingsStorage } from './LocalSettings';

// Picks apply at new-match creation, never swap hull/collision underneath a live shot.
export type TankSelection = readonly [TankModelId, TankModelId];
export const TANK_SELECTION_KEY = 'arc-and-armor.tanks.v1';
export const DEFAULT_TANK_SELECTION: TankSelection = ['marigold', 'cobalt'];
export function loadTankSelection(storage: Pick<SettingsStorage, 'getItem'>): TankSelection {
  try {
    const raw: unknown = JSON.parse(storage.getItem(TANK_SELECTION_KEY) ?? 'null');
    if (!Array.isArray(raw) || raw.length !== 2) return [...DEFAULT_TANK_SELECTION];
    return [tankModelId(raw[0], 'marigold'), tankModelId(raw[1], 'cobalt')];
  } catch {
    return [...DEFAULT_TANK_SELECTION];
  }
}
let session: TankSelection | undefined;
export function currentTanks(): TankSelection {
  if (session !== undefined) return session;
  try {
    session = loadTankSelection(window.localStorage);
  } catch {
    session = [...DEFAULT_TANK_SELECTION];
  }
  return session;
}
export function chooseTank(player: number, value: unknown): TankSelection {
  const before = currentTanks();
  session =
    player === 0
      ? [tankModelId(value, 'marigold'), before[1]]
      : [before[0], tankModelId(value, 'cobalt')];
  try {
    window.localStorage.setItem(TANK_SELECTION_KEY, JSON.stringify(session));
  } catch {
    /* Denied storage still preserves both picks across scenes this session. */
  }
  return session;
}
