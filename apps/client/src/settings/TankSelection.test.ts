import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadTankSelection, DEFAULT_TANK_SELECTION, TANK_SELECTION_KEY } from './TankSelection';
afterEach(() => vi.unstubAllGlobals());
describe('safe independent tank preferences', () => {
  it.each(['null', 'bad', '{}', '[]', '["bad","bad"]', 'true'])(
    'defaults corrupt or unknown selection %s',
    (raw) => {
      expect(loadTankSelection({ getItem: () => raw })).toEqual(DEFAULT_TANK_SELECTION);
    },
  );
  it('retains valid choices for independent players and permits identical picks', () => {
    expect(loadTankSelection({ getItem: () => '["tiger-i","renault-ft17"]' })).toEqual([
      'tiger-i',
      'renault-ft17',
    ]);
    expect(loadTankSelection({ getItem: () => '["mark-v","mark-v"]' })).toEqual([
      'mark-v',
      'mark-v',
    ]);
    expect(loadTankSelection({ getItem: () => '["bad","panther"]' })).toEqual([
      'marigold',
      'panther',
    ]);
  });
  it('persists across scenes even if localStorage access is denied', async () => {
    vi.resetModules();
    vi.stubGlobal('window', {
      get localStorage() {
        throw Error('denied');
      },
    });
    const module = await import('./TankSelection');
    expect(module.currentTanks()).toEqual(DEFAULT_TANK_SELECTION);
    module.chooseTank(0, 'churchill');
    module.chooseTank(1, 'strv-103');
    expect(module.currentTanks()).toEqual(['churchill', 'strv-103']);
  });
  it('saves a versioned selection separately from audio and background preferences', async () => {
    vi.resetModules();
    const values = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => values.get(k) ?? null,
        setItem: (k: string, v: string) => values.set(k, v),
      },
    });
    const module = await import('./TankSelection');
    module.chooseTank(0, 'amx-13');
    expect(JSON.parse(values.get(TANK_SELECTION_KEY)!)).toEqual(['amx-13', 'cobalt']);
    expect(values.size).toBe(1);
  });
});
