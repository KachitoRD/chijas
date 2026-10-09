import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";
export default defineConfig({
  ...base,
  reporter: "list",
  use: { ...base.use, baseURL: "http://localhost:5510" },
  webServer: { command: "npx --no-install http-server . -p 5510 -c-1", url: "http://localhost:5510", reuseExistingServer: true }
});
