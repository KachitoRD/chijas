import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mockGooglePopup } from "./helpers/auth-emulator.js";
import { auditButtons } from "./helpers/ui-audit.js";

const authRoot = "http://127.0.0.1:9099";
const firestoreRoot = "http://127.0.0.1:8080/v1/projects/demo-fijas-vivo/databases/(default)/documents";
const password = "Test-password-123!";
let account;

test.beforeEach(async ({ request, page }) => {
  const email = `auth-${randomUUID()}@example.test`;
  const response = await request.post(`${authRoot}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    data: { email, password, returnSecureToken: true }
  });
  expect(response.ok()).toBeTruthy();
  account = { ...await response.json(), email };
  await request.patch(`${firestoreRoot}/legalAcceptances/${account.localId}/versions/2026-10-03`, {
    headers: { Authorization: "Bearer owner" },
    data: { fields: {
      uid: { stringValue: account.localId }, terms_version: { stringValue: "2026-10-03" },
      privacy_version: { stringValue: "2026-10-03" }, age_confirmed: { booleanValue: true },
      accepted_at: { timestampValue: new Date().toISOString() }
    } }
  });
  const verified = await request.post(`${authRoot}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key`, {
    headers: { Authorization: "Bearer owner" },
    data: { localId: account.localId, emailVerified: true }
  });
  expect(verified.ok()).toBeTruthy();
  await page.route(/https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/, route => route.abort());
});

test.afterEach(async ({ request, page }) => {
  if (page.url().startsWith("http://localhost:5500")) {
    const user = await page.evaluate(async () => {
      const { firebaseAuth } = await import("/firebase-config.js?v=2");
      return firebaseAuth.currentUser ? { uid: firebaseAuth.currentUser.uid, idToken: await firebaseAuth.currentUser.getIdToken() } : null;
    });
    if (user && user.uid !== account.localId) {
      await request.delete(`${firestoreRoot}/users/${user.uid}`, { headers: { Authorization: "Bearer owner" } });
      await request.delete(`${firestoreRoot}/legalAcceptances/${user.uid}/versions/2026-10-03`, { headers: { Authorization: "Bearer owner" } });
      await request.post(`${authRoot}/identitytoolkit.googleapis.com/v1/accounts:delete?key=demo-key`, { data: { idToken: user.idToken } });
    }
  }
  await request.delete(`${firestoreRoot}/users/${account.localId}`, { headers: { Authorization: "Bearer owner" } });
  await request.delete(`${firestoreRoot}/platformAdmins/${account.localId}`, { headers: { Authorization: "Bearer owner" } });
  await request.delete(`${firestoreRoot}/legalAcceptances/${account.localId}/versions/2026-10-03`, { headers: { Authorization: "Bearer owner" } });
  const response = await request.post(`${authRoot}/identitytoolkit.googleapis.com/v1/accounts:delete?key=demo-key`, { data: { idToken: account.idToken } });
  expect(response.ok()).toBeTruthy();
});

for (const surface of [
  { path: "/", email: "#viewerAuthEmail", reset: "#viewerAuthReset", message: "#viewerAuthMessage" },
  { path: "/admin.html", email: "#email", reset: "#resetTipsterPassword", message: "#loginMessage" },
  { path: "/owner.html", email: "#creatorEmail", reset: "#resetCreatorPassword", message: "#creatorLoginMessage" }
]) {
  test(`recuperación real en Auth Emulator desde ${surface.path}`, async ({ page, request }, testInfo) => {
    await page.goto(surface.path);
    if (surface.path === "/") await page.locator("#viewerLogin").click();
    await page.locator(surface.email).fill(account.email);
    await page.locator(surface.reset).click();
    await expect(page.locator(surface.message)).toContainText("recibirás un enlace");
    const codes = await (await request.get(`${authRoot}/emulator/v1/projects/demo-fijas-vivo/oobCodes`)).json();
    expect(codes.oobCodes.some(code => code.email === account.email && code.requestType === "PASSWORD_RESET")).toBeTruthy();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath("auth-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: testInfo.outputPath("auth-desktop.png"), fullPage: true });
  });
}

test("login viewer por correo persiste y las credenciales inválidas tienen feedback", async ({ page }) => {
  await page.goto("/");
  await page.locator("#viewerLogin").click();
  await page.locator("#viewerAuthEmail").fill(account.email);
  await page.locator("#viewerAuthPassword").fill("wrong-password");
  await page.locator("#viewerAuthSubmit").click();
  await expect(page.locator("#viewerAuthMessage")).toContainText("incorrectos");
  await page.locator("#viewerAuthPassword").fill(password);
  await page.locator("#viewerAuthSubmit").click();
  await expect(page.locator("#viewerAuth")).not.toBeVisible();
  await expect(page.locator("#viewerName")).toHaveText(account.email);
  await page.reload();
  await expect(page.locator("#viewerName")).toHaveText(account.email);
  await expect(page.locator("#viewerLogin")).toBeHidden();
});

test("registro viewer guarda aceptación y exige verificar correo", async ({ page, request }) => {
  await page.goto("/");
  await page.locator("#viewerLogin").click();
  await page.locator("#viewerAuthToggle").click();
  const email = `registered-${randomUUID()}@example.test`;
  await page.locator("#viewerAuthEmail").fill(email);
  await page.locator("#viewerAuthPassword").fill(password);
  await page.locator("#viewerAuthName").fill("Viewer registrado");
  await page.locator("#viewerAuthAge").check();
  await page.locator("#viewerAuthTerms").check();
  await page.locator("#viewerAuthSubmit").click();
  await expect(page.locator("#viewerAuthMessage")).toContainText("Cuenta creada");
  const codes = await (await request.get(`${authRoot}/emulator/v1/projects/demo-fijas-vivo/oobCodes`)).json();
  const verification = codes.oobCodes.find(code => code.email === email && code.requestType === "VERIFY_EMAIL");
  expect(verification).toBeTruthy();
  await request.post(`${authRoot}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key`, { data: { oobCode: verification.oobCode } });
  await page.locator("#viewerAuthPassword").fill(password);
  await page.locator("#viewerAuthSubmit").click();
  await expect(page.locator("#viewerName")).toHaveText("Viewer registrado");
});

test("owner usa Google alternativo sin conceder permisos administrativos", async ({ page }) => {
  await mockGooglePopup(page, { subject: `google-${account.localId}`, email: `google-${account.email}`, name: "Google sin permisos" });
  await page.goto("/owner.html");
  await page.locator("#creatorGoogle").click();
  await expect(page.locator("#denied")).toBeVisible();
  await expect(page.locator("#ownerDashboard")).toBeHidden();
});

test("owner con autorización conserva login por contraseña", async ({ page, request }, testInfo) => {
  test.setTimeout(60_000);
  await request.patch(`${firestoreRoot}/platformAdmins/${account.localId}`, {
    headers: { Authorization: "Bearer owner" }, data: { fields: { enabled: { booleanValue: true } } }
  });
  await page.goto("/owner.html");
  await page.locator("#creatorEmail").fill(account.email);
  await page.locator("#creatorPassword").fill(password);
  await page.locator("#creatorLoginButton").click();
  await expect(page.locator("#ownerDashboard")).toBeVisible();
  await expect(page.locator("#ownerAuth")).not.toBeVisible();
  await expect(page.locator("#applications")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#profileRequests")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#tipsters")).toHaveAttribute("aria-busy", "false");
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await auditButtons(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath(`owner-dashboard-${width}.png`), animations: "disabled" });
  }
});
