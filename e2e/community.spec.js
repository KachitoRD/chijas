import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mockGooglePopup } from "./helpers/auth-emulator.js";
import { auditButtons } from "./helpers/ui-audit.js";

const project = "demo-fijas-vivo";
const authRoot = "http://127.0.0.1:9099";
const root = `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents`;
const headers = { Authorization: "Bearer owner" };
let fixture;

function fields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key,
    value === null ? { nullValue: null }
      : value instanceof Date ? { timestampValue: value.toISOString() }
        : typeof value === "boolean" ? { booleanValue: value }
          : typeof value === "number" ? Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
            : { stringValue: value }
  ]));
}

async function seed(request, path, data) {
  fixture.documents.add(path);
  const response = await request.patch(`${root}/${path}`, { headers, data: { fields: fields(data) } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function seedTipster(request, id, index) {
  const username = `${fixture.prefix}-${index}`;
  await seed(request, `perfiles/${id}`, {
    id, username, nombre_publico: `Comunidad ${index}`, bio: null, color_primario: "#34d399",
    tipster_status: "approved", is_online: false, last_active_at: null,
    created_at: new Date("2026-10-04T12:00:00Z"),
    ...(index === 0 ? {} : { followerCount: 0 })
  });
  await seed(request, `perfiles_social/${id}`, {
    avatar_url: null, banner_url: null, kick_url: null, twitch_url: null,
    youtube_url: null, telegram_url: null, twitter_url: null, instagram_url: null
  });
  await seed(request, `usernames/${username}`, { uid: id });
  await seed(request, `picks/${id}-pick`, {
    user_id: id, deporte: "futbol", evento: `Evento comunidad ${index}`,
    seleccion: "Más de 1.5 goles", prediccion: "Más de 1.5 goles", cuota: 1.85,
    casa_de_apuestas: "betano", casa_apuestas: "betano", fecha_evento: new Date("2026-10-10T20:00:00Z"),
    confianza: null, nota: null, destacada: false, show_on_stream: false, estado: "pendiente",
    created_at: new Date(Date.UTC(2026, 9, 5, 12, index))
  });
}

function trackUser(user) {
  fixture.users.set(user.uid, user.idToken);
  fixture.documents.add(`users/${user.uid}`);
  fixture.documents.add(`presencia/${user.uid}`);
  fixture.documents.add(`legalAcceptances/${user.uid}/versions/2026-10-03`);
  for (const id of fixture.ids) fixture.documents.add(`follows/${user.uid}_${id}`);
}

async function signInGoogle(page, label) {
  const user = await page.evaluate(async ({ prefix, label }) => {
    const { firebaseAuth } = await import("/firebase-config.js?v=2");
    const { GoogleAuthProvider, signInWithCredential } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    const token = JSON.stringify({
      sub: `${prefix}-${label}`, email: `${prefix}-${label}@example.test`,
      email_verified: true, name: `Viewer ${label}`
    });
    const credential = await signInWithCredential(firebaseAuth, GoogleAuthProvider.credential(token));
    return { uid: credential.user.uid, idToken: await credential.user.getIdToken() };
  }, { prefix: fixture.prefix, label });
  trackUser(user);
  await expect(page.locator("#viewerName")).toHaveText(`Viewer ${label}`);
  await expect(page.locator(`#directoryList button[data-follow="${fixture.ids[0]}"]`)).toBeEnabled();
  return user;
}

async function acceptTerms(request, user) {
  await seed(request, `legalAcceptances/${user.uid}/versions/2026-10-03`, {
    uid: user.uid, terms_version: "2026-10-03", privacy_version: "2026-10-03",
    age_confirmed: true, accepted_at: new Date()
  });
}

async function readCount(request, id) {
  const response = await request.get(`${root}/perfiles/${id}`, { headers });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return Number(body.fields.followerCount?.integerValue || 0);
}

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ request, page }) => {
  fixture = { prefix: `cm${randomUUID().replaceAll("-", "").slice(0, 12)}`, ids: [], documents: new Set(), users: new Map() };
  for (let index = 0; index < 11; index++) {
    const id = `${fixture.prefix}-${index}`;
    fixture.ids.push(id);
    await seedTipster(request, id, index);
  }
  await page.route(/https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/, route => route.abort());
  await mockGooglePopup(page, { subject: `${fixture.prefix}-popup`, email: `${fixture.prefix}-popup@example.test`, name: "Viewer Google" });
  await page.goto("/");
  await expect(page.locator("#viewerLogin")).toBeEnabled();
  await expect(page.locator(`#directoryList button[data-follow="${fixture.ids[0]}"]`)).toBeEnabled();
});

test.afterEach(async ({ request }) => {
  if (!fixture) return;
  for (const path of [...fixture.documents].sort((a, b) => b.split("/").length - a.split("/").length)) {
    const response = await request.delete(`${root}/${path}`, { headers });
    expect(response.ok() || response.status() === 404, `Limpiar ${path}`).toBeTruthy();
  }
  for (const idToken of fixture.users.values()) {
    const response = await request.post(`${authRoot}/identitytoolkit.googleapis.com/v1/accounts:delete?key=demo-key`, {
      data: { idToken }
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
});

test("conectados muestran avatar circular, nickname y un máximo de 20 sin desplegable", async ({ page, request }) => {
      test.setTimeout(90_000);
      const ownCards = page.locator(`#onlineGrid a[data-username^="${fixture.prefix}"]`);
      await expect(page.locator("#onlineGrid")).toHaveAttribute("aria-busy", "false");
      await expect(ownCards).toHaveCount(0);
      for (let index = fixture.ids.length; index < 21; index++) {
        const id = `${fixture.prefix}-${index}`;
        fixture.ids.push(id);
        await seedTipster(request, id, index);
      }
      for (const [index, id] of fixture.ids.entries()) {
        await seed(request, `perfiles/${id}`, {
          id, username: `${fixture.prefix}-${index}`,
          nombre_publico: `AAA QA ${String(index).padStart(2, "0")}`,
          tipster_status: "approved", followerCount: 0,
          bio: null, color_primario: "#34d399", is_online: false, last_active_at: null, created_at: new Date()
        });
      }
      await seed(request, `presencia/${fixture.ids[0]}`, { is_online: true, last_active_at: new Date() });
      await expect(ownCards).toHaveCount(1);
      await expect(ownCards.first()).toContainText(`@${fixture.prefix}-0`);
      await expect(ownCards.first().locator(".online-avatar")).toHaveCSS("border-radius", "50%");
      await expect(ownCards.first().locator(".online-status")).toHaveAttribute("aria-label", "Conectado en la plataforma");
      for (const id of fixture.ids.slice(1)) {
        await seed(request, `presencia/${id}`, { is_online: true, last_active_at: new Date() });
      }
      await expect(page.locator("#onlineGrid .online-card")).toHaveCount(20);
      await expect(ownCards).toHaveCount(20);
      expect(await page.locator("#onlineGrid").evaluate(element => !!element.closest("details"))).toBe(false);
      const id = fixture.ids[0];
      await seed(request, `perfiles_social/${id}`, {
        avatar_url: "data:image/png;base64,invalid", banner_url: null, kick_url: null, twitch_url: null,
        youtube_url: null, telegram_url: null, twitter_url: null, instagram_url: null
      });
      await page.reload();
      await expect(ownCards).toHaveCount(20);
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
        await expect(ownCards.first().locator(".online-avatar-fallback")).toBeVisible();
      }
});

test("Google popup, consentimiento, persistencia y respuesta optimista sin duplicar follows", async ({ page, request }, testInfo) => {
  const id = fixture.ids[0];
  const follow = page.locator(`#directoryList button[data-follow="${id}"]`);
  await follow.click();
  await page.locator("#viewerAuthGoogle").click();
  await expect(page.locator("#viewerConsent")).toBeVisible();
  const user = await page.evaluate(async () => {
    const { firebaseAuth } = await import("/firebase-config.js?v=2");
    return { uid: firebaseAuth.currentUser.uid, idToken: await firebaseAuth.currentUser.getIdToken() };
  });
  trackUser(user);
  await page.locator("#viewerAge").check();
  await page.locator("#viewerTerms").check();
  await page.locator("#viewerConsentSave").click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect(follow).toBeEnabled();
  await expect.poll(() => readCount(request, id)).toBe(1);
  const document = await request.get(`${root}/users/${user.uid}`, { headers });
  const viewer = await document.json();
  expect(viewer.fields.role.stringValue).toBe("viewer");
  await page.reload();
  await expect(page.locator("#viewerName")).toHaveText("Viewer Google");
  await expect(page.locator("#viewerLogin")).toBeHidden();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect(follow).toBeEnabled();
  const saved = await (await request.get(`${root}/users/${user.uid}`, { headers })).json();
  expect(saved.fields.created_at).toEqual(viewer.fields.created_at);
  await page.route("**/documents:commit", async route => {
    await new Promise(resolve => setTimeout(resolve, 600));
    await route.continue();
  });
  const immediate = await follow.evaluate(button => {
    const start = performance.now();
    button.click();
    return { elapsed: performance.now() - start, pressed: button.getAttribute("aria-pressed"), busy: button.getAttribute("aria-busy") };
  });
  expect(immediate.elapsed).toBeLessThan(100);
  expect(immediate.pressed).toBe("false");
  expect(immediate.busy).toBe("true");
  await expect(follow).toBeEnabled();
  await expect.poll(() => readCount(request, id)).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("community-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: testInfo.outputPath("community-desktop.png"), fullPage: true });
  await page.locator("#viewerLogout").click();
  await expect(page.locator("#viewerLogin")).toBeVisible();
  await page.locator("#followingTab").click();
  await expect(page.locator("#followingPicks article")).toHaveCount(0);
});

test("feed con 11 creadores combina grupos, ordena, actualiza y excluye revocados", async ({ page, request }, testInfo) => {
  test.setTimeout(60_000);
  const user = await signInGoogle(page, "feed");
  await acceptTerms(request, user);
  await page.evaluate(async ids => {
    const { firebaseAuth } = await import("/firebase-config.js?v=2");
    const { setFollowing } = await import("/community.js");
    for (const id of ids) await setFollowing(firebaseAuth.currentUser, id, true);
  }, fixture.ids);
  await page.locator("#followingTab").click();
  await expect(page.locator("#followingPicks article")).toHaveCount(11);
  await expect(page.locator("#followingPicks article").first()).toContainText("Evento comunidad 10");
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await auditButtons(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath(`following-feed-${width}.png`), animations: "disabled" });
  }
  await seed(request, `picks/${fixture.ids[10]}-pick`, {
    user_id: fixture.ids[10], evento: "Evento actualizado", seleccion: "Nueva selección",
    cuota: 2, casa_de_apuestas: "betano", fecha_evento: new Date("2026-10-10T20:00:00Z"),
    created_at: new Date("2026-10-05T13:00:00Z"), estado: "ganada"
  });
  await expect(page.locator("#followingPicks article").first()).toContainText("Evento actualizado");
  const revoked = await request.patch(`${root}/perfiles/${fixture.ids[10]}?updateMask.fieldPaths=tipster_status`, {
    headers, data: { fields: { tipster_status: { stringValue: "revoked" } } }
  });
  expect(revoked.ok()).toBeTruthy();
  await expect(page.locator("#followingPicks article")).toHaveCount(10);
  await expect(page.locator("#followingPicks")).not.toContainText("Evento actualizado");
  await page.locator("#exploreTab").click();
  await page.locator("#followingTab").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#exploreTab")).toBeFocused();
});

test("reglas bloquean escalada, suplantación, contadores aislados y relaciones no atómicas", async ({ page, request }) => {
  const user = await signInGoogle(page, "rules");
  const id = fixture.ids[0];
  const denied = await page.evaluate(async ({ uid, id }) => {
    const { firebaseDb } = await import("/firebase-config.js?v=2");
    const { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const operations = [
      () => updateDoc(doc(firebaseDb, "users", uid), { role: "tipster" }),
      () => setDoc(doc(firebaseDb, "users", `${uid}-other`), { uid: `${uid}-other`, role: "viewer" }),
      () => getDoc(doc(firebaseDb, "users", `${uid}-other`)),
      () => updateDoc(doc(firebaseDb, "perfiles", id), { followerCount: 500, followerCountUpdatedBy: uid }),
      () => setDoc(doc(firebaseDb, "follows", `${uid}_${id}`), { followerId: uid, tipsterId: id, created_at: serverTimestamp() }),
      () => deleteDoc(doc(firebaseDb, "users", uid))
    ];
    const results = [];
    for (const operation of operations) {
      try { await operation(); results.push("allowed"); }
      catch (error) { results.push(error.code); }
    }
    return results;
  }, { uid: user.uid, id });
  expect(denied).toEqual(Array(6).fill("permission-denied"));
  await acceptTerms(request, user);
  const afterConsent = await page.evaluate(async id => {
    const { firebaseAuth, firebaseDb } = await import("/firebase-config.js?v=2");
    const { setFollowing } = await import("/community.js");
    const { doc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const uid = firebaseAuth.currentUser.uid;
    let code;
    try { await setDoc(doc(firebaseDb, "follows", `${uid}_${id}`), { followerId: uid, tipsterId: id, created_at: serverTimestamp() }); }
    catch (error) { code = error.code; }
    await Promise.all([setFollowing(firebaseAuth.currentUser, id, true), setFollowing(firebaseAuth.currentUser, id, true)]);
    return code;
  }, id);
  expect(afterConsent).toBe("permission-denied");
  await expect.poll(() => readCount(request, id)).toBe(1);
  const button = page.locator(`#directoryList button[data-follow="${id}"]`);
  await expect(button).toHaveAttribute("aria-pressed", "true");
  const beforeConsent = await request.delete(`${root}/legalAcceptances/${user.uid}/versions/2026-10-03`, { headers });
  expect(beforeConsent.ok()).toBeTruthy();
  await page.reload();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.locator("#viewerConsent")).toBeVisible();
  await page.locator("#viewerConsentCancel").click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => readCount(request, id)).toBe(1);
});

test("contador del panel tipster se actualiza con follows concurrentes de viewers distintos", async ({ page, browser, request }, testInfo) => {
  test.setTimeout(60_000);
  const tipster = await signInGoogle(page, "tipster");
  fixture.ids.push(tipster.uid);
  await seedTipster(request, tipster.uid, 12);
  await acceptTerms(request, tipster);
  await page.goto("/admin.html");
  await expect(page.locator("#dashboardTitle")).toHaveText("Panel de tipster");
  await expect(page.locator("#followerCount")).toHaveText("0");
  await expect(page.locator("#myPicks")).toHaveAttribute("aria-busy", "false");
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await auditButtons(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath(`tipster-dashboard-${width}.png`), animations: "disabled" });
  }
  const contexts = [];
  try {
    for (const label of ["first", "second"]) {
      const context = await browser.newContext();
      contexts.push(context);
      const viewerPage = await context.newPage();
      await viewerPage.goto("/");
      const viewer = await signInGoogle(viewerPage, label);
      await acceptTerms(request, viewer);
    }
    await Promise.all(contexts.map(context => context.pages()[0].evaluate(async id => {
      const { firebaseAuth } = await import("/firebase-config.js?v=2");
      const { setFollowing } = await import("/community.js");
      await setFollowing(firebaseAuth.currentUser, id, true);
    }, tipster.uid)));
    await expect(page.locator("#followerCount")).toHaveText("2");
    await Promise.all(contexts.map(context => context.pages()[0].evaluate(async id => {
      const { firebaseAuth } = await import("/firebase-config.js?v=2");
      const { setFollowing } = await import("/community.js");
      await setFollowing(firebaseAuth.currentUser, id, false);
    }, tipster.uid)));
    await expect(page.locator("#followerCount")).toHaveText("0");
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});
