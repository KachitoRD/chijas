import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { visualAccounts, writeVisualDocument, deleteVisualDocument, findVisualPickIds, includeVisualUpcomingPicks } from "./helpers/visual-seed.js";

async function login(page) {
  await page.goto("/");
  await page.locator("#viewerLogin").click();
  await page.locator("#viewerAuthEmail").fill(visualAccounts.tipster.email);
  await page.locator("#viewerAuthPassword").fill(visualAccounts.tipster.password);
  await page.locator("#viewerAuthSubmit").click();
  await expect(page.locator("#viewerAuth")).not.toBeVisible();
  await page.goto("/#view=tipster");
  await expect(page.locator("#myPicks")).toHaveAttribute("aria-busy", "false");
  return page.evaluate(async () => (await import("/firebase-config.js?v=2")).firebaseAuth.currentUser.uid);
}
async function fillPick(page, event) {
  await page.locator("#event").fill(event);
  await page.locator("#odds").fill("1.85");
  await page.locator("#league").fill("Liga de prueba");
  await page.locator("#market").fill("Goles");
  await page.locator("#selection").fill("Más de 1.5 goles");
  await page.locator("#note").fill("Análisis de prueba");
  await page.locator("#stakeAmount").fill("10");
  const local = await page.evaluate(() => {
    const date = new Date(Date.now() + 30 * 60_000);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  await page.locator("#eventDate").fill(local);
}

test("revisar y cancelar conserva borrador sin publicar; confirmar publica una sola vez", async ({ page, request }, testInfo) => {
  const uid = await login(page);
  const event = `Revisión ${randomUUID()}`;
  let id;
  try {
    await includeVisualUpcomingPicks(page);
    await fillPick(page, event);
    await page.locator("#savePickButton").click();
    await expect(page.locator("#pickReviewDialog")).toBeVisible();
    await expect(page.locator("#pickReviewSummary")).toContainText(event);
    await expect(page.locator("#pickReviewSummary")).toContainText("Análisis de prueba");
    await expect(page.locator("#pickReviewSummary")).toContainText("Privado");
    await expect(page.locator("#myPicks")).not.toContainText(event);
    expect(await findVisualPickIds(request, uid, event)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("revision-desktop.png"), animations: "disabled" });
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await page.locator("#pickReviewDialog").boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: testInfo.outputPath("revision-mobile.png"), animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(page.locator("#event")).toHaveValue(event);
    await expect(page.locator("#savePickButton")).toBeEnabled();
    await page.locator("#savePickButton").click();
    await page.locator("#confirmPickPublication").click();
    await expect(page.locator("#pickMessage")).toHaveText("Pronóstico publicado.", { timeout: 30000 });
    const row = page.locator("#myPicks tr").filter({ hasText: event });
    await expect(row).toHaveCount(1);
    id = await row.locator('input[data-action="stream"]').getAttribute("data-id");
    await expect(page.locator("#event")).toHaveValue("");
    await row.locator(".pick-action-trigger").click();
    await row.getByRole("button", { name: "Editar", exact: true }).click();
    await expect(page.locator("#savePickButton")).toBeEnabled();
    await page.locator("#odds").fill("1.95");
    await page.locator("#savePickButton").click();
    await expect(page.locator("#pickReviewTitle")).toHaveText("Revisar cambios del pronóstico");
    await expect(page.locator("#confirmPickPublication")).toHaveText("Confirmar cambios");
    await page.keyboard.press("Escape");
    await expect(row).toContainText("1.85");
    await expect(page.locator("#odds")).toHaveValue("1.95");
    await page.locator("#savePickButton").click();
    await page.locator("#confirmPickPublication").click();
    await expect(page.locator("#pickMessage")).toHaveText("Pronóstico actualizado.", { timeout: 30000 });
    await expect(row).toContainText("1.95");
    expect(await findVisualPickIds(request, uid, event)).toEqual([id]);
  } finally {
    const ids = id ? [id] : await findVisualPickIds(request, uid, event);
    for (const item of ids) {
      await deleteVisualDocument(request, `picks/${item}/private/bankroll`);
      await deleteVisualDocument(request, `perfiles/${uid}/obsSelections/${item}`);
      await deleteVisualDocument(request, `picks/${item}`);
    }
  }
});

test("confirmación revalida la fecha si el evento inicia durante la revisión", async ({ page, request }) => {
  const uid = await login(page);
  await page.clock.install();
  const event = `Vencida ${randomUUID()}`;
  try {
    await fillPick(page, event);
    await page.locator("#savePickButton").click();
    await expect(page.locator("#pickReviewDialog")).toBeVisible();
    await page.clock.setSystemTime(new Date(Date.now() + 40 * 60_000));
    await page.locator("#confirmPickPublication").click();
    await expect(page.locator("#pickMessage")).toContainText("fecha del evento debe ser futura");
    await expect(page.locator("#myPicks")).not.toContainText(event);
    await expect(page.locator("#event")).toHaveValue(event);
    expect(await findVisualPickIds(request, uid, event)).toEqual([]);
  } finally {
    for (const id of await findVisualPickIds(request, uid, event)) {
      await deleteVisualDocument(request, `picks/${id}/private/bankroll`);
      await deleteVisualDocument(request, `perfiles/${uid}/obsSelections/${id}`);
      await deleteVisualDocument(request, `picks/${id}`);
    }
  }
});

test("historial filtra sin cambiar informes y monetización permanece sin operaciones", async ({ page, request }, testInfo) => {
  const uid = await login(page);
  const prefix = `workspace-${randomUUID()}`;
  const ids = [0, 1, 2].map(i => `${prefix}-${i}`);
  try {
    for (const [i, id] of ids.entries()) {
      await writeVisualDocument(request, `picks/${id}`, {
        user_id: uid, sport: "futbol", event: id, selection: "Goles", odds: 2, bookmaker: "betano",
        event_date: new Date(Date.now() + (i === 0 ? 60_000 : -60_000)), created_at: new Date(),
        league: "Liga", market: "Total", stake: 1, analysis: "", status: i === 2 ? "won" : "pending",
        confianza: 4, destacada: false, show_on_stream: i === 2
      });
    }
    await includeVisualUpcomingPicks(page);
    await expect(page.locator("#myPicks")).toContainText(ids[2]);
    await expect(page.locator("#bankrollSummary")).toHaveAttribute("aria-busy", "false");
    const financialSummary = await page.locator("#bankrollSummary").textContent();
    await page.locator("#pickHistorySearch").fill(prefix);
    await page.getByRole("button", { name: "Pendientes", exact: true }).click();
    await expect(page.locator("#myPicks tr[data-pick-id]")).toHaveCount(2);
    await page.getByRole("button", { name: "Por resolver", exact: true }).click();
    await expect(page.locator("#myPicks tr[data-pick-id]")).toHaveCount(1);
    await expect(page.locator("#myPicks")).toContainText(ids[1]);
    await page.getByRole("button", { name: "En OBS", exact: true }).click();
    await expect(page.locator("#myPicks")).toContainText(ids[2]);
    await expect(page.locator("#bankrollSummary")).toHaveText(financialSummary);
    await page.locator("#pickHistoryClear").click();
    await expect(page.locator("#pickHistorySearch")).toHaveValue("");
    await expect(page.locator("#pickHistoryControls").getByRole("button", { name: "Todos", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.locator("#monetizationTab").click();
    await expect(page.locator("#monetizationView")).toContainText("Monetización desactivada");
    await expect(page.locator("#monetizationView button")).toBeDisabled();
    await expect(page.locator("#monetizationView input")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("monetizacion-desktop.png"), animations: "disabled" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath("monetizacion-mobile.png"), animations: "disabled" });
  } finally {
    for (const id of ids) await deleteVisualDocument(request, `picks/${id}`);
  }
});
