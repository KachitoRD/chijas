import { defineConfig, devices } from '@playwright/test';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const webServerPort = 5502;
const webServerUrl = `http://127.0.0.1:${webServerPort}`;

export default defineConfig({
  testDir: './e2e',
  testIgnore: /(?:visual-seeded|obs-control|tipster-workspace)\.spec\.js/,
  outputDir: join(tmpdir(), 'fijas-en-vivo-playwright', createHash('sha256').update(process.cwd()).digest('hex').slice(0, 16)),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: webServerUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices.chromium },
    },
    {
      name: 'firefox',
      use: { ...devices.firefox },
    },
    {
      name: 'webkit',
      use: { ...devices.webkit },
    },
  ],
  webServer: {
    command: 'node scripts/live-preview.js',
    url: webServerUrl,
    reuseExistingServer: false,
  },
});
