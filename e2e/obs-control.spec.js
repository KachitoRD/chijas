import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { visualAccounts, writeVisualDocument, deleteVisualDocument, includeVisualUpcomingPicks } from "./helpers/visual-seed.js";

async function login(page) {
  await page.goto("/");
  await page.locator("#viewerLogin").click();
  await page.locator("#viewerAuthEmail").fill(visualAccounts.tipster.email);
  await page.locator("#viewerAuthPassword").fill(visualAccounts.tipster.password);
  await page.locator("#viewerAuthSubmit").click();
  await expect(page.locator("#viewerAuth")).not.toBeVisible();
  await page.goto("/#view=tipster");
  await expect(page.locator("#dashboard")).toBeVisible();
  return page.evaluate(async () => (await import("/firebase-config.js?v=2")).firebaseAuth.currentUser.uid);
}

function fixture(uid, id, status = "pending", visible = false) {
  return {
    user_id: uid, sport: "futbol", event: `OBS independiente ${id}`, selection: "Más de 1.5 goles",
    odds: 2, bookmaker: "betano", event_date: new Date(Date.now() - 60_000),
    league: "Liga de pruebas", market: "Goles", stake: 1, analysis: "Nota inmutable",
    status, confianza: 4, destacada: false, show_on_stream: visible, created_at: new Date()
  };
}

async function firestoreAction(page, operation, path, data = {}) {
  return page.evaluate(async ({ operation, path, data }) => {
    const { firebaseDb } = await import("/firebase-config.js?v=2");
    const sdk = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    try {
      if (operation === "list") {
        const snapshot = await sdk.getDocs(sdk.query(sdk.collection(firebaseDb, path),
          sdk.where("user_id", "==", data.uid), sdk.where(sdk.documentId(), "in", data.ids)));
        return { ok: true, ids: snapshot.docs.map(item => item.id).sort() };
      }
      const ref = sdk.doc(firebaseDb, path);
      if (operation === "read") {
        const snapshot = await sdk.getDoc(ref);
        return { ok: true, data: snapshot.data() };
      }
      if (operation === "delete") await sdk.deleteDoc(ref);
      else if (operation === "pick") await sdk.updateDoc(ref, data);
      else await sdk.setDoc(ref, { ...data, ...(operation === "save" ? { updated_at: sdk.serverTimestamp() } : {}) });
      return { ok: true };
    } catch (error) {
      return { ok: false, code: error.code };
    }
  }, { operation, path, data });
}

test("candados muestran editabilidad con nube accesible sin bloquear OBS", async ({ page, request }) => {
  const uid = await login(page);
  const prefix = `lock-${randomUUID()}`;
  const cases = [
    { id: `${prefix}-open`, status: "pending", future: true, label: "Abierto: pronóstico editable", locked: "false" },
    { id: `${prefix}-started`, status: "pending", future: false, label: "Cerrado: evento iniciado", locked: "true" },
    { id: `${prefix}-settled`, status: "won", future: true, label: "Cerrado: pronóstico calificado", locked: "true" }
  ];
  try {
    for (const item of cases) {
      await writeVisualDocument(request, `picks/${item.id}`, {
        ...fixture(uid, item.id, item.status),
        event_date: new Date(Date.now() + (item.future ? 3600_000 : -60_000))
      });
    }
    await includeVisualUpcomingPicks(page);
    const colors = [];
    for (const item of cases) {
      const row = page.locator(`tr[data-pick-id="${item.id}"]`);
      const lock = row.locator(".pick-lock-badge");
      const tooltip = row.getByRole("tooltip");
      await expect(lock).toHaveAttribute("data-locked", item.locked);
      await expect(lock).toHaveAttribute("aria-label", `${item.label} · OBS independiente ${item.id}`);
      await expect(lock).toHaveText("");
      colors.push(await lock.evaluate(element => getComputedStyle(element).color));
      await lock.hover();
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText(item.label);
      await expect(tooltip).toContainText("OBS es independiente");
      await page.locator("#pickHistorySearch").hover();
      await expect(tooltip).not.toBeVisible();
      await lock.focus();
      await expect(tooltip).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(tooltip).not.toBeVisible();
      await expect(lock).toBeFocused();
      await row.locator(".pick-action-trigger").click();
      const edit = row.getByRole("button", { name: "Editar", exact: true });
      if (item.locked === "true") await expect(edit).toBeDisabled();
      else await expect(edit).toBeEnabled();
      await page.keyboard.press("Escape");
      await expect(row.locator('input[data-action="stream"]')).toBeEnabled();
    }
    expect(colors[0]).not.toBe(colors[1]);
    expect(colors[1]).toBe(colors[2]);
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileRow = page.locator(`tr[data-pick-id="${cases[1].id}"]`);
    await mobileRow.locator(".pick-lock-badge").click();
    await expect(mobileRow.getByRole("tooltip")).toBeVisible();
    const bounds = await mobileRow.getByRole("tooltip").boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  } finally {
    for (const item of cases) await deleteVisualDocument(request, `picks/${item.id}`);
  }
});

test("reglas OBS separan presentación de términos y rechazan suplantación y datos inválidos", async ({ page, request }) => {
  const uid = await login(page);
  const id = `obs-${randomUUID()}`;
  const foreignUid = `obs-foreign-${randomUUID()}`;
  const foreignId = `obs-${randomUUID()}`;
  const path = `perfiles/${uid}/obsSelections/${id}`;
  const pickPath = `picks/${id}`;
  const foreignPath = `perfiles/${foreignUid}/obsSelections/${foreignId}`;
  try {
    await writeVisualDocument(request, pickPath, fixture(uid, id, "won"));
    await writeVisualDocument(request, `perfiles/${foreignUid}`, { tipster_status: "approved" });
    await writeVisualDocument(request, `picks/${foreignId}`, fixture(foreignUid, foreignId));
    const before = await firestoreAction(page, "read", pickPath);
    for (const data of [{ visible: "yes" }, { visible: true, extra: "invalid" }, {}]) {
      expect(await firestoreAction(page, "save", path, data)).toEqual({ ok: false, code: "permission-denied" });
    }
    expect(await firestoreAction(page, "save", path, { visible: true })).toEqual({ ok: true });
    expect(await firestoreAction(page, "save", path, { visible: false })).toEqual({ ok: true });
    expect(await firestoreAction(page, "read", pickPath)).toEqual(before);
    for (const data of [{ visible: "yes" }, { visible: true, extra: "invalid" }, {}]) {
      expect(await firestoreAction(page, "save", path, data)).toEqual({ ok: false, code: "permission-denied" });
    }
    expect(await firestoreAction(page, "raw", path, { visible: true, updated_at: "invalid" })).toEqual({ ok: false, code: "permission-denied" });
    expect(await firestoreAction(page, "save", `${path}-missing`, { visible: true })).toEqual({ ok: false, code: "permission-denied" });
    expect(await firestoreAction(page, "save", `perfiles/${uid}/obsSelections/${foreignId}`, { visible: true })).toEqual({ ok: false, code: "permission-denied" });
    expect(await firestoreAction(page, "save", foreignPath, { visible: true })).toEqual({ ok: false, code: "permission-denied" });
    expect(await firestoreAction(page, "pick", pickPath, { selection: "Alterada" })).toEqual({ ok: false, code: "permission-denied" });
    expect(await firestoreAction(page, "delete", path)).toEqual({ ok: true });
    expect(await firestoreAction(page, "save", path, { visible: true })).toEqual({ ok: true });
    await page.evaluate(async () => (await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js")).signOut((await import("/firebase-config.js?v=2")).firebaseAuth));
    expect((await firestoreAction(page, "read", path)).ok).toBe(true);
    expect(await firestoreAction(page, "save", path, { visible: false })).toEqual({ ok: false, code: "permission-denied" });
    await writeVisualDocument(request, `perfiles/${foreignUid}`, { tipster_status: "revoked" });
    expect(await firestoreAction(page, "read", foreignPath)).toEqual({ ok: false, code: "permission-denied" });
    expect(await firestoreAction(page, "read", `picks/${foreignId}`)).toEqual({ ok: false, code: "permission-denied" });
    expect(await firestoreAction(page, "list", "picks", { uid: foreignUid, ids: [foreignId, `${foreignId}-missing`] })).toEqual({ ok: false, code: "permission-denied" });
    expect(await firestoreAction(page, "read", `${pickPath}-missing`)).toEqual({ ok: true, data: undefined });
    expect(await firestoreAction(page, "list", "picks", { uid, ids: [id, `${id}-missing`] })).toEqual({ ok: true, ids: [id] });
  } finally {
    for (const item of [path, pickPath, foreignPath, `picks/${foreignId}`, `perfiles/${foreignUid}`]) {
      await deleteVisualDocument(request, item);
    }
  }
});

for (const status of ["pending", "won"]) {
  test(`OBS permite marcar y ocultar ${status === "pending" ? "eventos iniciados" : "resultados cerrados"} sin alterar el pick`, async ({ page, request, browser }) => {
    const uid = await login(page);
    const id = `obs-${randomUUID()}`;
    const pickPath = `picks/${id}`;
    const presentationPath = `perfiles/${uid}/obsSelections/${id}`;
    const pick = fixture(uid, id, status, true);
    const publicContext = await browser.newContext();
    const overlay = await publicContext.newPage();
    try {
      await writeVisualDocument(request, pickPath, pick);
      await page.locator("#bankrollReload").click();
      const row = page.locator("#myPicks tr").filter({ hasText: pick.event });
      const stream = row.getByRole("checkbox", { name: `Mostrar ${pick.event} en el widget`, exact: true });
      const before = await firestoreAction(page, "read", pickPath);
      await overlay.goto("/overlay.html?u=tipster_test");
      await expect(overlay.locator("#pickList")).toContainText(pick.event);
      await expect(stream).toBeEnabled();
      await expect(stream).toBeChecked();
      await stream.uncheck();
      await expect(stream).toBeEnabled();
      await expect(overlay.locator("#pickList")).not.toContainText(pick.event);
      await stream.check();
      await expect(stream).toBeEnabled();
      await expect(overlay.locator("#pickList")).toContainText(pick.event);
      await expect(overlay.locator(".pick").filter({ hasText: pick.event }).locator(".pick-status")).toHaveText(status === "won" ? "Ganada" : "Pendiente");
      expect(await firestoreAction(page, "read", pickPath)).toEqual(before);
      await page.reload();
      await expect(stream).toBeChecked();
      await expect(stream).toBeEnabled();
      await row.locator(".pick-action-trigger").click();
      await expect(row.getByRole("button", { name: "Editar", exact: true })).toBeDisabled();
      await expect(row.getByRole("button", { name: "Eliminar", exact: true })).toBeDisabled();
      await page.keyboard.press("Escape");
      await stream.uncheck();
      await expect(overlay.locator("#pickList")).not.toContainText(pick.event);
    } finally {
      await publicContext.close();
      await deleteVisualDocument(request, presentationPath);
      await deleteVisualDocument(request, pickPath);
    }
  });
}

test("OBS conserva otros picks al eliminar un pronóstico seleccionado", async ({ page, request, browser }) => {
  const uid = await login(page);
  const ids = [`obs-${randomUUID()}`, `obs-${randomUUID()}`];
  const picks = ids.map(id => ({ ...fixture(uid, id), event_date: new Date(Date.now() + 30 * 60_000) }));
  const publicContext = await browser.newContext();
  const overlay = await publicContext.newPage();
  try {
    for (const [index, pick] of picks.entries()) await writeVisualDocument(request, `picks/${ids[index]}`, pick);
    await includeVisualUpcomingPicks(page);
    for (const pick of picks) {
      const stream = page.getByRole("checkbox", { name: `Mostrar ${pick.event} en el widget`, exact: true });
      await stream.check();
      await expect(stream).toBeEnabled();
    }
    await overlay.goto("/overlay.html?u=tipster_test");
    for (const pick of picks) await expect(overlay.locator("#pickList")).toContainText(pick.event);
    // Simulate the pick notification arriving before its selection is removed.
    await deleteVisualDocument(request, `picks/${ids[0]}`);
    await expect(overlay.locator("#pickList")).not.toContainText(picks[0].event);
    await expect(overlay.locator("#widget")).toBeVisible();
    await expect(overlay.locator("#pickList")).toContainText(picks[1].event);
    await expect(overlay.locator("#widgetMessage")).toBeHidden();
    await deleteVisualDocument(request, `perfiles/${uid}/obsSelections/${ids[0]}`);
    const row = page.locator("#myPicks tr").filter({ hasText: picks[1].event });
    await row.locator(".pick-action-trigger").click();
    page.once("dialog", dialog => dialog.accept());
    await row.getByRole("button", { name: "Eliminar", exact: true }).click();
    await expect(row).toHaveCount(0, { timeout: 15000 });
    const selection = await firestoreAction(page, "read", `perfiles/${uid}/obsSelections/${ids[1]}`);
    expect(selection).toEqual({ ok: true, data: undefined });
    await expect(overlay.locator("#pickList")).not.toContainText(picks[1].event);
    await expect(overlay.locator("#widgetMessage")).toBeHidden();
  } finally {
    await publicContext.close();
    for (const id of ids) {
      await deleteVisualDocument(request, `perfiles/${uid}/obsSelections/${id}`);
      await deleteVisualDocument(request, `picks/${id}`);
    }
  }
});

test("OBS deja de mostrar picks si se revoca la aprobación del perfil", async ({ page, request }) => {
  const uid = `obs-revoked-${randomUUID()}`;
  const username = `obs_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const id = `obs-${randomUUID()}`;
  const pick = fixture(uid, id);
  try {
    await writeVisualDocument(request, `perfiles/${uid}`, { tipster_status: "approved", username, nombre_publico: "Prueba de revocación" });
    await writeVisualDocument(request, `usernames/${username}`, { uid });
    await writeVisualDocument(request, `picks/${id}`, pick);
    await writeVisualDocument(request, `perfiles/${uid}/obsSelections/${id}`, { visible: true, updated_at: new Date() });
    await page.goto(`/overlay.html?u=${username}`);
    await expect(page.locator("#pickList")).toContainText(pick.event);
    await writeVisualDocument(request, `perfiles/${uid}`, { tipster_status: "revoked" });
    await expect(page.locator("#widget")).toBeHidden();
    await expect(page.locator("#widgetMessage")).toBeVisible();
    await page.reload();
    await expect(page.locator("#widget")).toBeHidden();
    await expect(page.locator("#widgetMessage")).toBeVisible();
  } finally {
    for (const path of [`perfiles/${uid}/obsSelections/${id}`, `picks/${id}`, `usernames/${username}`, `perfiles/${uid}`]) {
      await deleteVisualDocument(request, path);
    }
  }
});

test("el panel OBS permite ir directamente a gestionar su selección", async ({ page }) => {
  await login(page);
  await page.locator("#widgetTab").click();
  await expect(page.locator("#widgetView")).toContainText("eventos iniciados y resultados cerrados");
  await expect(page.getByRole("button", { name: "Gestionar selección de OBS", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Gestionar selección de OBS", exact: true }).click();
  await expect(page.locator("#picksTab")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#myPicksTitle")).toBeFocused();
});
