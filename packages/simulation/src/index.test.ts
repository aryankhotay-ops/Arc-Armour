import { describe, expect, it } from 'vitest';

import { SIMULATION_HZ, SIMULATION_STEP_SECONDS, WORLD_BOUNDS } from './index';

describe('simulation foundation', () => {
  it('defines a stable 60 Hz world contract', () => {
    expect(SIMULATION_HZ).toBe(60);
    expect(SIMULATION_STEP_SECONDS).toBeCloseTo(1 / 60, 12);
    expect(WORLD_BOUNDS).toEqual({ width: 3200, height: 1800 });
  });
});
