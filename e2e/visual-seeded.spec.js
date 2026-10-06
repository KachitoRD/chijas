import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { visualAccounts, visualUsername, firestoreRoot } from "./helpers/visual-seed.js";

async function login(page, role) {
  const account = visualAccounts[role];
  if (role === "viewer") {
    await page.goto("/");
    await page.locator("#viewerLogin").click();
    await page.locator("#viewerAuthEmail").fill(account.email);
    await page.locator("#viewerAuthPassword").fill(account.password);
    await page.locator("#viewerAuthSubmit").click();
    await expect(page.locator("#viewerAuth")).not.toBeVisible();
  } else {
    await page.goto(role === "owner" ? "/owner.html" : "/admin.html");
    await page.locator(role === "owner" ? "#creatorEmail" : "#email").fill(account.email);
    await page.locator(role === "owner" ? "#creatorPassword" : "#password").fill(account.password);
    await page.locator(role === "owner" ? "#creatorLoginButton" : "#loginButton").click();
    await expect(page.locator(role === "owner" ? "#ownerDashboard" : "#dashboard")).toBeVisible();
    await expect(page.locator(role === "owner" ? "#ownerAuth" : "#tipsterAuth")).not.toBeVisible();
  }
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
        ["/admin.html", "#tipsterAuth", "#email"],
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
      await tipster.locator("#selection").fill("Más de 1.5 goles");
      await tipster.locator("#bookmaker").selectOption("betano");
      const local = await tipster.evaluate(() => {
        const date = new Date();
        return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
      });
      await tipster.locator("#eventDate").fill(local);
      await tipster.locator("#savePickButton").click();
      const stream = tipster.getByRole("checkbox", { name: `Mostrar ${event} en el widget`, exact: true });
      await expect(stream).toBeVisible();
      pickId = await stream.getAttribute("data-id");
      await viewer.locator("#followingTab").click();
      await expect(viewer.locator("#followingPicks")).toContainText(event);
      await stream.check();
      await expect(stream).toBeEnabled();
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
          where: { fieldFilter: { field: { fieldPath: "evento" }, op: "EQUAL", value: { stringValue: event } } }
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
