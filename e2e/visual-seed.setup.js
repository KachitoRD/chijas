import { test as setup } from "@playwright/test";
import { seedVisualAccounts } from "./helpers/visual-seed.js";

setup("crear o asegurar las tres cuentas en Firebase Emulators", async ({ request }) => {
  await seedVisualAccounts(request);
});
