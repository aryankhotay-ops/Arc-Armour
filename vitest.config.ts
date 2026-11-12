import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    // Wide-map angle/power sweeps are CPU-heavy; avoid oversubscribing shared IDE/CI
    // hosts and mistaking contention for a 5-second individual-test timeout.
    maxWorkers: 2,
    // A full legal-angle/power sweep now simulates the 3200-wide map, not a tiny fixture.
    // Allow headroom on the shared host; all per-shot simulation limits remain enforced.
    testTimeout: 20_000,
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
