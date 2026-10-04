import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5500',
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
    command: 'npx --yes http-server . -p 5500 -c-1',
    url: 'http://localhost:5500',
    reuseExistingServer: !process.env.CI,
  },
});
