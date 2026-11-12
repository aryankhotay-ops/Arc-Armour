// Browser-native SVG rasterization; no extra rendering dependencies or runtime image work.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { URL } from 'node:url';
import process from 'node:process';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  for (const id of ['golden-valley', 'desert-canyon', 'moonlit-alpine']) {
    const svg = await readFile(new URL(`../art/backgrounds/${id}.svg`, import.meta.url), 'utf8');
    await page.setContent(`<style>body{margin:0}svg{display:block}</style>${svg}`);
    await page.locator('svg').screenshot({ path: join(process.argv[2], `${id}.png`) });
  }
} finally {
  await browser.close();
}
