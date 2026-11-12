import { defineConfig, devices } from '@playwright/test';

// Normal user arsenal, no fixture override. Separate port prevents stale legacy Vite state.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'originalDeluxe.spec.ts',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4184', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'pnpm --filter @artillery/client dev --host 127.0.0.1 --port 4184 --strictPort',
    url: 'http://127.0.0.1:4184',
    reuseExistingServer: false,
  },
});
