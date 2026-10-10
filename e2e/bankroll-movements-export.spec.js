import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { bankrollFixture, loginLedger } from "./helpers/bankroll-fixture.js";

test.use({ baseURL: "http://127.0.0.1:5502" });

test("exporta CSV privado de la moneda seleccionada en SPA y standalone y bloquea apertura ausente", async ({ page, request }) => {
  const fixture = await bankrollFixture(request);
  const opening = new Date("2026-10-10T10:00:00Z");
  try {
    await fixture.write(`users/${fixture.uid}/bankrollAccounts/PEN`, { currency: "PEN", initialMinorUnits: 0, created_at: opening });
    await fixture.write(`users/${fixture.uid}/bankrollAccounts/PEN/movements/deposit`, {
      type: "deposit", amountMinorUnits: 1234, note: '=HYPERLINK("private")', created_at: new Date("2026-10-10T11:00:00Z")
    });
    await loginLedger(page, fixture);
    await page.getByTestId("bankroll-tab").click();
    const button = page.getByTestId("bankroll-export-movements");
    await expect(button).toBeEnabled();
    let downloaded = page.waitForEvent("download");
    await button.click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe("bankroll-movimientos-PEN.csv");
    const csv = await readFile(await download.path(), "utf8");
    expect(csv).toContain('"Depósito","PEN","12.34","12.34"');
    expect(csv).toContain(`"'=HYPERLINK(""private"")"`);
    expect(csv).not.toContain(fixture.email);
    await expect(page.getByTestId("bankroll-export-status")).toContainText("privado");
    await page.getByTestId("bankroll-currency").selectOption("USD");
    await expect(page.getByTestId("bankroll-account-status")).toContainText("Sin apertura");
    await expect(button).toBeDisabled();
    await expect(page.getByTestId("bankroll-export-status")).toBeEmpty();
    await page.goto("/tipster-dashboard.html");
    await page.getByTestId("bankroll-tab").click();
    await expect(button).toBeEnabled();
    downloaded = page.waitForEvent("download");
    await button.focus();
    await page.keyboard.press("Enter");
    expect((await downloaded).suggestedFilename()).toBe("bankroll-movimientos-PEN.csv");
    await fixture.write(`legalAcceptances/${fixture.uid}/versions/2026-10-03`, { age_confirmed: false });
    await expect(button).toBeDisabled();
    await expect(page.getByTestId("bankroll-export-status")).toBeEmpty();
  } finally {
    await page.close();
    await fixture.cleanup();
  }
});
