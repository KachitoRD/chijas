import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

const authRoot = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const root = "http://127.0.0.1:8080/v1/projects/demo-fijas-vivo/databases/(default)/documents";
const headers = { Authorization: "Bearer owner" };
const password = "Test-password-123!";
let accounts, paths, prefix, originalLimits;

function fields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key,
    value === null ? { nullValue: null }
      : value instanceof Date ? { timestampValue: value.toISOString() }
        : typeof value === "boolean" ? { booleanValue: value }
          : typeof value === "number" ? { doubleValue: value }
            : Array.isArray(value) ? { arrayValue: { values: value.map(stringValue => ({ stringValue })) } }
              : { stringValue: value }
  ]));
}
async function seed(request, path, data) {
  paths.add(path);
  const response = await request.patch(`${root}/${path}`, { headers, data: { fields: fields(data) } });
  expect(response.ok(), await response.text()).toBeTruthy();
}
async function signIn(page, name) {
  await page.goto("/user-profile.html");
  await page.evaluate(async account => {
    const { firebaseAuth } = await import("/firebase-config.js?v=2");
    const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    await signInWithEmailAndPassword(firebaseAuth, account.email, account.password);
  }, accounts[name]);
  await page.goto("/admin-dashboard.html");
  await expect(page.locator("#dashboard")).toBeVisible();
}
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ request, page }) => {
  prefix = `ac-${randomUUID().slice(0, 8)}`;
  accounts = {};
  paths = new Set();
  const limits = await request.get(`${root}/platformSettings/limits`, { headers });
  originalLimits = limits.ok() ? (await limits.json()).fields : null;
  for (const name of ["super", "admin", "viewer", "applicant"]) {
    const email = `${prefix}-${name}@example.test`;
    const response = await request.post(`${authRoot}/accounts:signUp?key=demo-key`, {
      data: { email, password, returnSecureToken: true }
    });
    expect(response.ok()).toBeTruthy();
    const account = await response.json();
    accounts[name] = { uid: account.localId, email, password, idToken: account.idToken };
    expect((await request.post(`${authRoot}/accounts:update?key=demo-key`, {
      headers, data: { localId: account.localId, emailVerified: true }
    })).ok()).toBeTruthy();
    await seed(request, `users/${account.localId}`, {
      uid: account.localId, role: "viewer", displayName: name, photoURL: null,
      email, created_at: new Date()
    });
    await seed(request, `legalAcceptances/${account.localId}/versions/2026-10-03`, {
      uid: account.localId, terms_version: "2026-10-03", privacy_version: "2026-10-03",
      age_confirmed: true, accepted_at: new Date()
    });
    paths.add(`viewerPresence/${account.localId}`);
  }
  await seed(request, `platformAdmins/${accounts.super.uid}`, { enabled: true, role: "super_admin" });
  await seed(request, `platformAdmins/${accounts.admin.uid}`, { enabled: true, role: "admin" });
  await seed(request, `tipsterApplications/${accounts.applicant.uid}`, {
    uid: accounts.applicant.uid, display_name: "Creador Core", email: accounts.applicant.email,
    requested_username: prefix, status: "pending", submitted_at: new Date(),
    reviewed_at: null, reviewed_by: null
  });
  await page.route(/https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/, route => route.abort());
});
test.afterEach(async ({ request }) => {
  for (const path of [...paths].sort((a, b) => b.split("/").length - a.split("/").length)) {
    expect((await request.delete(`${root}/${path}`, { headers })).ok()).toBeTruthy();
  }
  if (originalLimits) {
    expect((await request.patch(`${root}/platformSettings/limits`, {
      headers, data: { fields: originalLimits }
    })).ok()).toBeTruthy();
  } else expect((await request.delete(`${root}/platformSettings/limits`, { headers })).ok()).toBeTruthy();
  for (const account of Object.values(accounts)) {
    expect((await request.post(`${authRoot}/accounts:delete?key=demo-key`, {
      data: { idToken: account.idToken }
    })).ok()).toBeTruthy();
  }
});

for (const name of ["super", "admin"]) {
  test(`SPA conserva contexto viewer y monta administración nativa: ${name}`, async ({ page, request }) => {
    await page.goto("/");
    await page.evaluate(async account => {
      const { firebaseAuth } = await import("/firebase-config.js?v=2");
      const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
      await signInWithEmailAndPassword(firebaseAuth, account.email, account.password);
      globalThis.originalDocument = document;
      globalThis.originalFeed = document.getElementById("exploreFeed");
    }, accounts[name]);
    await expect(page.locator("#userMenuButton")).toBeVisible();
    await page.locator("#searchTipsters").fill("contexto");
    await page.locator("#userMenuButton").click();
    await page.locator("#userAdminLink").click();
    await expect(page.locator("#dashboardView #dashboard")).toBeVisible();
    if (name === "super") await expect(page.locator("#dashboardView #governance-tab")).toBeVisible();
    else await expect(page.locator("#dashboardView #governance-tab")).toBeHidden();
    const layout = await page.locator("#dashboardView #admin-shell").evaluate(element => ({
      display: getComputedStyle(element).display,
      contentWidth: Math.round(element.querySelector(".admin-workspace").getBoundingClientRect().width),
      titleHeight: Math.round(element.querySelector("#admin-page-title").getBoundingClientRect().height)
    }));
    expect(layout.display).toBe("block");
    expect(layout.contentWidth).toBeGreaterThan(400);
    expect(layout.titleHeight).toBeLessThan(40);
    for (const width of [1280, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const responsive = await page.locator("#dashboardView").evaluate(element => ({
        width: document.documentElement.scrollWidth,
        viewport: innerWidth,
        shellDisplay: getComputedStyle(element.querySelector("#admin-shell")).display,
        workspaceWidth: element.querySelector(".admin-workspace").getBoundingClientRect().width
      }));
      expect(responsive.width).toBeLessThanOrEqual(responsive.viewport);
      expect(responsive.shellDisplay).toBe("block");
      expect(responsive.workspaceWidth).toBeGreaterThan(280);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator("#dashboardView #viewers-tab").click();
    const ownViewer = page.locator(`#dashboardView [data-viewer="${accounts[name].uid}"] button[data-action="moderate-viewer"]`);
    await expect(ownViewer).toBeDisabled();
    await expect(ownViewer).toHaveAttribute("aria-describedby", "viewer-self-moderation-note");
    await expect(page.locator("#dashboardView #viewer-self-moderation-note")).toHaveText("No puedes suspender tu propia cuenta.");
    if (name === "super") {
      await page.locator("#dashboardView #governance-tab").click();
      const ownAdmin = page.locator(`#dashboardView [data-admin-row="${accounts[name].uid}"] button[data-action="edit-admin"]`);
      await expect(ownAdmin).toBeDisabled();
      await expect(ownAdmin).toHaveAttribute("aria-describedby", "admin-self-acl-note");
      await expect(page.locator("#dashboardView #admin-self-acl-note")).toBeVisible();
    }
    await expect(page.locator("#viewerMain")).toBeHidden();
    await expect(page.locator("#dashboardView iframe")).toHaveCount(0);
    await page.locator("#returnStreaming").click();
    await expect(page.locator("#viewerMain")).toBeVisible();
    await expect(page.locator("#searchTipsters")).toHaveValue("contexto");
    expect(await page.evaluate(() => document === globalThis.originalDocument
      && document.getElementById("exploreFeed") === globalThis.originalFeed)).toBeTruthy();
    await page.locator("#userMenuButton").click();
    await page.locator("#userAdminLink").click();
    await expect(page.locator("#dashboardView #dashboard")).toBeVisible();
    if (name === "super") {
      await page.locator("#dashboardView #finance-tab").click();
      await expect(page.locator("#dashboardView #settlement-process")).toBeDisabled();
      await expect(page.locator("#dashboardView #settlement-process")).toHaveAttribute("aria-describedby", "settlement-readiness");
      await expect(page.locator("#dashboardView #premium-product-action")).toHaveAttribute("aria-describedby", "premium-product-status");
    } else await expect(page.locator("#dashboardView #finance-tab")).toBeHidden();
    expect((await request.patch(`${root}/platformAdmins/${accounts[name].uid}?updateMask.fieldPaths=enabled`, {
      headers, data: { fields: { enabled: { booleanValue: false } } }
    })).ok()).toBeTruthy();
    await expect(page.locator("#dashboardView")).toBeHidden();
    await expect(page.locator("#userAdminLink")).toBeHidden();
    await expect(page.locator("#viewerMain")).toBeVisible();
  });
}

for (const name of ["viewer", "admin", "super"]) {
  test(`configuración base viewer persiste sin cambiar permisos: ${name}`, async ({ page }) => {
    paths.add(`users/${accounts[name].uid}/settings/profile`);
    await page.goto("/");
    await page.evaluate(async account => {
      const { firebaseAuth } = await import("/firebase-config.js?v=2");
      const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
      await signInWithEmailAndPassword(firebaseAuth, account.email, account.password);
    }, accounts[name]);
    await page.locator("#userMenuButton").click();
    await page.locator("#viewerAccount").click();
    await expect(page.locator("#dashboardView #accountSettingsForm")).toBeVisible();
    await page.locator("#accountName").fill("Mi identidad viewer");
    await page.locator("#accountBio").fill("Sigo fútbol y tenis.");
    await page.locator("#accountAvatar").fill("https://example.test/avatar.png");
    await page.locator("#accountTheme").selectOption("contrast");
    await page.locator("#accountNotifications").uncheck();
    await page.locator("#saveAccountSettings").click();
    await expect(page.locator("#accountSettingsMessage")).toHaveText("Configuración guardada.");
    await expect(page.locator("#viewerName")).toHaveText("Mi identidad viewer");
    await expect(page.locator("body")).toHaveAttribute("data-viewer-theme", "contrast");
    await page.locator("#returnStreaming").click();
    await expect(page.locator("#viewerMain")).toBeVisible();
    await page.reload();
    await page.locator("#userMenuButton").click();
    await page.locator("#viewerAccount").click();
    await expect(page.locator("#accountBio")).toHaveValue("Sigo fútbol y tenis.");
    await expect(page.locator("#accountNotifications")).not.toBeChecked();
    const attacks = await page.evaluate(async otherUid => {
      const { firebaseDb } = await import("/firebase-config.js?v=2");
      const { doc, updateDoc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
      const { firebaseAuth } = await import("/firebase-config.js?v=2");
      const own = doc(firebaseDb, "users", firebaseAuth.currentUser.uid, "settings", "profile");
      const attempts = [
        () => updateDoc(own, { role: "super_admin" }),
        () => updateDoc(own, { bio: "x".repeat(281) }),
        () => updateDoc(own, { photoURL: "javascript:alert(1)" }),
        () => updateDoc(own, { theme: "invalid" }),
        () => updateDoc(own, { notifications: "true" }),
        () => getDoc(doc(firebaseDb, "users", otherUid, "settings", "profile"))
      ];
      return Promise.all(attempts.map(async attempt => {
        try { await attempt(); return "allowed"; } catch (error) { return error.code; }
      }));
    }, accounts.applicant.uid);
    expect(attacks).toEqual(Array(6).fill("permission-denied"));
    await expect(page.locator("#userAdminLink")).toBeHidden();
    await page.locator("#userMenuButton").click();
    if (name === "viewer") await expect(page.locator("#userAdminLink")).toBeHidden();
    else await expect(page.locator("#userAdminLink")).toBeVisible();
  });
}

test("SPA tipster monta picks, bankroll y OBS con la sesión común", async ({ page, request }) => {
  await signIn(page, "super");
  await page.evaluate(async uid => {
    const { reviewApplication } = await import("/admin-services.js");
    await reviewApplication(uid, true);
    const { firebaseAuth } = await import("/firebase-config.js?v=2");
    const { signOut } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    await signOut(firebaseAuth);
  }, accounts.applicant.uid);
  for (const collection of ["perfiles", "perfiles_social", "presencia"]) paths.add(`${collection}/${accounts.applicant.uid}`);
  paths.add(`usernames/${prefix}`);
  for (const [suffix, status, odds] of [["pending", "pending", 2], ["won", "won", 3], ["lost", "lost", 4]]) {
    await seed(request, `picks/${prefix}-${suffix}`, {
      user_id: accounts.applicant.uid, event: "Evento KPI", selection: "Selección",
      sport: "futbol", bookmaker: "betano", odds, status, created_at: new Date(),
      event_date: new Date(), show_on_stream: false
    });
  }
  await seed(request, `picks/${prefix}-outside-range`, {
    user_id: accounts.applicant.uid, event: "Evento fuera del período", selection: "Selección",
    sport: "futbol", bookmaker: "betano", odds: 100, status: "pending",
    created_at: new Date(), event_date: new Date(Date.now() + 86400000), show_on_stream: false
  });
  await page.goto("/");
  await page.evaluate(async account => {
    const { firebaseAuth } = await import("/firebase-config.js?v=2");
    const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    await signInWithEmailAndPassword(firebaseAuth, account.email, account.password);
  }, accounts.applicant);
  await page.locator("#userMenuButton").click();
  const cropperRequests = [];
  page.on("request", request => {
    if (request.url().includes("cdnjs.cloudflare.com/ajax/libs/cropperjs/")) cropperRequests.push(request.url());
  });
  await page.route("https://cdnjs.cloudflare.com/ajax/libs/cropperjs/**", async route => {
    await new Promise(resolve => setTimeout(resolve, 6000));
    await route.continue();
  });
  await page.locator("#userTipsterLink").click();
  await expect(page.locator("#dashboardView #dashboard")).toBeVisible();
  expect(cropperRequests).toEqual([]);
  await expect(page.locator("#dashboardView #pickForm")).toBeVisible();
  await expect(page.locator("#tipsterActivePicks")).toHaveText("1");
  await expect(page.locator("#tipsterWinRate")).toHaveText("50.00 %");
  await expect(page.locator("#tipsterAverageOdds")).toHaveText("3.00");
  await expect(page.locator("#myPicks")).not.toContainText("Evento fuera del período");
  await expect(page.locator("#dashboardView #bankrollSummary")).toBeAttached();
  await expect(page.locator("#dashboardView #widgetPreviewFrame")).toBeAttached();
  await page.locator("#profileTab").click();
  await page.locator("#avatarFile").setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=", "base64")
  });
  await expect(page.locator("#profileMessage")).toContainText("Cargando el editor de imágenes…");
  await expect.poll(() => page.evaluate(() => typeof window.Cropper), { timeout: 15000 }).toBe("function");
  await expect(page.locator("#cropModal")).toBeVisible();
  await expect(page.locator("#cropModal .cropper-container")).toBeVisible();
  await page.locator("#cancelCrop").click();
  await page.locator("#returnStreaming").click();
  await expect(page.locator("#viewerMain")).toBeVisible();
  await expect(page.locator("#tipsterAuth")).toHaveCount(0);
  await page.locator("#userMenuButton").click();
  await page.locator("#userTipsterLink").click();
  await expect(page.locator("#dashboardView #dashboard")).toBeVisible();
  expect((await request.patch(`${root}/perfiles/${accounts.applicant.uid}?updateMask.fieldPaths=tipster_status`, {
    headers, data: { fields: { tipster_status: { stringValue: "revoked" } } }
  })).ok()).toBeTruthy();
  await expect(page.locator("#dashboardView")).toBeHidden();
  await expect(page.locator("#userTipsterLink")).toBeHidden();
  await expect(page.locator("#tipsterAuth")).toHaveCount(0);
});

test("métricas base viewer cuentan usuarios y distinguen moderación pendiente", async ({ page }) => {
  await signIn(page, "admin");
  const total = await page.evaluate(async () => {
    const { firebaseDb } = await import("/firebase-config.js?v=2");
    const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    return (await getDocs(query(collection(firebaseDb, "users"), where("role", "==", "viewer")))).size;
  });
  await expect(page.locator("#total-users")).toHaveText(String(total));
  await page.locator("#viewers-tab").click();
  await expect(page.locator("#communityModerationStatus")).toContainText("pendiente");
  await expect(page.locator("#communityModerationStatus")).toContainText("demo local");
});

test("fijas canónicas y legacy liquidan cashout sin publicar bankroll ni reabrir resultados", async ({ page, request }) => {
  await signIn(page, "super");
  await page.evaluate(async uid => {
    const { reviewApplication } = await import("/admin-services.js");
    await reviewApplication(uid, true);
    const { firebaseAuth } = await import("/firebase-config.js?v=2");
    const { signOut } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    await signOut(firebaseAuth);
  }, accounts.applicant.uid);
  for (const collection of ["perfiles", "perfiles_social", "presencia"]) paths.add(`${collection}/${accounts.applicant.uid}`);
  paths.add(`usernames/${prefix}`);
  const legacyId = `${prefix}-legacy`;
  await seed(request, `picks/${legacyId}`, {
    user_id: accounts.applicant.uid, fecha_evento: new Date(Date.now() - 3600000),
    deporte: "tenis", evento: "Historial preservado", seleccion: "A", prediccion: "A", cuota: 2,
    casa_de_apuestas: "betano", casa_apuestas: "betano", confianza: null, nota: null,
    destacada: false, show_on_stream: false, estado: "pendiente", created_at: new Date()
  });
  await page.goto("/");
  await page.evaluate(async account => {
    const { firebaseAuth } = await import("/firebase-config.js?v=2");
    const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    await signInWithEmailAndPassword(firebaseAuth, account.email, account.password);
  }, accounts.applicant);
  await page.locator("#userMenuButton").click();
  await page.locator("#userTipsterLink").click();
  await expect(page.locator("#myPicks")).toContainText("Historial preservado");
  const before = await request.get(`${root}/picks/${legacyId}`, { headers });
  expect((await before.json()).fields.estado.stringValue).toBe("pendiente");
  await page.locator("#event").fill("Fija nueva canónica");
  await page.locator("#league").fill("Liga de prueba");
  await page.locator("#market").fill("Más/Menos");
  await page.locator("#selection").fill("Más de 2.5 goles");
  await page.locator("#odds").fill("2");
  await page.locator("#publicStake").fill("2");
  await page.locator("#stakeAmount").fill("100");
  await page.locator("#note").fill("Análisis público detallado.");
  await page.locator("#eventDate").fill(new Date(Date.now() + 3600000).toLocaleString("sv-SE").replace(" ", "T").slice(0, 16));
  await page.locator("#savePickButton").click();
  await page.locator("#confirmPickPublication").click();
  await expect(page.locator("#pickMessage")).toHaveText("Pronóstico publicado.");
  const created = await page.evaluate(async () => {
    const { firebaseDb, firebaseAuth } = await import("/firebase-config.js?v=2");
    const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const snapshots = await getDocs(query(collection(firebaseDb, "picks"), where("user_id", "==", firebaseAuth.currentUser.uid)));
    const item = snapshots.docs.find(item => item.data().event === "Fija nueva canónica");
    return { id: item.id, keys: Object.keys(item.data()) };
  });
  paths.add(`picks/${created.id}`);
  paths.add(`picks/${created.id}/private/bankroll`);
  expect(created.keys).toEqual(expect.arrayContaining(["event_date", "sport", "league", "market", "selection", "odds", "stake", "bookmaker", "analysis", "status"]));
  expect(created.keys.some(key => ["fecha_evento", "event_start_at", "estado", "cuota", "stakeAmount", "returnAmount"].includes(key))).toBeFalsy();
  const row = page.locator("#myPicks tr").filter({ hasText: "Fija nueva canónica" });
  await row.locator(".pick-action-trigger").click();
  const popup = page.locator(".pick-action-popup:popover-open");
  await popup.locator("summary").filter({ hasText: "Cerrar anticipadamente" }).click();
  await popup.locator('[name="cashoutOdds"]').fill("0.75");
  await popup.locator('[name="returnAmount"]').fill("125");
  await popup.locator('form[data-cash-out-id] button').click();
  await expect(page.locator("#tipsterYield")).toHaveText("-25.00 %");
  const result = await page.evaluate(async id => {
    const { firebaseDb } = await import("/firebase-config.js?v=2");
    const { doc, getDoc, setDoc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const { normalizePick, canonicalPick } = await import("/pick-schema.js");
    const ref = doc(firebaseDb, "picks", id);
    const raw = (await getDoc(ref)).data();
    let frozen;
    try { await updateDoc(ref, { odds: 100 }); frozen = "allowed"; } catch (error) { frozen = error.code; }
    await setDoc(ref, canonicalPick({ ...normalizePick(raw), status: "won" }));
    return frozen;
  }, legacyId);
  expect(result).toBe("permission-denied");
  const legacyAfter = (await (await request.get(`${root}/picks/${legacyId}`, { headers })).json()).fields;
  expect(legacyAfter.status.stringValue).toBe("won");
  expect(legacyAfter.stake.nullValue).toBeNull();
  expect(legacyAfter.estado).toBeUndefined();
  const closed = (await (await request.get(`${root}/picks/${created.id}`, { headers })).json()).fields;
  expect(closed.status.stringValue).toBe("cashed_out");
  expect(Number(closed.cashout_odds.doubleValue)).toBe(0.75);
  expect(closed.returnAmount).toBeUndefined();
  const privateFields = (await (await request.get(`${root}/picks/${created.id}/private/bankroll`, { headers })).json()).fields;
  expect(Number(privateFields.returnAmount.doubleValue ?? privateFields.returnAmount.integerValue)).toBe(125);
  const restrictions = await page.evaluate(async id => {
    const { firebaseDb } = await import("/firebase-config.js?v=2");
    const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const attempts = [
      { status: "pending" }, { stakeAmount: 100 }, { cashout_odds: 4 }, { stake: 10 }
    ];
    return Promise.all(attempts.map(async data => {
      try { await updateDoc(doc(firebaseDb, "picks", id), data); return "allowed"; } catch (error) { return error.code; }
    }));
  }, created.id);
  expect(restrictions).toEqual(Array(4).fill("permission-denied"));
});

test("SPA viewer ignora users.role, rechaza rutas privadas y mantiene salida accesible", async ({ page, request }) => {
  await seed(request, `users/${accounts.viewer.uid}`, {
    uid: accounts.viewer.uid, role: "super_admin", email: accounts.viewer.email,
    displayName: "Rol no autoritativo", photoURL: null, created_at: new Date()
  });
  await page.goto("/#view=admin");
  await page.evaluate(async account => {
    const { firebaseAuth } = await import("/firebase-config.js?v=2");
    const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    await signInWithEmailAndPassword(firebaseAuth, account.email, account.password);
  }, accounts.viewer);
  await expect(page.locator("#userMenuRole")).toHaveText("Viewer");
  await expect(page.locator("#userAdminLink")).toBeHidden();
  await expect(page.locator("#userTipsterLink")).toBeHidden();
  await expect(page.locator("#dashboardView")).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  await page.locator("#userMenuButton").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#userMenu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#userMenu")).toBeHidden();
  await expect(page.locator("#userMenuButton")).toBeFocused();
  await page.locator("#userMenuButton").click();
  await page.locator("#viewerLogout").click();
  await expect(page.locator("#userMenuButton")).toBeHidden();
  await expect(page.locator("#viewerLogin")).toBeVisible();
  await expect(page.locator("#viewerMain")).toBeVisible();
});

test("SPA restaura historial y sesión, respeta mobile y cierra panel al salir", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.evaluate(async account => {
    const { firebaseAuth } = await import("/firebase-config.js?v=2");
    const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    await signInWithEmailAndPassword(firebaseAuth, account.email, account.password);
  }, accounts.super);
  await page.locator("#userMenuButton").click();
  await page.locator("#userAdminLink").click();
  await expect(page.locator("#dashboardView #dashboard")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#viewerMain")).toBeVisible();
  await page.goForward();
  await expect(page.locator("#dashboardView #dashboard")).toBeVisible();
  await page.reload();
  await expect(page.locator("#dashboardView #dashboard")).toBeVisible();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await expect(page.locator("#returnStreaming")).toBeInViewport();
    await expect(page.locator("#userMenuButton")).toBeInViewport();
  }
  await page.locator("#userMenuButton").click();
  await page.locator("#viewerLogout").click();
  await expect(page.locator("#dashboardView")).toBeHidden();
  await expect(page.locator("#viewerMain")).toBeVisible();
  await expect(page.locator("#dashboard")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("SPA cancela carga pendiente al regresar sin montar listeners tardíos", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async account => {
    const { firebaseAuth } = await import("/firebase-config.js?v=2");
    const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    await signInWithEmailAndPassword(firebaseAuth, account.email, account.password);
  }, accounts.super);
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route("**/admin-dashboard.html", async route => {
    await held;
    await route.continue();
  });
  await page.locator("#userMenuButton").click();
  await page.locator("#userAdminLink").click();
  await expect(page.locator("#dashboardView")).toBeVisible();
  await page.locator("#returnStreaming").click();
  release();
  await expect(page.locator("#viewerMain")).toBeVisible();
  await expect(page.locator("#dashboardViewContent")).toBeEmpty();
  await expect(page).toHaveURL(/\/$/);
});

test("solo super_admin puede leer o actualizar comisiones mediante SDK", async ({ page, request }) => {
  await seed(request, `perfiles/${accounts.applicant.uid}`, { tipster_status: "approved" });
  await seed(request, `tipsterFinance/${accounts.applicant.uid}`, {
    takeRate: 12.5, updated_at: new Date(), updated_by: accounts.super.uid
  });
  await seed(request, `platformAdmins/${accounts.admin.uid}`, {
    enabled: true, role: "admin", permissions: ["kpis"]
  });
  for (const name of ["admin", "viewer", "applicant", "super"]) {
    await page.goto("/user-profile.html");
    const results = await page.evaluate(async ({ account, uid }) => {
      const { firebaseAuth, firebaseDb } = await import("/firebase-config.js?v=2");
      const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
      const { doc, collection, getDoc, getDocs, updateDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
      await signInWithEmailAndPassword(firebaseAuth, account.email, account.password);
      const ref = doc(firebaseDb, "tipsterFinance", uid);
      const results = [];
      for (const operation of [
        () => getDoc(ref),
        () => getDocs(collection(firebaseDb, "tipsterFinance")),
        () => updateDoc(ref, { takeRate: 15, updated_at: serverTimestamp(), updated_by: firebaseAuth.currentUser.uid })
      ]) {
        try { await operation(); results.push("allowed"); }
        catch (error) { results.push(error.code); }
      }
      return results;
    }, { account: accounts[name], uid: accounts.applicant.uid });
    expect(results, name).toEqual(Array(3).fill(name === "super" ? "allowed" : "permission-denied"));
  }
});

test("admin operativo no gobierna límites ni ACL ni comisiones, incluso llamando SDK", async ({ page }) => {
  await signIn(page, "admin");
  await expect(page.locator("#admin-tabs")).toBeVisible();
  await expect(page.locator("#governance-tab")).toBeHidden();
  await expect(page.locator("#settingsForm")).toBeHidden();
  const results = await page.evaluate(async uid => {
    const { firebaseDb, firebaseAuth } = await import("/firebase-config.js?v=2");
    const { doc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const results = [];
    for (const [path, data] of [
      [["platformSettings", "limits"], { tipsterMonthlyPickLimit: 55, viewerMonthlyPickLimit: 20, updated_at: serverTimestamp(), updated_by: firebaseAuth.currentUser.uid }],
      [["platformAdmins", uid], { enabled: true, role: "super_admin" }],
      [["tipsterFinance", uid], { takeRate: 10, updated_at: serverTimestamp(), updated_by: firebaseAuth.currentUser.uid }]
    ]) {
      try { await setDoc(doc(firebaseDb, ...path), data); results.push("allowed"); }
      catch (error) { results.push(error.code); }
    }
    return results;
  }, accounts.viewer.uid);
  expect(results).toEqual(["permission-denied", "permission-denied", "permission-denied"]);
});

test("super administra ACL granular, límites y evita su propio bloqueo", async ({ page, request }) => {
  await signIn(page, "super");
  await expect(page.locator("#online-viewers")).not.toHaveText("Cargando…");
  const connectedBefore = Number(await page.locator("#online-viewers").textContent());
  await page.locator("#governance-tab").click();
  await page.locator("#tipsterLimit").fill("75");
  await page.locator("#viewerLimit").fill("25");
  await seed(request, `viewerPresence/${accounts.viewer.uid}`, {
    uid: accounts.viewer.uid, is_online: true, last_active_at: new Date()
  });
  await expect(page.locator("#online-viewers")).toHaveText(String(connectedBefore + 1));
  await expect(page.locator("#tipsterLimit")).toHaveValue("75");
  await expect(page.locator("#viewerLimit")).toHaveValue("25");
  await page.locator("#settingsForm button").click();
  await expect(page.locator("#admin-message")).toContainText("Límites guardados");
  await page.locator("#adminUid").fill(accounts.viewer.uid);
  await page.locator("#adminRole").selectOption("admin");
  await page.locator('#roleForm input[value="viewers"]').uncheck();
  await page.locator("#roleForm button[type=submit]").click();
  await expect(page.locator("#admin-message")).toContainText("Permisos guardados");
  paths.add(`platformAdmins/${accounts.viewer.uid}`);
  const denied = await page.evaluate(async () => {
    const { firebaseDb, firebaseAuth } = await import("/firebase-config.js?v=2");
    const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    try {
      await updateDoc(doc(firebaseDb, "platformAdmins", firebaseAuth.currentUser.uid), { enabled: false });
      return "allowed";
    } catch (error) { return error.code; }
  });
  expect(denied).toBe("permission-denied");
  await page.evaluate(async () => {
    const { firebaseAuth } = await import("/firebase-config.js?v=2");
    const { signOut } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    await signOut(firebaseAuth);
  });
  await signIn(page, "viewer");
  await expect(page.locator("#viewers-tab")).toBeHidden();
  await expect(page.locator("#operations-tab")).toBeVisible();
  const cannotList = await page.evaluate(async () => {
    const { firebaseDb } = await import("/firebase-config.js?v=2");
    const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    try { await getDocs(collection(firebaseDb, "users")); return "allowed"; }
    catch (error) { return error.code; }
  });
  expect(cannotList).toBe("permission-denied");
});

test("aprobación, métricas públicas y takeRate persistente sin inventar ingresos", async ({ page, request }) => {
  await signIn(page, "super");
  await page.locator("#operations-tab").click();
  const application = page.locator(`[data-application="${accounts.applicant.uid}"]`);
  await expect(application).toBeVisible();
  await application.getByRole("button", { name: "Aprobar", exact: true }).click();
  await expect(application).toHaveCount(0);
  for (const collection of ["perfiles", "perfiles_social", "presencia"]) paths.add(`${collection}/${accounts.applicant.uid}`);
  paths.add(`usernames/${prefix}`);
  await page.locator("#finance-tab").click();
  const finance = page.locator(`[data-finance="${accounts.applicant.uid}"]`);
  await expect(page.locator("#finance-readiness")).toContainText("ledger contable");
  await finance.locator('input[name="takeRate"]').fill("12.5");
  await finance.locator("button").click();
  await expect(page.locator("#admin-message")).toContainText("Comisión guardada");
  paths.add(`tipsterFinance/${accounts.applicant.uid}`);
  const saved = await request.get(`${root}/tipsterFinance/${accounts.applicant.uid}`, { headers });
  expect(Number((await saved.json()).fields.takeRate.doubleValue)).toBe(12.5);
  await page.locator("#metrics-tab").click();
  await expect(page.locator("#stake-units")).toContainText("u");
  await expect(page.getByText(/no son dinero, volumen apostado verificable/)).toBeVisible();
  await expect(page.locator("#total-picks")).not.toHaveText("Cargando…");
  const before = Number(await page.locator("#total-picks").textContent());
  await seed(request, `picks/${prefix}-win`, {
    user_id: accounts.applicant.uid, event: "Pronóstico KPI", status: "won"
  });
  await expect(page.locator("#total-picks")).toHaveText(String(before + 1));
  const picks = await (await request.get(`${root}/picks?pageSize=10000`, { headers })).json();
  const statuses = picks.documents.map(item => item.fields.status?.stringValue ?? item.fields.estado?.stringValue);
  const wins = statuses.filter(value => ["won", "ganada"].includes(value)).length;
  const losses = statuses.filter(value => ["lost", "perdida"].includes(value)).length;
  await expect(page.locator("#win-rate")).toHaveText(`${(100 * wins / (wins + losses)).toFixed(2)} %`);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
});

test("dashboard ejecutivo conserva KPIs, acceso por pestañas y adaptabilidad", async ({ page }) => {
  await signIn(page, "super");
  await expect(page.locator("#admin-shell")).toBeVisible();
  await expect(page.locator("#admin-sidebar")).toBeVisible();
  await expect(page.locator("#admin-page-title")).toHaveText("Resumen ejecutivo");
  await expect(page.locator("#admin-live-status")).toContainText("Actualizado");
  await expect(page.getByText("Operación", { exact: true })).toBeVisible();
  await expect(page.getByText("Cuentas", { exact: true })).toBeVisible();
  await expect(page.getByText("Control y finanzas", { exact: true })).toBeVisible();
  await expect(page.locator("#executive-kpis")).toBeVisible();
  await expect(page.locator("#executive-volume")).not.toHaveText("Cargando…");
  await expect(page.locator("#executive-revenue")).toContainText("No disponible");
  await page.locator("#finance-tab").click();
  await expect(page.locator("#finance-panel")).toBeVisible();
  await expect(page.locator("#admin-page-title")).toHaveText("Configuración financiera");
  await expect(page.locator("#executive-kpis")).toBeHidden();
  await expect(page.locator("#executive-scope-note")).toBeHidden();
  await expect(page.locator("#metrics-panel")).toBeHidden();
  await page.locator("#metrics-tab").click();
  await expect(page.locator("#metrics-panel")).toBeVisible();
  await expect(page.locator("#admin-page-title")).toHaveText("Resumen ejecutivo");
  await expect(page.locator("#executive-kpis")).toBeVisible();
  await expect(page.locator("#review-queue")).toBeVisible();

  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const shell = await page.locator("#admin-shell").evaluate(element => ({
      display: getComputedStyle(element).display,
      columns: getComputedStyle(element).gridTemplateColumns
    }));
    expect(shell.display).toBe(width <= 700 ? "block" : "grid");
    if (width > 700) expect(shell.columns.split(" ").length).toBe(2);
  }
});

test("centro financiero configura el reparto y mantiene inactivos los módulos sin backend de monetización", async ({ page, request }) => {
  const uid = accounts.applicant.uid;
  await seed(request, `perfiles/${uid}`, {
    id: uid, username: prefix, nombre_publico: "Creador Monetización", bio: null,
    tipster_status: "approved", followerCount: 0, color_primario: "#34d399",
    is_online: false, last_active_at: null, created_at: new Date()
  });
  await seed(request, `tipsterFinance/${uid}`, {
    takeRate: 30, updated_at: new Date(), updated_by: accounts.super.uid
  });

  await signIn(page, "super");
  await page.locator("#finance-tab").click();
  await expect(page.locator("#finance-readiness")).toContainText("Configuración disponible");
  await expect(page.locator("#finance-configured-rates")).toHaveText(/\d+ de \d+/);

  const row = page.locator(`[data-finance="${uid}"]`);
  await expect(row).toContainText("Plataforma 30 %");
  await expect(row).toContainText("Tipster 70 %");
  await row.locator('input[name="takeRate"]').fill("18");
  await expect(row.locator("[data-share-preview]")).toContainText("Plataforma 18 % · Tipster 82 %");
  const unchangedRate = await request.get(`${root}/tipsterFinance/${uid}`, { headers });
  expect(Number((await unchangedRate.json()).fields.takeRate.doubleValue)).toBe(30);
  await page.locator("#financeSearch").fill("Creador Monetización");
  await page.locator("#financeRateFilter").selectOption("configured");
  await expect(row).toBeVisible();
  await page.locator("#financeRateFilter").selectOption("missing");
  await expect(row).toBeHidden();
  await page.locator("#financeRateFilter").selectOption("configured");
  await page.reload();
  await page.locator("#finance-tab").click();
  await expect(page.locator("#financeSearch")).toHaveValue("Creador Monetización");
  await expect(page.locator("#financeRateFilter")).toHaveValue("configured");
  await expect(page.locator(`[data-finance="${uid}"]`)).toBeVisible();
  await page.locator("#finance-clear-filters").click();
  await expect(page.locator("#financeSearch")).toHaveValue("");
  await expect(page.locator("#financeRateFilter")).toHaveValue("all");
  await expect(page.locator("#financeSort")).toHaveValue("name");
  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    expect(await page.locator(".admin-finance-filters").evaluate(element => element.scrollWidth <= element.clientWidth)).toBeTruthy();
  }

  await expect(page.locator("#settlement-readiness")).toContainText("Sin proveedor de pagos ni ledger");
  await expect(page.locator("#settlement-cycle")).toBeDisabled();
  await expect(page.locator("#settlement-process")).toBeDisabled();
  await expect(page.locator("#premium-product-status")).toContainText("Aún no disponible");
  await expect(page.locator("#premium-product-action")).toBeDisabled();
  await expect(page.locator("#settlement-history")).toContainText("No hay liquidaciones registradas");
});

test("directorio viewer filtra estado y busca por nombre público de cuenta", async ({ page, request }) => {
  await seed(request, `users/${accounts.viewer.uid}`, {
    uid: accounts.viewer.uid, role: "viewer", displayName: "Viewer Activo Fixture",
    email: accounts.viewer.email, status: "active", created_at: new Date("2026-10-01T12:00:00Z")
  });
  await seed(request, `users/${accounts.applicant.uid}`, {
    uid: accounts.applicant.uid, role: "viewer", displayName: "Viewer Suspendido Fixture",
    email: accounts.applicant.email, status: "suspended", created_at: new Date("2026-10-05T12:00:00Z")
  });
  for (const name of ["super", "admin"]) {
    await seed(request, `users/${accounts[name].uid}`, {
      uid: accounts[name].uid, role: "viewer", displayName: name,
      email: accounts[name].email, status: "active", created_at: new Date("2026-09-01T12:00:00Z")
    });
  }

  await signIn(page, "super");
  await page.locator("#viewers-tab").click();
  await expect(page.locator("#viewers-list table")).toBeVisible();
  await expect(page.locator("#viewerStatusFilter")).toBeVisible();
  await page.locator("#viewerSearch").fill("Viewer Suspendido Fixture");
  const suspended = page.locator(`[data-viewer="${accounts.applicant.uid}"]`);
  await expect(suspended).toContainText("Suspendido");
  await expect(page.locator("#viewers-list tbody tr")).toHaveCount(1);

  await page.locator("#viewerStatusFilter").selectOption("active");
  await expect(page.locator("#viewers-list tbody [data-viewer]")).toHaveCount(0);
  await expect(page.locator("#viewers-list tbody")).toContainText("Ninguna cuenta coincide");
  await page.locator("#viewerSearch").fill("");
  await page.locator("#viewerStatusFilter").selectOption("all");
  await page.locator("#viewerSort").selectOption("newest");
  const rows = page.locator("#viewers-list tbody tr[data-viewer]");
  const dates = await rows.evaluateAll(items => items.map(item => item.dataset.createdAt));
  expect(dates).toEqual([...dates].sort((left, right) => right.localeCompare(left)));
  await page.reload();
  await page.locator("#viewers-tab").click();
  await expect(page.locator("#viewerSort")).toHaveValue("newest");
  const restoredDates = await page.locator("#viewers-list tbody tr[data-viewer]").evaluateAll(items => items.map(item => item.dataset.createdAt));
  expect(restoredDates).toEqual([...restoredDates].sort((left, right) => right.localeCompare(left)));
  await page.locator("#viewer-clear-filters").click();
  await expect(page.locator("#viewerSearch")).toHaveValue("");
  await expect(page.locator("#viewerStatusFilter")).toHaveValue("all");
  await expect(page.locator("#viewerSort")).toHaveValue("name");
  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    expect(await page.locator(".admin-viewer-filters").evaluate(element => element.scrollWidth <= element.clientWidth)).toBeTruthy();
    if (width === 390) {
      const buttonBox = await page.locator(`[data-viewer="${accounts.applicant.uid}"] button`).boundingBox();
      expect(buttonBox.x).toBeGreaterThanOrEqual(0);
      expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(width);
    }
  }
});

test("la portada unifica colas pendientes y permite filtrar y abrir la tarea correcta", async ({ page, request }) => {
  const requestId = `${prefix}-profile-review`;
  const oldDate = new Date(Date.now() - 10 * 86400000);
  await seed(request, `perfilSolicitudes/${requestId}`, {
    uid: accounts.applicant.uid, estado: "pendiente", motivoRechazo: null,
    created_at: oldDate, revisado_at: null, revisado_por: null
  });
  await seed(request, `perfilSolicitudesPendientes/${accounts.applicant.uid}`, {
    uid: accounts.applicant.uid, solicitud_id: requestId, created_at: oldDate
  });

  await signIn(page, "super");
  await expect(page.locator("#metrics-tab")).toHaveAttribute("aria-selected", "true");
  const queue = page.locator("#review-queue");
  const applicantReview = queue.locator(`[data-review-item="${accounts.applicant.uid}"]`);
  const profileReview = queue.locator(`[data-review-item="${requestId}"]`);
  await expect(applicantReview).toContainText("Creador Core");
  await expect(profileReview).toContainText("Solicitud de perfil");

  await page.locator("#reviewAgeFilter").selectOption("older7d");
  await expect(profileReview).toBeVisible();
  await expect(queue.locator("[data-review-kind=tipster]")).toHaveCount(0);
  await page.locator("#reviewSearch").fill("Creador Core");
  await expect(queue.locator("[data-review-kind=profile]")).toHaveCount(0);

  await page.locator("#reviewAgeFilter").selectOption("all");
  await page.locator("#reviewSearch").fill("Creador Core");
  await applicantReview.locator("[data-action=go-to-review]").click();
  await expect(page.locator("#operations-panel")).toBeVisible();
  await expect(page.locator(`[data-application="${accounts.applicant.uid}"]`)).toBeVisible();
});

test("gestión de tipsters filtra perfiles aprobados por estado, volumen y rendimiento", async ({ page, request }) => {
  const uid = accounts.applicant.uid;
  await seed(request, `perfiles/${uid}`, {
    id: uid, username: prefix, nombre_publico: "Creador Ejecutivo", bio: null,
    tipster_status: "approved", followerCount: 0, color_primario: "#34d399",
    is_online: false, last_active_at: null, created_at: new Date()
  });
  for (const [suffix, status, stake] of [["win", "won", 2], ["loss", "lost", 1]]) {
    await seed(request, `picks/${prefix}-filter-${suffix}`, {
      user_id: uid, created_at: new Date(), event_date: new Date(Date.now() + 86400000),
      sport: "futbol", event: `${suffix} fixture`, league: "Liga", market: "Resultado",
      selection: "Local", odds: 2, stake, bookmaker: "otra", analysis: "",
      status, confianza: null, destacada: false, show_on_stream: false
    });
  }

  await signIn(page, "super");
  await page.locator("#operations-tab").click();
  const row = page.locator(`[data-tipster-row="${uid}"]`);
  await expect(row).toBeVisible();
  await page.locator("#tipsterStatusFilter").selectOption("approved");
  await page.locator("#tipsterSearch").fill("Creador Ejecutivo");
  await page.locator("#tipsterVolumeFilter").selectOption("10");
  await expect(row).toBeHidden();
  await page.locator("#tipsterVolumeFilter").selectOption("1");
  await page.locator("#tipsterPerformanceFilter").selectOption("positive");
  await expect(row).toBeVisible();
  await page.locator("#tipsterPerformanceFilter").selectOption("negative");
  await expect(row).toBeHidden();
  await page.locator("#tipsterStatusFilter").selectOption("revoked");
  await page.locator("#tipsterPerformanceFilter").selectOption("all");
  await expect(row).toBeHidden();
  await page.locator("#tipsterStatusFilter").selectOption("approved");
  await page.locator("#tipsterSearch").fill("Creador Ejecutivo");
  await page.locator("#tipsterVolumeFilter").selectOption("10");
  await page.reload();
  await expect(page.locator("#tipsterSearch")).toHaveValue("Creador Ejecutivo");
  await expect(page.locator("#tipsterVolumeFilter")).toHaveValue("10");
});

test("el informe global filtra volumen y resultado en unidades por fecha de publicación", async ({ page, request }) => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);
  const outsidePeriod = new Date(today);
  outsidePeriod.setDate(outsidePeriod.getDate() - 45);
  for (const [suffix, data] of [
    ["finance-won", { created_at: yesterday, status: "won", stake: 2, odds: 2 }],
    ["finance-lost", { created_at: todayEnd, status: "lost", stake: 1, odds: 1.8 }],
    ["finance-outside", { created_at: outsidePeriod, status: "won", stake: 100, odds: 2 }]
  ]) {
    await seed(request, `picks/${prefix}-${suffix}`, {
      user_id: accounts.applicant.uid, event: suffix, ...data
    });
  }

  await signIn(page, "super");
  await page.locator("#financePeriod").selectOption("custom");
  await page.locator("#financeFrom").fill(yesterday.toLocaleDateString("sv-SE"));
  await page.locator("#financeThrough").fill(today.toLocaleDateString("sv-SE"));
  await expect(page.locator("#stake-units")).toHaveText("3.00 u");
  await expect(page.locator("#net-result-units")).toHaveText("1.00 u");
  await expect(page.locator("#finance-chart svg")).toHaveAttribute("role", "img");
  await expect(page.getByText(/no son dinero, volumen apostado verificable/)).toBeVisible();
});

test("cambios de perfil conservan la reserva de username y registran rechazo", async ({ page, request }) => {
  await signIn(page, "super");
  await page.locator("#operations-tab").click();
  await page.locator(`[data-application="${accounts.applicant.uid}"]`).getByRole("button", { name: "Aprobar", exact: true }).click();
  const uid = accounts.applicant.uid;
  for (const collection of ["perfiles", "perfiles_social", "presencia"]) paths.add(`${collection}/${uid}`);
  paths.add(`usernames/${prefix}`);
  const requestId = `${prefix}-change`;
  await seed(request, `perfilSolicitudes/${requestId}`, {
    uid, estado: "pendiente", motivoRechazo: null, created_at: new Date(), revisado_at: null, revisado_por: null
  });
  const response = await request.patch(`${root}/perfilSolicitudes/${requestId}?updateMask.fieldPaths=cambios`, {
    headers, data: { fields: { cambios: { mapValue: { fields: {
      username: { stringValue: `${prefix}-new` }, nombre_publico: { stringValue: "Nombre revisado" }
    } } } } }
  });
  expect(response.ok()).toBeTruthy();
  await seed(request, `perfilSolicitudesPendientes/${uid}`, { uid, solicitud_id: requestId, created_at: new Date() });
  await page.locator("#profiles-tab").click();
  const card = page.locator(`[data-request="${requestId}"]`);
  await expect(card).toContainText(`Actual: ${prefix}`);
  await expect(card).toContainText(`Propuesto: ${prefix}-new`);
  await card.getByRole("button", { name: "Aprobar", exact: true }).click();
  await expect(card).toHaveCount(0);
  paths.add(`usernames/${prefix}-new`);
  const username = await request.get(`${root}/usernames/${prefix}-new`, { headers });
  expect((await username.json()).fields.uid.stringValue).toBe(uid);
  expect((await request.get(`${root}/usernames/${prefix}`, { headers })).status()).toBe(404);
  const second = `${prefix}-reject`;
  await seed(request, `perfilSolicitudes/${second}`, {
    uid, estado: "pendiente", motivoRechazo: null, created_at: new Date(), revisado_at: null, revisado_por: null
  });
  expect((await request.patch(`${root}/perfilSolicitudes/${second}?updateMask.fieldPaths=cambios`, {
    headers, data: { fields: { cambios: { mapValue: { fields: { bio: { stringValue: "Cambio rechazado" } } } } } }
  })).ok()).toBeTruthy();
  await seed(request, `perfilSolicitudesPendientes/${uid}`, { uid, solicitud_id: second, created_at: new Date() });
  const rejected = page.locator(`[data-request="${second}"]`);
  await rejected.locator("textarea").fill("Revisa el contenido");
  await rejected.getByRole("button", { name: "Rechazar", exact: true }).click();
  await expect(rejected).toHaveCount(0);
  const reviewed = await request.get(`${root}/perfilSolicitudes/${second}`, { headers });
  expect((await reviewed.json()).fields.estado.stringValue).toBe("rechazada");
});

test("moderación suspende acciones del viewer pero mantiene lectura pública", async ({ page }) => {
  await signIn(page, "admin");
  await page.locator("#viewers-tab").click();
  await page.locator("#viewerSearch").fill(accounts.viewer.email);
  const viewer = page.locator(`[data-viewer="${accounts.viewer.uid}"]`);
  await viewer.getByRole("button", { name: "Suspender", exact: true }).click();
  paths.add(`viewerPresence/${accounts.viewer.uid}`);
  await expect(viewer).toContainText("Suspendido");
  await page.evaluate(async () => {
    const { firebaseAuth } = await import("/firebase-config.js?v=2");
    const { signOut } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    await signOut(firebaseAuth);
  });
  await page.goto("/user-profile.html");
  await page.evaluate(async account => {
    const { firebaseAuth } = await import("/firebase-config.js?v=2");
    const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    await signInWithEmailAndPassword(firebaseAuth, account.email, account.password);
  }, accounts.viewer);
  await expect(page.locator("#auth-message")).toContainText("suspendida");
  const result = await page.evaluate(async () => {
    const { firebaseDb, firebaseAuth } = await import("/firebase-config.js?v=2");
    const { doc, setDoc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const results = [];
    try { await getDoc(doc(firebaseDb, "usernames", "unclaimed-rbac")); results.push("public"); }
    catch (error) { results.push(error.code); }
    try { await setDoc(doc(firebaseDb, "viewerPresence", firebaseAuth.currentUser.uid), { uid: firebaseAuth.currentUser.uid, is_online: true, last_active_at: new Date() }); results.push("allowed"); }
    catch (error) { results.push(error.code); }
    try { await setDoc(doc(firebaseDb, "users", firebaseAuth.currentUser.uid), { status: "active" }, { merge: true }); results.push("allowed"); }
    catch (error) { results.push(error.code); }
    return results;
  });
  expect(result).toEqual(["public", "permission-denied", "permission-denied"]);
});
