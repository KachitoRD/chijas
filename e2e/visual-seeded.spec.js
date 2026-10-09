import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { visualAccounts, visualUsername, firestoreRoot, findVisualPickIds, deleteVisualDocument, includeVisualUpcomingPicks } from "./helpers/visual-seed.js";

async function login(page, role) {
  const account = visualAccounts[role];
  if (role !== "owner") {
    await page.goto("/");
    await page.locator("#viewerLogin").click();
    await page.locator("#viewerAuthEmail").fill(account.email);
    await page.locator("#viewerAuthPassword").fill(account.password);
    await page.locator("#viewerAuthSubmit").click();
    await expect(page.locator("#viewerAuth")).not.toBeVisible();
    if (role === "tipster") {
      await page.goto("/#view=tipster");
      await expect(page.locator("#dashboard")).toBeVisible();
    }
    return;
  }
  await page.goto("/owner.html");
  await page.locator("#creatorEmail").fill(account.email);
  await page.locator("#creatorPassword").fill(account.password);
  await page.locator("#creatorLoginButton").click();
  await expect(page.locator("#ownerDashboard")).toBeVisible();
  await expect(page.locator("#ownerAuth")).not.toBeVisible();
}

test("panel tipster incluye módulos de pronósticos, bankroll y widget OBS", async ({ page }) => {
  await login(page, "tipster");
  await expect(page.locator("#dashboard")).toBeVisible();
  await expect(page.locator("#pickForm")).toHaveCount(1);
  await expect(page.locator("#myPicks")).toHaveCount(1);
  await expect(page.locator("#bankrollSummary")).toHaveCount(1);
  await expect(page.locator("#widgetPreviewFrame")).toHaveCount(1);
});

test("rechaza una fecha de evento pasada antes de enviar el pronóstico", async ({ page }) => {
  await login(page, "tipster");
  const event = `Fecha pasada ${randomUUID()}`;
  let commitRequests = 0;
  page.on("request", request => {
    if (request.url().includes("/documents:commit")) commitRequests++;
  });
  await page.locator("#sport").selectOption("futbol");
  await page.locator("#odds").fill("1.85");
  await page.locator("#event").fill(event);
  await page.locator("#league").fill("Liga de prueba");
  await page.locator("#market").fill("Más/Menos");
  await page.locator("#selection").fill("Más de 1.5 goles");
  await page.locator("#bookmaker").selectOption("betano");
  await page.locator("#stakeAmount").fill("10");
  const yesterday = await page.evaluate(() => {
    const date = new Date(Date.now() - 24 * 60 * 60_000);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  await page.locator("#eventDate").fill(yesterday);
  await page.locator("#savePickButton").click();

  await expect(page.locator("#pickMessage")).toContainText("La fecha del evento debe ser futura");
  expect(commitRequests).toBe(0);
});

test("filtros de bankroll se limpian en una acción y vuelven al período actual", async ({ page }) => {
  await login(page, "tipster");
  await expect(page.locator("#myPicks")).toHaveAttribute("aria-busy", "false");
  await page.locator("#bankrollFilterPanel summary").click();
  await page.locator("#bankrollPeriod").selectOption("custom");
  const currentMonth = await page.evaluate(() => {
    const now = new Date();
    const day = value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    return { from: day(new Date(now.getFullYear(), now.getMonth(), 1)), through: day(now) };
  });
  await page.locator("#bankrollFrom").fill(currentMonth.from);
  await page.locator("#bankrollThrough").fill(currentMonth.through);
  await page.locator("#bankrollStatus").selectOption("lost");
  await page.locator("#bankrollSport").selectOption("futbol");
  await expect(page.locator("#bankrollClearFilters")).toBeVisible();

  await page.locator("#bankrollClearFilters").click();

  await expect(page.locator("#bankrollPeriod")).toHaveValue("month");
  await expect(page.locator("#bankrollFrom")).toBeDisabled();
  await expect(page.locator("#bankrollThrough")).toBeDisabled();
  await expect(page.locator("#bankrollStatus")).toHaveValue("");
  await expect(page.locator("#bankrollSport")).toHaveValue("");
  await expect(page.locator("#bankrollBookmaker")).toHaveValue("");
  await expect(page.locator("#bankrollClearFilters")).toBeHidden();
});

test("el widget OBS muestra solo picks seleccionados en la vista previa y enlace público", async ({ page, request }) => {
  const event = `OBS de prueba ${randomUUID()}`;
  await login(page, "tipster");
  const uid = await page.evaluate(async () => (await import("/firebase-config.js?v=2")).firebaseAuth.currentUser.uid);
  try {
    await includeVisualUpcomingPicks(page);
    await page.locator("#sport").selectOption("futbol");
    await page.locator("#odds").fill("1.85");
    await page.locator("#event").fill(event);
    await page.locator("#league").fill("Liga de prueba");
    await page.locator("#market").fill("Más/Menos");
    await page.locator("#selection").fill("Más de 1.5 goles");
    await page.locator("#bookmaker").selectOption("betano");
    await page.locator("#stakeAmount").fill("10");
    const local = await page.evaluate(() => {
      const date = new Date(Date.now() + 5 * 60_000);
      return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    });
    await page.locator("#eventDate").fill(local);
    await page.locator("#savePickButton").click();
    await page.locator("#confirmPickPublication").click();
    await expect(page.locator("#pickMessage")).toHaveText("Pronóstico publicado.", { timeout: 30000 });
    const stream = page.getByRole("checkbox", { name: `Mostrar ${event} en el widget`, exact: true });
    await expect(stream).toBeVisible();
    await stream.check();

    await page.locator("#widgetTab").click();
    const preview = page.frameLocator("#widgetPreviewFrame");
    await expect(preview.locator("#widgetName")).toHaveText(visualAccounts.tipster.name);
    await expect(preview.locator("#pickList")).toContainText(event);
    await expect(preview.locator("#pickList")).toContainText("Más de 1.5 goles");
    await expect(page.locator("#widgetUrl")).toHaveValue(/overlay\.html\?u=tipster_test/);
    await page.locator("#widgetFormat").selectOption("compacto");
    await expect(preview.locator("#widget")).toHaveAttribute("data-format", "compacto");
    await expect(page.locator("#widgetUrl")).toHaveValue(/formato=compacto/);

    const publicWidget = await page.context().newPage();
    await publicWidget.goto(await page.locator("#widgetUrl").inputValue());
    await expect(publicWidget.locator("#widgetName")).toHaveText(visualAccounts.tipster.name);
    await expect(publicWidget.locator("#pickList")).toContainText(event);
    await expect(publicWidget.locator("#widgetMessage")).toBeHidden();
    await expect(publicWidget.locator("#widget")).toHaveAttribute("data-format", "compacto");
    await expect(publicWidget.locator("html")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await publicWidget.close();
  } finally {
    for (const id of await findVisualPickIds(request, uid, event)) {
      await deleteVisualDocument(request, `picks/${id}/private/bankroll`);
      await deleteVisualDocument(request, `perfiles/${uid}/obsSelections/${id}`);
      await deleteVisualDocument(request, `picks/${id}`);
    }
  }
});

for (const analysis of ["", "Análisis publicado: ritmo de juego y ocasiones."]) {
  test(`controles de nota y OBS ${analysis ? "con análisis" : "sin análisis"} mantienen su estado`, async ({ page, request }, testInfo) => {
    const event = `Controles ${randomUUID()}`;
    await login(page, "tipster");
    const uid = await page.evaluate(async () => (await import("/firebase-config.js?v=2")).firebaseAuth.currentUser.uid);
    try {
      await includeVisualUpcomingPicks(page);
      await page.locator("#odds").fill("1.85");
      await page.locator("#event").fill(event);
      await page.locator("#league").fill("Liga de prueba");
      await page.locator("#market").fill("Más/Menos");
      await page.locator("#selection").fill("Más de 1.5 goles");
      await page.locator("#note").fill(analysis);
      const local = await page.evaluate(() => {
        const date = new Date(Date.now() + 10 * 60_000);
        return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
      });
      await page.locator("#eventDate").fill(local);
      await page.locator("#savePickButton").click();
      await page.locator("#confirmPickPublication").click();
      await expect(page.locator("#pickMessage")).toHaveText("Pronóstico publicado.", { timeout: 30000 });
      const row = page.locator("#myPicks tr").filter({ hasText: event });
      const note = row.getByRole("button", { name: `Nota de ${event}`, exact: true });
      if (analysis) {
        await expect(note).toHaveText("");
        await note.click();
        await expect(row.locator(".pick-note-popup")).toContainText(analysis);
        const bounds = await note.boundingBox();
        expect(bounds.width).toBeLessThanOrEqual(32);
        await page.screenshot({ path: testInfo.outputPath("nota-desktop.png"), animations: "disabled" });
        await page.keyboard.press("Escape");
        await page.setViewportSize({ width: 820, height: 900 });
        await note.click();
        const popup = row.locator(".pick-note-popup");
        await expect(popup).toBeVisible();
        const popupBounds = await popup.boundingBox();
        expect(popupBounds.x).toBeGreaterThanOrEqual(0);
        expect(popupBounds.x + popupBounds.width).toBeLessThanOrEqual(820);
        await page.screenshot({ path: testInfo.outputPath("nota-tablet.png"), animations: "disabled" });
        await page.keyboard.press("Escape");
        await expect(note).toBeFocused();
        await expect(row.locator(".pick-note-popup")).not.toBeVisible();
      } else {
        await expect(note).toHaveCount(0);
      }
      const stream = row.getByRole("checkbox", { name: `Mostrar ${event} en el widget`, exact: true });
      await stream.check();
      await expect(stream).toBeEnabled();
      await expect(stream).toBeChecked();
      await stream.uncheck();
      await expect(stream).toBeEnabled();
      await expect(stream).not.toBeChecked();
      // Change the event's apparent time without virtualizing Firebase's network timers.
      await page.clock.setFixedTime(new Date(Date.now() + 15 * 60_000));
      await expect(stream).toBeEnabled();
      await expect(row.locator(".pick-lock-badge")).toHaveAttribute("aria-label", `Cerrado: evento iniciado · ${event}`);
      await stream.check();
      await expect(stream).toBeEnabled();
      await expect(stream).toBeChecked();
    } finally {
      await page.clock.setFixedTime(new Date());
      for (const id of await findVisualPickIds(request, uid, event)) {
        await deleteVisualDocument(request, `picks/${id}/private/bankroll`);
        await deleteVisualDocument(request, `perfiles/${uid}/obsSelections/${id}`);
        await deleteVisualDocument(request, `picks/${id}`);
      }
    }
  });
}

test("recorrido visual con viewer, tipster, OBS y owner sembrados", async ({ browser, request }) => {
  const contexts = [];
  let pickId;
  const event = `Fija visual ${randomUUID()}`;
  const headers = { Authorization: "Bearer owner" };
  const profileResponse = await request.get(`${firestoreRoot}/usernames/${visualUsername}`, { headers });
  expect(profileResponse.ok()).toBeTruthy();
  const tipsterUid = (await profileResponse.json()).fields.uid.stringValue;
  const profile = await request.get(`${firestoreRoot}/perfiles/${tipsterUid}`, { headers });
  expect(profile.ok()).toBeTruthy();
  const initialCount = Number((await profile.json()).fields.followerCount.integerValue);
  let baseline;
  async function newPage() {
    const context = await browser.newContext({ baseURL: "http://localhost:5500" });
    contexts.push(context);
    return context.newPage();
  }
  const viewer = await newPage();
  const tipster = await newPage();
  const owner = await newPage();
  const widget = await newPage();
  try {
    await test.step("modales: backdrop vacío y protección de borradores", async () => {
      for (const [path, dialog, email] of [
        ["/", "#viewerAuth", "#viewerAuthEmail"],
        ["/tipster-dashboard.html", "#tipsterAuth", "#email"],
        ["/owner.html", "#ownerAuth", "#creatorEmail"]
      ]) {
        await viewer.goto(path);
        if (path === "/") await viewer.locator("#viewerLogin").click();
        await expect(viewer.locator(dialog)).toBeVisible();
        await viewer.locator(email).fill("borrador@fijasenvivo.local");
        await viewer.mouse.click(2, 2);
        await expect(viewer.locator(dialog)).toBeVisible();
        await viewer.locator(email).fill("");
        await viewer.mouse.click(2, 2);
        if (path === "/") await expect(viewer.locator(dialog)).not.toBeVisible();
        else await expect(viewer).toHaveURL(/\/$/);
      }
    });
    await test.step("viewer sigue y deja de seguir; contador en tiempo real", async () => {
      await login(viewer, "viewer");
      await login(tipster, "tipster");
      await expect(tipster.locator("#pickForm")).toBeVisible();
      await expect(tipster.locator("#myPicks")).toBeVisible();
      await expect(tipster.locator("#bankrollSummary")).toBeAttached();
      await expect(tipster.locator("#widgetPreviewFrame")).toBeAttached();
      const follow = viewer.locator(`#directoryList button[data-follow="${tipsterUid}"]`);
      await expect(follow).toBeEnabled();
      baseline = initialCount;
      if (await follow.getAttribute("aria-pressed") === "true") {
        await follow.click();
        baseline--;
        await expect(tipster.locator("#followerCount")).toHaveText(String(baseline));
      }
      await follow.click();
      await expect(follow).toHaveAttribute("aria-pressed", "true");
      await expect(tipster.locator("#followerCount")).toHaveText(String(baseline + 1));
      await follow.click();
      await expect(follow).toHaveAttribute("aria-pressed", "false");
      await expect(tipster.locator("#followerCount")).toHaveText(String(baseline));
      await follow.click();
      await expect(tipster.locator("#followerCount")).toHaveText(String(baseline + 1));
    });
    await test.step("tipster publica una fija y aparece en el feed del viewer", async () => {
      await tipster.locator("#sport").selectOption("futbol");
      await tipster.locator("#odds").fill("1.85");
      await tipster.locator("#event").fill(event);
      await tipster.locator("#league").fill("Liga de prueba");
      await tipster.locator("#market").fill("Más/Menos");
      await tipster.locator("#selection").fill("Más de 1.5 goles");
      await tipster.locator("#bookmaker").selectOption("betano");
      const local = await tipster.evaluate(() => {
        const date = new Date(Date.now() + 5 * 60_000);
        return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
      });
      await tipster.locator("#eventDate").fill(local);
      await tipster.locator("#savePickButton").click();
      await tipster.locator("#confirmPickPublication").click();
      const stream = tipster.getByRole("checkbox", { name: `Mostrar ${event} en el widget`, exact: true });
      await expect(stream).toBeVisible();
      pickId = await stream.getAttribute("data-id");
      const bankroll = await request.patch(`${firestoreRoot}/picks/${pickId}/private/bankroll`, {
        headers,
        data: { fields: {
          stakeAmount: { doubleValue: 10 },
          stakeMinorUnits: { integerValue: "1000" },
          currency: { stringValue: "PEN" },
          created_at: { timestampValue: new Date().toISOString() },
          updated_at: { timestampValue: new Date().toISOString() }
        } }
      });
      expect(bankroll.ok(), await bankroll.text()).toBeTruthy();
      const pickRow = tipster.locator("#myPicks tr").filter({ hasText: event });
      await expect(pickRow.locator(".pick-lock-badge")).toHaveCount(0);
      await expect(pickRow.locator('button[data-action="edit"]')).toBeEnabled();
      await expect(pickRow.locator('button[data-action="delete"]')).toBeEnabled();
      await viewer.locator("#followingTab").click();
      await expect(viewer.locator("#followingPicks")).toContainText(event);
      await stream.check();
      await expect(stream).toBeEnabled();
      const clientTimestampCreate = await tipster.evaluate(async () => {
        const { firebaseAuth, firebaseDb } = await import("/firebase-config.js?v=2");
        const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
        const id = `client-time-${crypto.randomUUID()}`;
        try {
          await setDoc(doc(firebaseDb, "picks", id), {
            user_id: firebaseAuth.currentUser.uid,
            sport: "futbol", event: "Prueba de timestamp", selection: "Más de 1.5 goles",
            odds: 1.85, bookmaker: "betano", league: "Liga", market: "Más/Menos", stake: 1,
            event_date: new Date(Date.now() + 60 * 60_000),
            confianza: null, analysis: "", destacada: false, show_on_stream: false,
            status: "pending", created_at: new Date(Date.now() - 60_000)
          });
          return { id, result: "allowed" };
        } catch (error) {
          return { id, result: error.code };
        }
      });
      if (clientTimestampCreate.result === "allowed") {
        const cleanup = await request.delete(`${firestoreRoot}/picks/${clientTimestampCreate.id}`, { headers });
        expect(cleanup.ok()).toBeTruthy();
      }
      expect(clientTimestampCreate.result).toBe("permission-denied");
      const editableStake = await tipster.evaluate(async id => {
        const { firebaseDb } = await import("/firebase-config.js?v=2");
        const { doc, getDoc, updateDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
        const bankrollRef = doc(firebaseDb, "picks", id, "private", "bankroll");
        try {
          const snapshot = await getDoc(bankrollRef);
          const data = snapshot.data();
          await updateDoc(bankrollRef, {
            stakeAmount: data.stakeAmount + 1,
            stakeMinorUnits: data.stakeMinorUnits + 100,
            updated_at: serverTimestamp()
          });
          return "updated";
        } catch (error) { return error.code; }
      }, pickId);
      expect(editableStake).toBe("updated");
      const startedPick = await request.patch(
        `${firestoreRoot}/picks/${pickId}?updateMask.fieldPaths=event_date&updateMask.fieldPaths=status`,
        { headers, data: { fields: {
          event_date: { timestampValue: new Date(Date.now() - 60_000).toISOString() },
          status: { stringValue: "pending" }
        } } }
      );
      expect(startedPick.ok(), await startedPick.text()).toBeTruthy();
      const temporalMutations = await tipster.evaluate(async id => {
        const { firebaseDb } = await import("/firebase-config.js?v=2");
        const { doc, getDoc, updateDoc, runTransaction, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
        const pickRef = doc(firebaseDb, "picks", id);
        const bankrollRef = doc(pickRef, "private", "bankroll");
        const results = [];
        try { await updateDoc(pickRef, { odds: 2.15 }); results.push("allowed"); }
        catch (error) { results.push(error.code); }
        try {
          const snapshot = await getDoc(bankrollRef);
          const data = snapshot.data();
          await updateDoc(bankrollRef, {
            stakeAmount: data.stakeAmount + 1,
            stakeMinorUnits: data.stakeMinorUnits + 100,
            updated_at: serverTimestamp()
          });
          results.push("allowed");
        } catch (error) { results.push(error.code); }
        try {
          await runTransaction(firebaseDb, async transaction => {
            const bankrollSnapshot = await transaction.get(bankrollRef);
            if (bankrollSnapshot.exists()) transaction.delete(bankrollRef);
            transaction.delete(pickRef);
          });
          results.push("allowed");
        } catch (error) { results.push(error.code); }
        return results;
      }, pickId);
      expect(temporalMutations).toEqual(["permission-denied", "permission-denied", "permission-denied"]);
      await expect(pickRow.locator(".pick-lock-badge")).toHaveText("Bloqueado: evento iniciado");
      await expect(pickRow.locator('button[data-action="edit"]')).toBeDisabled();
      await expect(pickRow.locator('button[data-action="delete"]')).toBeDisabled();
      const qualifiedPick = await request.patch(
        `${firestoreRoot}/picks/${pickId}?updateMask.fieldPaths=event_date&updateMask.fieldPaths=status`,
        { headers, data: { fields: {
          event_date: { timestampValue: new Date(Date.now() + 60 * 60_000).toISOString() },
          status: { stringValue: "won" }
        } } }
      );
      expect(qualifiedPick.ok(), await qualifiedPick.text()).toBeTruthy();
      await expect(pickRow.locator(".pick-lock-badge")).toHaveText("Bloqueado: pronóstico calificado");
      const qualifiedMutations = await tipster.evaluate(async id => {
        const { firebaseDb } = await import("/firebase-config.js?v=2");
        const { doc, updateDoc, runTransaction } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
        const pickRef = doc(firebaseDb, "picks", id);
        const bankrollRef = doc(pickRef, "private", "bankroll");
        const results = [];
        try { await updateDoc(pickRef, { odds: 2.2 }); results.push("allowed"); }
        catch (error) { results.push(error.code); }
        try {
          await runTransaction(firebaseDb, async transaction => {
            const bankrollSnapshot = await transaction.get(bankrollRef);
            if (bankrollSnapshot.exists()) transaction.delete(bankrollRef);
            transaction.delete(pickRef);
          });
          results.push("allowed");
        } catch (error) { results.push(error.code); }
        return results;
      }, pickId);
      expect(qualifiedMutations).toEqual(["permission-denied", "permission-denied"]);
    });
    await test.step("OBS renderiza la fija seleccionada sin sesión", async () => {
      await widget.goto(`/overlay.html?u=${visualUsername}`);
      await expect(widget.locator("#widget")).toBeVisible();
      await expect(widget.locator("#widgetName")).toHaveText(visualAccounts.tipster.name);
      await expect(widget.locator("#pickList")).toContainText(event);
      await expect(widget.locator("#widgetMessage")).not.toBeVisible();
    });
    await test.step("owner accede y carga métricas globales", async () => {
      await login(owner, "owner");
      await expect(owner.locator("#pendingCount")).toHaveText(/^\d+$/);
      await expect(owner.locator("#tipsterCount")).toHaveText(/^\d+$/);
      await expect(owner.locator("#tipsters")).toContainText(visualAccounts.tipster.name);
    });
  } finally {
    if (!pickId) {
      const response = await request.post(`${firestoreRoot}:runQuery`, {
        headers, data: { structuredQuery: {
          from: [{ collectionId: "picks" }],
          where: { fieldFilter: { field: { fieldPath: "event" }, op: "EQUAL", value: { stringValue: event } } }
        } }
      });
      expect(response.ok(), "Localizar exclusivamente la fija de esta ejecución").toBeTruthy();
      const rows = await response.json();
      pickId = rows.find(row => row.document)?.document.name.split("/").at(-1);
    }
    if (pickId) {
      for (const path of [`picks/${pickId}/private/bankroll`, `picks/${pickId}`]) {
        const response = await request.delete(`${firestoreRoot}/${path}`, { headers });
        expect(response.ok() || response.status() === 404, `Limpiar ${path}`).toBeTruthy();
      }
    }
    if (baseline !== undefined && !viewer.isClosed()) {
      await viewer.goto("/");
      const follow = viewer.locator(`#directoryList button[data-follow="${tipsterUid}"]`);
      await expect(follow).toBeEnabled();
      const restoreFollowing = initialCount !== baseline;
      if ((await follow.getAttribute("aria-pressed") === "true") !== restoreFollowing) {
        await follow.click();
        await expect(follow).toBeEnabled();
      }
      await expect(tipster.locator("#followerCount")).toHaveText(String(initialCount));
    }
    await Promise.all(contexts.map(context => context.close()));
  }
});
