import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// Explicit cross-engine gate, separate from the complete Chromium gameplay regression.
// Install engines: pnpm exec playwright install chromium firefox webkit
export default defineConfig({
  ...base,
  testMatch: 'responsive.spec.ts',
  outputDir: 'test-results/responsive-engines',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
