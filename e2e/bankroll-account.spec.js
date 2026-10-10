import { test, expect } from "@playwright/test";
import { bankrollFixture, loginLedger } from "./helpers/bankroll-fixture.js";
import { bankrollAccountBalance, bankrollReportData, parseBankrollOpening } from "../bankroll.js";

test.use({ baseURL: "http://127.0.0.1:5502" });

test("cálculo conserva cero, monedas y frontera estricta de apertura", () => {
  expect(parseBankrollOpening("0", "PEN")).toBe(0);
  const account = { currency: "PEN", initialMinorUnits: 10000, created_at: new Date(1000) };
  const picks = [0, 1, 2, 3].map(i => ({ id: String(i), created_at: new Date(1000 + i),
    status: i === 1 ? "won" : "pending", odds: 2 }));
  const records = new Map([["0", { currency: "PEN", stakeMinorUnits: 99999 }],
    ["1", { currency: "PEN", stakeMinorUnits: 1000 }], ["2", { currency: "USD", stakeMinorUnits: 1000 }], ["3", null]]);
  expect(bankrollAccountBalance(account, [{ type: "withdrawal", amountMinorUnits: 20000 }], picks, records))
    .toMatchObject({ equity: -9000, available: -9000, profit: 1000, financialCount: 1, withoutAmount: 1 });
  records.delete("3");
  expect(() => bankrollAccountBalance(account, [], picks, records)).toThrow("Faltan importes");
});

test("el informe histórico conserva picks previos que el nuevo saldo excluye", () => {
  const created_at = new Date("2025-01-15T12:00:00Z");
  const pick = { id: "historical", created_at, event_date: { toDate: () => created_at },
    sport: "futbol", status: "won", odds: 2 };
  const records = new Map([["historical", { currency: "PEN", stakeMinorUnits: 1000 }]]);
  const report = bankrollReportData([pick], records, { from: "2025-01-01", through: "2025-01-31" });
  expect(report.count).toBe(1);
  expect(report.totals[0].profit).toBe(1000);
  expect(bankrollAccountBalance({ currency: "PEN", initialMinorUnits: 0, created_at: new Date("2026-01-01") },
    [], [pick], records).profit).toBe(0);
});

test("apertura, revisión inline, monedas y saldo independiente del período en SPA y standalone", async ({ page, request }, testInfo) => {
  test.setTimeout(120000);
  const fixture = await bankrollFixture(request);
  try {
    await loginLedger(page, fixture);
    await expect(page.getByTestId("bankroll-tab")).toBeVisible();
    await page.getByTestId("bankroll-tab").click();
    await expect(page.getByTestId("bankroll-account-status")).toContainText("Sin apertura");
    await page.getByTestId("bankroll-opening-amount").fill("100");
    await page.getByTestId("bankroll-opening-submit").click();
    await expect(page.getByTestId("bankroll-confirmation")).toContainText("100");
    await page.getByTestId("bankroll-cancel").click();
    await expect(page.getByTestId("bankroll-account-status")).toContainText("Sin apertura");
    await page.getByTestId("bankroll-opening-submit").click();
    await page.getByTestId("bankroll-confirm").click();
    await expect(page.getByTestId("bankroll-equity")).toContainText("100.00");
    const opened = await page.evaluate(async uid => {
      const { firebaseDb } = await import("/firebase-config.js?v=2");
      const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
      return (await getDoc(doc(firebaseDb, "users", uid, "bankrollAccounts", "PEN"))).data().created_at.toMillis();
    }, fixture.uid);
    for (const [id, offset, status, amount] of [["before", -1, "won", 90000], ["equal", 0, "won", 90000],
      ["won", 1, "won", 1000], ["risk", 2, "pending", 2000], ["no-amount", 3, "pending", null]]) {
      const path = `picks/${fixture.uid}-${id}`;
      await fixture.write(path, {
        user_id: fixture.uid, event: id, sport: "futbol", event_date: new Date("2025-01-01"),
        created_at: new Date(opened + offset), selection: "Goles", league: "Liga", market: "Total",
        odds: 2, stake: 1, bookmaker: "betano", analysis: "", status
      });
      if (amount) await fixture.write(`${path}/private/bankroll`, {
        stakeMinorUnits: amount, stakeAmount: amount / 100, currency: "PEN",
        created_at: new Date(opened + offset), updated_at: new Date(opened + offset)
      });
    }
    await expect(page.getByTestId("bankroll-equity")).toContainText("110.00");
    await expect(page.getByTestId("bankroll-available")).toContainText("90.00");
    await expect(page.getByTestId("bankroll-account-warning")).toContainText("1 sin importe");
    await page.getByTestId("bankroll-movement-amount").fill("250");
    await page.getByTestId("bankroll-movement-type").selectOption("withdrawal");
    await page.getByTestId("bankroll-movement-note").fill("<b>Retiro manual</b>");
    await page.getByTestId("bankroll-movement-submit").click();
    await expect(page.getByTestId("bankroll-equity")).toContainText("110.00");
    await page.getByTestId("bankroll-confirm").dblclick();
    await expect(page.getByTestId("bankroll-equity")).toContainText("140.00");
    await expect(page.getByTestId("bankroll-equity")).toContainText("-");
    await expect(page.getByTestId("bankroll-movement-row")).toHaveCount(1);
    await expect(page.getByTestId("bankroll-movement-row")).toContainText("<b>Retiro manual</b>");
    await page.getByTestId("bankroll-movement-type").selectOption("deposit");
    await page.getByTestId("bankroll-movement-amount").fill("50");
    await page.getByTestId("bankroll-movement-note").fill("Rectificación parcial del retiro");
    await page.getByTestId("bankroll-movement-submit").click();
    await page.getByTestId("bankroll-confirm").click();
    await expect(page.getByTestId("bankroll-movement-row")).toHaveCount(2);
    await expect(page.getByTestId("bankroll-equity")).toContainText("90.00");
    await page.getByTestId("bankroll-currency").selectOption("USD");
    await expect(page.getByTestId("bankroll-account-status")).toContainText("Sin apertura");
    await page.getByTestId("bankroll-opening-amount").fill("0");
    await page.getByTestId("bankroll-opening-submit").click();
    await page.getByTestId("bankroll-confirm").click();
    await expect(page.getByTestId("bankroll-equity")).toContainText("0.00");
    await page.getByTestId("bankroll-currency").selectOption("EUR");
    await expect(page.getByTestId("bankroll-account-status")).toContainText("Sin apertura");
    await page.getByTestId("bankroll-currency").selectOption("PEN");
    await page.locator("#picksTab").click();
    await page.locator("#bankrollFilterPanel > summary").click();
    await page.locator("#bankrollPeriod").selectOption("custom");
    await page.locator("#bankrollFrom").fill("2024-01-01");
    await page.locator("#bankrollThrough").fill("2024-01-31");
    await page.getByTestId("bankroll-tab").click();
    await expect(page.getByTestId("bankroll-equity")).toContainText("90.00");
    await page.goto("/tipster-dashboard.html");
    await page.getByTestId("bankroll-tab").click();
    await expect(page.getByTestId("bankroll-equity")).toContainText("90.00");
    await expect(page.getByTestId("bankroll-movement-row")).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath("bankroll-desktop.png"), fullPage: true, animations: "disabled" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath("bankroll-mobile.png"), fullPage: true, animations: "disabled" });
    expect(await page.getByTestId("bankroll-account").evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
    await fixture.write(`perfiles/${fixture.uid}`, { tipster_status: "revoked" });
    await expect(page.locator("#accountGate")).toBeVisible();
    await expect(page.getByTestId("bankroll-account")).not.toBeVisible();
    await expect(page.getByTestId("bankroll-equity")).toHaveCount(0);
    await expect(page.getByTestId("bankroll-export-movements")).toBeDisabled();
  } finally {
    await page.close();
    await fixture.cleanup();
  }
});

test("error de datos no presenta saldo parcial y permite reintentar la carga", async ({ page, request }) => {
  const fixture = await bankrollFixture(request);
  try {
    await fixture.write(`users/${fixture.uid}/bankrollAccounts/PEN`, {
      currency: "PEN", initialMinorUnits: -1, created_at: new Date()
    });
    await loginLedger(page, fixture);
    await page.getByTestId("bankroll-tab").click();
    await expect(page.getByTestId("bankroll-account-status")).toHaveAttribute("data-state", "error");
    await expect(page.getByTestId("bankroll-equity")).toHaveCount(0);
    await expect(page.getByTestId("bankroll-retry")).toBeVisible();
    await fixture.write(`users/${fixture.uid}/bankrollAccounts/PEN`, { initialMinorUnits: 0 });
    await page.getByTestId("bankroll-retry").click();
    await expect(page.getByTestId("bankroll-equity")).toContainText("0.00");
    await expect(page.getByTestId("bankroll-account-status")).toHaveAttribute("data-state", "ready");
    await expect(page.getByTestId("bankroll-export-movements")).toBeEnabled();
  } finally {
    await page.close();
    await fixture.cleanup();
  }
});

test("respuesta perdida no duplica movimientos; caché, unmount, logout y términos no filtran datos", async ({ page, request }) => {
  test.setTimeout(90000);
  const fixture = await bankrollFixture(request);
  try {
    await loginLedger(page, fixture);
    await expect(page.getByTestId("bankroll-tab")).toBeVisible();
    await page.getByTestId("bankroll-tab").click();
    await expect(page.getByTestId("bankroll-account-status")).toContainText("Sin apertura");
    await page.getByTestId("bankroll-opening-amount").fill("0");
    await page.getByTestId("bankroll-opening-submit").click();
    await page.getByTestId("bankroll-confirm").click();
    await expect(page.getByTestId("bankroll-equity")).toContainText("0.00");
    let interrupted = false, movementWrites = 0;
    await page.route("http://127.0.0.1:8080/**", async route => {
      const request = route.request();
      if (new URL(request.url()).pathname.endsWith(":commit") && request.postData()?.includes("/movements/")) {
        movementWrites++;
        if (!interrupted) {
          interrupted = true;
          // Actual emulator commit, then lose only its acknowledgement.
          await route.fetch();
          await route.abort("failed");
          return;
        }
      }
      await route.continue();
    });
    await page.getByTestId("bankroll-movement-amount").fill("12.34");
    await page.getByTestId("bankroll-movement-submit").click();
    await page.getByTestId("bankroll-confirm").click();
    await expect(page.getByTestId("bankroll-equity")).toContainText("12.34");
    await expect(page.getByTestId("bankroll-movement-row")).toHaveCount(1);
    expect(interrupted).toBeTruthy();
    expect(movementWrites).toBe(1);
    await page.unroute("http://127.0.0.1:8080/**");
    await page.evaluate(async () => {
      const { firebaseDb } = await import("/firebase-config.js?v=2");
      const { disableNetwork } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
      await disableNetwork(firebaseDb);
    });
    await expect(page.getByTestId("bankroll-equity")).toHaveCount(0);
    await expect(page.getByTestId("bankroll-account-status")).toContainText("Cargando");
    await expect(page.getByTestId("bankroll-movement-submit")).toBeDisabled();
    await page.evaluate(async () => {
      const { firebaseDb } = await import("/firebase-config.js?v=2");
      const { enableNetwork } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
      await enableNetwork(firebaseDb);
    });
    await expect(page.getByTestId("bankroll-equity")).toContainText("12.34");
    await page.getByRole("button", { name: "Regresar al streaming" }).click();
    await expect(page.getByTestId("bankroll-account")).toHaveCount(0);
    await page.goto("/#view=tipster");
    await page.getByTestId("bankroll-tab").click();
    await expect(page.getByTestId("bankroll-equity")).toContainText("12.34");
    await fixture.write(`legalAcceptances/${fixture.uid}/versions/2026-10-03`, { terms_version: "old" });
    await expect(page.getByTestId("bankroll-account-status")).toContainText("desactivado");
    await expect(page.getByTestId("bankroll-equity")).toHaveCount(0);
    await expect(page.getByTestId("bankroll-movement-row")).toHaveCount(0);
    await page.evaluate(async () => {
      const { firebaseAuth } = await import("/firebase-config.js?v=2");
      const { signOut } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
      await signOut(firebaseAuth);
    });
    await expect(page.getByTestId("bankroll-account")).toHaveCount(0);
  } finally {
    await page.close();
    await fixture.cleanup();
  }
});
