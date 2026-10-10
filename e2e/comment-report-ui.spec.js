import { test, expect } from "@playwright/test";
import { commentReportFixture, grantReportACL, loginReportAccount } from "./helpers/comment-report-fixture.js";
import { deleteVisualDocument } from "./helpers/visual-seed.js";

test.use({ baseURL: "http://localhost:5510" });

async function openThread(page, pickId) {
  await page.evaluate(pickId => window.dispatchEvent(new CustomEvent("fijas:mural-open", { detail: { pickId } })), pickId);
  await expect(page.locator("#muralEntries")).toContainText("Evidencia original");
}

test("UI: reporte inline por teclado, idempotencia, móvil/reduced motion y limpieza de sesión", async ({ page, request }, info) => {
  const f = await commentReportFixture(request);
  try {
    await page.route(/https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/, route => route.abort());
    await page.goto("/legal.html");
    await loginReportAccount(page, f.reporter);
    await page.goto("/");
    await openThread(page, f.pickId);
    const reportButton = page.getByTestId("report-comment").filter({ hasText: "Reportar" });
    await expect(reportButton).toBeEnabled();
    await reportButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("report-category")).toBeFocused();
    await page.getByTestId("report-category").selectOption("personal_data");
    await page.locator('.mural-report-form [name="detail"]').fill("Detalle de evidencia privado");
    // Inject a transport rejection only for this transaction read; all successful
    // operations and security assertions still use the actual emulator SDK.
    const transactionRead = /127\.0\.0\.1:8080\/v1\/.*:batchGet/;
    await page.route(transactionRead, route => route.fulfill({
      status: 403, contentType: "application/json",
      body: JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "Injected fixture rejection" } })
    }));
    await page.getByTestId("report-submit").click();
    await expect(page.getByTestId("report-status")).toContainText(/[Rr]eintenta/);
    await expect(page.locator('.mural-report-form [name="detail"]')).toHaveValue("Detalle de evidencia privado");
    await page.unroute(transactionRead);
    await expect(page.getByTestId("mural-report-form")).toContainText("No ocultará");
    await info.attach("mural-desktop", { body: await page.screenshot({ path: info.outputPath("mural-desktop.png") }), contentType: "image/png" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    // Existing shell owns the native mobile drawer; no new modal is introduced.
    await page.locator("#openMural").click();
    await expect(page.getByTestId("mural-report-form")).toBeVisible();
    await info.attach("mural-mobile", { body: await page.screenshot({ path: info.outputPath("mural-mobile.png") }), contentType: "image/png" });
    await page.getByTestId("report-submit").dblclick();
    await expect(page.getByTestId("report-comment")).toContainText("Reportado");
    await expect(page.getByTestId("report-comment")).toBeDisabled();
    await expect(page.locator("#muralEntries")).toContainText("Evidencia original");
    await expect(page.locator("#muralEntries")).not.toContainText("Detalle de evidencia privado");
    await page.evaluate(async () => {
      const { firebaseAuth } = await import("/firebase-config.js?v=2");
      const { signOut } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
      await signOut(firebaseAuth);
    });

    await expect(page.getByTestId("report-comment")).toHaveCount(0);
    await expect(page.getByTestId("mural-report-form")).toHaveCount(0);
    const data = await request.get(`http://127.0.0.1:8080/v1/projects/demo-fijas-vivo/databases/(default)/documents/${f.reportPath}`,
      { headers: { Authorization: "Bearer owner" } });
    expect(data.ok()).toBeTruthy();
    expect((await data.json()).fields.status.stringValue).toBe("pending");
  } finally { await page.close(); await f.cleanup(); }
});

test("UI: cambiar de hilo y suspender cuenta retira el borrador privado sin trasladarlo", async ({ page, request }) => {
  const f = await commentReportFixture(request);
  try {
    await page.route(/https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/, route => route.abort());
    await page.goto("/legal.html");
    await loginReportAccount(page, f.reporter);
    await page.goto("/");
    await openThread(page, f.pickId);
    await page.getByTestId("report-comment").click();
    await page.locator('.mural-report-form [name="detail"]').fill("No debe trasladarse");
    const secondPick = `${f.pickId}-second`;
    await f.owner.write(`picks/${secondPick}`, { user_id: f.owner.uid, sport: "futbol", event: "Otro hilo", created_at: new Date() });
    await f.owner.write(`picks/${secondPick}/comments/second`, {
      authorUid: f.owner.uid, authorName: "Autor exacto", text: "Evidencia original segundo hilo", created_at: new Date()
    });
    await openThread(page, secondPick);
    await expect(page.getByTestId("mural-report-form")).toHaveCount(0);
    await expect(page.locator("#muralEntries")).not.toContainText("No debe trasladarse");
    await page.getByTestId("report-comment").click();
    await expect(page.locator('.mural-report-form [name="detail"]')).toHaveValue("");
    await f.reporter.write(`users/${f.reporter.uid}`, { status: "suspended" });
    await expect(page.getByTestId("mural-report-form")).toHaveCount(0);
    await expect(page.getByTestId("report-comment")).toHaveCount(0);
  } finally { await page.close(); await f.cleanup(); }
});

test("UI: cola community, confirmación inline, evidencia, resolución y revocación/unmount", async ({ page, request }, info) => {
  const f = await commentReportFixture(request);
  try {
    await f.owner.write(f.reportPath, {
      pickId: f.pickId, commentId: "source", reporterUid: f.reporter.uid, ownerUid: f.owner.uid,
      authorUid: f.owner.uid, authorName: "Autor exacto", text: "Evidencia original",
      category: "harassment", detail: "Detalle privado de cola", status: "pending", created_at: new Date()
    });
    await grantReportACL(request, f.owner, true);
    await page.route(/https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/, route => route.abort());
    await page.goto("/legal.html");
    await loginReportAccount(page, f.owner);
    await page.goto("/#view=admin");
    await page.locator("#community-tab").click();
    const row = page.getByTestId("admin-report-row").filter({ hasText: f.pickId });
    await expect(row).toContainText("Evidencia original");
    await row.getByTestId("admin-report-review-open").click();
    await expect(row.locator('[name="resolution"]')).toBeFocused();
    await row.locator('[name="resolution"]').selectOption("remove");
    await row.locator('[name="reason"]').fill("Revisión manual de evidencia");
    await info.attach("cola-desktop", { body: await page.screenshot({ path: info.outputPath("cola-desktop.png") }), contentType: "image/png" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(row.getByTestId("admin-report-confirm")).toBeVisible();
    await info.attach("cola-mobile", { body: await page.screenshot({ path: info.outputPath("cola-mobile.png") }), contentType: "image/png" });
    await row.getByTestId("admin-report-confirm").click();
    await expect(page.getByTestId("admin-report-status")).toContainText("Revisión registrada");
    await expect(row).toHaveCount(0);
    await page.getByTestId("admin-report-filter").selectOption("removed");
    await expect(row).toContainText("Revisión manual de evidencia");
    await expect(row.getByTestId("admin-report-review-open")).toHaveCount(0);
    // SPA unmount immediately clears the private queue, even while Auth remains signed in.
    await page.goto("/#view=explore");
    await expect(page.getByTestId("admin-report-row")).toHaveCount(0);
    await page.goto("/#view=admin");
    await page.locator("#community-tab").click();
    await page.getByTestId("admin-report-filter").selectOption("removed");
    await expect(row).toContainText("Evidencia original");
    await grantReportACL(request, f.owner, false);
    await expect(page.locator("#community-tab")).toBeHidden();
    await expect(page.getByTestId("admin-report-row")).toHaveCount(0);
    const source = await request.get(`http://127.0.0.1:8080/v1/projects/demo-fijas-vivo/databases/(default)/documents/${f.commentPath}`,
      { headers: { Authorization: "Bearer owner" } });
    expect(source.status()).toBe(404);
  } finally { await page.close(); await f.cleanup(); }
});

test("UI: paginación acotada y comentario ausente se resuelve sin inventar eliminación", async ({ page, request }) => {
  test.setTimeout(120000);
  const f = await commentReportFixture(request);
  try {
    const date = Date.now() + 86400000;
    for (let index = 0; index < 51; index++) {
      await f.owner.write(`${f.commentPath}/commentReports/fixture-${index}`, {
        pickId: f.pickId, commentId: "source", reporterUid: `fixture-${index}`, ownerUid: f.owner.uid,
        authorUid: f.owner.uid, authorName: "Autor exacto", text: `Evidencia original ${index}`,
        category: "spam", detail: "", status: "pending", created_at: new Date(date - index)
      });
    }
    await grantReportACL(request, f.owner, true);
    await deleteVisualDocument(request, f.commentPath);
    await page.route(/https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/, route => route.abort());
    await page.goto("/legal.html");
    await loginReportAccount(page, f.owner);
    await page.goto("/admin-dashboard.html");
    await page.locator("#community-tab").click();
    await expect(page.getByTestId("admin-report-row")).toHaveCount(50);
    await page.locator("#commentReportNext").click();
    await expect(page.getByTestId("admin-report-row").filter({ hasText: f.pickId })).toHaveCount(1);
    const row = page.getByTestId("admin-report-row").filter({ hasText: f.pickId });
    await row.getByTestId("admin-report-review-open").click();
    await row.getByTestId("admin-report-confirm").click();
    await expect(row).toHaveCount(0);
    await page.getByTestId("admin-report-filter").selectOption("unavailable");
    await expect(row).toContainText("No disponibles");
    await expect(row).toContainText("Evidencia original");
  } finally { await page.close(); await f.cleanup(); }
});
