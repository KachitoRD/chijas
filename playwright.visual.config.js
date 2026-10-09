import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";

export default defineConfig({
  ...base,
  testIgnore: [],
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  projects: [
    { name: "seed-emulators", testMatch: /visual-seed\.setup\.js/ },
    {
      name: "visual-seeded",
      testMatch: /(?:visual-seeded|obs-control|tipster-workspace)\.spec\.js/,
      dependencies: ["seed-emulators"],
      use: { browserName: "chromium", headless: false, launchOptions: { slowMo: 1000 } }
    }
  ]
});
