import { randomUUID } from "node:crypto";
import { expect, request as playwrightRequest } from "@playwright/test";
import { writeVisualDocument, deleteVisualDocument, firestoreRoot } from "./visual-seed.js";

const authRoot = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const headers = { Authorization: "Bearer owner" };

// Unique identities only. Never reset an emulator or seed shared visual accounts.
export async function bankrollFixture(request) {
  const email = `ledger-${randomUUID()}@example.test`;
  const password = "Ledger-test-123!";
  const response = await request.post(`${authRoot}/accounts:signUp?key=demo-key`, {
    data: { email, password, returnSecureToken: true }
  });
  expect(response.ok()).toBeTruthy();
  const { localId: uid } = await response.json();
  const verified = await request.post(`${authRoot}/accounts:update?key=demo-key`, {
    headers, data: { localId: uid, emailVerified: true }
  });
  expect(verified.ok()).toBeTruthy();
  const paths = new Set();
  async function write(path, data) {
    paths.add(path);
    await writeVisualDocument(request, path, data);
  }
  await write(`users/${uid}`, {
    uid, role: "viewer", email, displayName: "Bankroll de prueba", photoURL: null, created_at: new Date()
  });
  await write(`perfiles/${uid}`, {
    id: uid, username: `ledger-${uid.toLowerCase()}`, nombre_publico: "Bankroll de prueba",
    bio: null, color_primario: "#34d399", tipster_status: "approved", followerCount: 0, created_at: new Date()
  });
  await write(`perfiles_social/${uid}`, {
    avatar_url: null, banner_url: null, kick_url: null, twitch_url: null,
    youtube_url: null, telegram_url: null, twitter_url: null, instagram_url: null
  });
  await write(`legalAcceptances/${uid}/versions/2026-10-03`, {
    uid, terms_version: "2026-10-03", privacy_version: "2026-10-03",
    age_confirmed: true, accepted_at: new Date()
  });
  return {
    uid, email, password, write,
    async cleanup() {
      // Independent context keeps exact cleanup usable even after a test timeout.
      const cleanupRequest = await playwrightRequest.newContext();
      try {
        for (const currency of ["PEN", "USD", "EUR", "GBP"]) {
          const path = `users/${uid}/bankrollAccounts/${currency}`;
          const list = await cleanupRequest.get(`${firestoreRoot}/${path}/movements`, { headers });
          expect(list.ok()).toBeTruthy();
          for (const item of (await list.json()).documents || []) {
            await deleteVisualDocument(cleanupRequest, `${path}/movements/${item.name.split("/").at(-1)}`);
          }
          await deleteVisualDocument(cleanupRequest, path);
        }
        for (const path of [...paths].reverse()) await deleteVisualDocument(cleanupRequest, path);
        for (const path of [`presencia/${uid}`, `viewerPresence/${uid}`]) await deleteVisualDocument(cleanupRequest, path);
        const deleted = await cleanupRequest.post(`${authRoot}/accounts:delete?key=demo-key`, { headers, data: { localId: uid } });
        expect(deleted.ok()).toBeTruthy();
      } finally {
        await cleanupRequest.dispose();
      }
    }
  };
}

export async function loginLedger(page, fixture, standalone = false) {
  await page.route(/https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/, route => route.abort());
  await page.goto("/");
  await page.locator("#viewerLogin").click();
  await page.locator("#viewerAuthEmail").fill(fixture.email);
  await page.locator("#viewerAuthPassword").fill(fixture.password);
  await page.locator("#viewerAuthSubmit").click();
  await expect(page.locator("#viewerAuth")).not.toBeVisible();
  await page.goto(standalone ? "/tipster-dashboard.html" : "/#view=tipster");
  await expect(page.locator("#tipsterTabs")).toBeVisible();
}
